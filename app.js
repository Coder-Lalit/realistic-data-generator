const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const { generateRealisticData } = require('./lib/dataGenerator');
const GeneratedData = require('./lib/generatedDataModel');
const {
    isQueueEnabled,
    addGenerateDataJob,
    buildJobStatusResponse
} = require('./lib/jobQueue');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// REST API: behind Render/nginx, trust X-Forwarded-* so req.ip / secure flags are correct (set TRUST_PROXY=false to disable)
if (process.env.TRUST_PROXY !== 'false') {
    app.set('trust proxy', 1);
}

// Logging configuration
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LOG_LEVELS.INFO;
/** True when DEBUG is enabled — use in hot paths to avoid building log strings when off */
const LOG_DEBUG = CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG;

// Logging utilities
const logger = {
    error: (message) => {
        if (CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR) {
            console.error(`❌ [ERROR] ${new Date().toISOString()} - ${message}`);
        }
    },
    warn: (message) => {
        if (CURRENT_LOG_LEVEL >= LOG_LEVELS.WARN) {
            console.warn(`⚠️  [WARN] ${new Date().toISOString()} - ${message}`);
        }
    },
    info: (message) => {
        if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) {
            console.log(`ℹ️  [INFO] ${new Date().toISOString()} - ${message}`);
        }
    },
    debug: (message) => {
        if (CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG) {
            console.log(`🐛 [DEBUG] ${new Date().toISOString()} - ${message}`);
        }
    }
};

// MongoDB Connection
const connectToMongoDB = async () => {
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
            logger.info('Connected to MongoDB successfully');
            const ucb = (process.env.USE_COPY_BACKING_STORE || 'auto').toLowerCase();
            if (ucb !== 'memory') {
                logger.info('useCopy sessions/pages will use MongoDB when USE_COPY_BACKING_STORE is auto or mongo (multi-instance safe)');
            }
        } else {
            logger.warn('MONGODB_URI not found in environment variables - MongoDB storage disabled');
        }
    } catch (error) {
        logger.error(`MongoDB connection failed: ${error.message}`);
        logger.warn('Continuing without MongoDB - storage functionality disabled');
    }
};

/** useCopy shared across instances (Render replicas, cluster): session + page snapshots in Mongo. */
const UseCopySessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    config: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true }
});
UseCopySessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const UseCopyPageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true }
});
UseCopyPageSchema.index({ sessionId: 1, pageNumber: 1 }, { unique: true });
UseCopyPageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const UseCopySession = mongoose.model('UseCopySession', UseCopySessionSchema);
const UseCopyPage = mongoose.model('UseCopyPage', UseCopyPageSchema);

// Function to store data to MongoDB
async function storeDataToMongoDB(sessionId, requestParams, data) {
    try {
        if (!mongoose.connection.readyState) {
            logger.warn('MongoDB not connected - skipping storage');
            return null;
        }

        const generatedData = new GeneratedData({
            sessionId,
            requestParams,
            data
        });

        const savedData = await generatedData.save();
        logger.info(`Data stored to MongoDB with ID: ${savedData._id} (Session: ${sessionId})`);
        return savedData._id;
    } catch (error) {
        logger.error(`Failed to store data to MongoDB: ${error.message}`);
        return null;
    }
}

// Initialize MongoDB connection
connectToMongoDB();

// Configurable limits
const CONFIG = {
    limits: {
        numFields: {
            min: 1,
            max: 100000,
            default: 5
        },
        numObjects: {
            min: 0,
            max: 10,
            default: 1
        },
        numNesting: {
            min: 0,
            max: 5,
            default: 1
        },
        numRecords: {
            min: 1,
            max: 20000000, // 20M records
            default: 10
        },
        nestedFields: {
            min: 0,
            max: 50,
            default: 3
        },
        recordsPerPage: {
            min: 10,
            max: 1000,
            default: 100
        },
        totalRecordsPagination: {
            min: 10,
            max: 100000000, // 100M records for pagination
            default: 1000
        }
    }
};

/** Build query string for GET /data pagination next/prev links */
function buildPaginationDataUrl(req, pageNum, useCopyOpts = null) {
    // useCopy: config lives in session — only sessionId + pageNumber are needed
    if (useCopyOpts?.sessionId) {
        const params = new URLSearchParams();
        params.set('sessionId', useCopyOpts.sessionId);
        params.set('pageNumber', String(pageNum));
        return `/data?${params.toString()}`;
    }
    const src =
        req.method === 'GET' && req.query && Object.keys(req.query).length ? req.query : req.body || {};
    const params = new URLSearchParams();
    params.set('enablePagination', 'true');
    const keys = [
        ['numFields', src.numFields],
        ['numObjects', src.numObjects],
        ['numNesting', src.numNesting],
        ['numRecords', src.numRecords ?? src.totalRecords],
        ['nestedFields', src.nestedFields],
        ['recordsPerPage', src.recordsPerPage],
        ['excludeEmoji', src.excludeEmoji],
        ['storeIt', src.storeIt]
    ];
    for (const [k, v] of keys) {
        if (v !== undefined && v !== null) {
            params.set(k, String(v));
        }
    }
    params.set('pageNumber', String(pageNum));
    return `/data?${params.toString()}`;
}

// --- useCopy: session cache (TTL) — full generate once per page, then clone + fresh uuid_1 ----------
// memory: single process. mongo: shared across instances when MONGODB_URI is connected (USE_COPY_BACKING_STORE=auto|mongo).
const USE_COPY_TTL_MS = 10 * 60 * 1000;
const USE_COPY_SESSION_CACHE = new Map();

function useCopyUsesMongoStore() {
    const mode = (process.env.USE_COPY_BACKING_STORE || 'auto').toLowerCase();
    if (mode === 'memory') return false;
    if (mode === 'mongo') return mongoose.connection.readyState === 1;
    return mongoose.connection.readyState === 1;
}

function generateUseCopySessionId() {
    return `ucopy_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function cleanExpiredUseCopySessionsMemory() {
    const now = Date.now();
    for (const [id, entry] of USE_COPY_SESSION_CACHE.entries()) {
        if (now > entry.expiresAt) {
            USE_COPY_SESSION_CACHE.delete(id);
            logger.debug(`useCopy session expired: ${id}`);
        }
    }
}

function storeUseCopySessionMemory(sessionId, config) {
    cleanExpiredUseCopySessionsMemory();
    USE_COPY_SESSION_CACHE.set(sessionId, {
        config,
        expiresAt: Date.now() + USE_COPY_TTL_MS,
        responseCopyByPage: new Map()
    });
    logger.info(`useCopy session stored: ${sessionId.slice(-12)} (TTL ${USE_COPY_TTL_MS / 60000}min)`);
}

function getUseCopySessionMemory(sessionId) {
    const entry = USE_COPY_SESSION_CACHE.get(sessionId);
    if (!entry) {
        return null;
    }
    if (Date.now() > entry.expiresAt) {
        USE_COPY_SESSION_CACHE.delete(sessionId);
        logger.debug(`useCopy session removed (expired): ${sessionId}`);
        return null;
    }
    entry.expiresAt = Date.now() + USE_COPY_TTL_MS;
    USE_COPY_SESSION_CACHE.set(sessionId, entry);
    return entry;
}

async function storeUseCopySessionMongo(sessionId, config) {
    if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected; set MONGODB_URI or USE_COPY_BACKING_STORE=memory');
    }
    const expiresAt = new Date(Date.now() + USE_COPY_TTL_MS);
    await UseCopySession.create({
        sessionId,
        config,
        expiresAt
    });
    logger.info(`useCopy session stored (Mongo): ${sessionId.slice(-12)} (TTL ${USE_COPY_TTL_MS / 60000}min)`);
}

async function getUseCopySessionMongo(sessionId) {
    const now = new Date();
    const doc = await UseCopySession.findOneAndUpdate(
        { sessionId, expiresAt: { $gt: now } },
        { $set: { expiresAt: new Date(Date.now() + USE_COPY_TTL_MS) } },
        { new: true }
    ).lean();
    if (!doc) return null;
    return {
        config: doc.config,
        expiresAt: new Date(doc.expiresAt).getTime(),
        storage: 'mongo'
    };
}

async function findUseCopyPageMongo(sessionId, pageNumber) {
    const now = new Date();
    const doc = await UseCopyPage.findOneAndUpdate(
        { sessionId, pageNumber, expiresAt: { $gt: now } },
        { $set: { expiresAt: new Date(Date.now() + USE_COPY_TTL_MS) } },
        { new: true }
    ).lean();
    return doc ? doc.snapshot : null;
}

async function saveUseCopyPageMongo(sessionId, pageNumber, snapshot) {
    const expiresAt = new Date(Date.now() + USE_COPY_TTL_MS);
    try {
        await UseCopyPage.create({ sessionId, pageNumber, snapshot, expiresAt });
    } catch (err) {
        if (err && err.code === 11000) return;
        throw err;
    }
}

async function storeUseCopySession(sessionId, config) {
    if (useCopyUsesMongoStore()) {
        await storeUseCopySessionMongo(sessionId, config);
        return;
    }
    storeUseCopySessionMemory(sessionId, config);
}

async function getUseCopySession(sessionId) {
    if (useCopyUsesMongoStore()) {
        return await getUseCopySessionMongo(sessionId);
    }
    return getUseCopySessionMemory(sessionId);
}

/** Deep clone rows and assign new top-level uuid_1 */
function applyFreshUuid1FromSnapshot(snapshot) {
    const data = structuredClone(snapshot);
    for (const row of data) {
        if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'uuid_1')) {
            row.uuid_1 = crypto.randomUUID();
        }
    }
    return data;
}

// Middleware — gzip/deflate JSON and text responses when client accepts it (reduces transfer size)
const COMPRESSION_THRESHOLD = Math.max(0, parseInt(process.env.COMPRESSION_THRESHOLD_BYTES || '1024', 10) || 1024);
app.use(
    compression({
        threshold: COMPRESSION_THRESHOLD,
        filter: (req, res) => {
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression.filter(req, res);
        }
    })
);
app.use(cors());
// JSON body limit for API clients (large POST bodies with options); override with JSON_BODY_LIMIT e.g. 50mb
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '10mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Log any response status other than 200 (3xx cache/redirect, 4xx client, 5xx server, etc.)
app.use((req, res, next) => {
    res.on('finish', () => {
        const code = res.statusCode;
        if (code === 200) return;
        const line = `${code} ${req.method} ${req.originalUrl || req.url}`;
        if (code >= 500) logger.error(line);
        else if (code >= 400) logger.warn(line);
        else logger.info(line);
    });
    next();
});

app.use(express.static('public'));

// Health check endpoint for keep-alive and monitoring
app.get('/ping', async (req, res) => {
    let activeSessions = USE_COPY_SESSION_CACHE.size;
    if (useCopyUsesMongoStore()) {
        try {
            activeSessions = await UseCopySession.countDocuments({ expiresAt: { $gt: new Date() } });
        } catch {
            activeSessions = USE_COPY_SESSION_CACHE.size;
        }
    }
    const status = {
        success: true,
        message: 'pong',
        note: 'remove upperlimit',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        useCopyStore: useCopyUsesMongoStore() ? 'mongo' : 'memory',
        jobQueue: isQueueEnabled() ? 'enabled' : 'disabled',
        activeSessions
    };

    logger.debug('Ping request received');
    res.json(status);
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configuration endpoint
app.get('/config', (req, res) => {
    res.json({
        success: true,
        config: CONFIG
    });
});


// Function to handle paginated requests (shared by /data and /generate-paginated)
// Default: stateless (full params each time). useCopy=true: session + TTL cache; repeat = clone + new uuid_1
async function handlePaginatedRequest(req, res) {
    try {
        const body = req.body || {};
        const useCopyFlag =
            body.useCopy === true || body.useCopy === 'true' || body.useCopy === 1 || body.useCopy === '1';
        const existingUseCopySessionId =
            body.sessionId && String(body.sessionId).trim() !== '' ? String(body.sessionId).trim() : null;

        let useCopy = useCopyFlag;
        if (!useCopy && existingUseCopySessionId) {
            const cached = await getUseCopySession(existingUseCopySessionId);
            if (cached && Date.now() <= cached.expiresAt) {
                useCopy = true;
            }
        }

        if (useCopy) {
            return await handlePaginatedUseCopy(req, res, body, existingUseCopySessionId);
        }

        const {
            pageNumber,
            numFields,
            numObjects,
            numNesting,
            totalRecords,
            nestedFields,
            recordsPerPage,
            excludeEmoji
        } = body;
        const totalRec = totalRecords !== undefined ? totalRecords : body.numRecords;
        const currentPageNumber = pageNumber || 1;

        if (LOG_DEBUG) {
            logger.debug(
                `Paginated request: ${totalRec ?? 'default'} total records, ${numFields ?? 'default'} fields, page ${currentPageNumber}`
            );
        }

        const finalNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = numObjects !== undefined ? numObjects : 0;
        const finalNumNesting = numNesting !== undefined ? numNesting : 0;
        const finalTotalRecords = totalRec !== undefined ? totalRec : CONFIG.limits.numRecords.default;
        const finalNestedFields = nestedFields !== undefined ? nestedFields : 0;
        const finalRecordsPerPage = recordsPerPage !== undefined ? recordsPerPage : 100;
        const finalExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;

        const limits = CONFIG.limits;

        if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
            return res.status(400).json({
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}`
            });
        }
        if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
            return res.status(400).json({
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}`
            });
        }
        if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
            return res.status(400).json({
                error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}`
            });
        }
        if (finalTotalRecords < limits.totalRecordsPagination.min || finalTotalRecords > limits.totalRecordsPagination.max) {
            return res.status(400).json({
                error: `Total records must be between ${limits.totalRecordsPagination.min} and ${limits.totalRecordsPagination.max.toLocaleString()} for pagination`
            });
        }
        if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
            return res.status(400).json({
                error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}`
            });
        }
        if (finalRecordsPerPage < limits.recordsPerPage.min || finalRecordsPerPage > limits.recordsPerPage.max) {
            return res.status(400).json({
                error: `Records per page must be between ${limits.recordsPerPage.min} and ${limits.recordsPerPage.max}`
            });
        }

        if (currentPageNumber < 1) {
            return res.status(400).json({
                error: 'Invalid page number. Must be a positive integer.'
            });
        }

        if (finalTotalRecords > 100000) {
            logger.warn(
                `Large paginated dataset requested: ${finalTotalRecords} total records. This will create ${Math.ceil(finalTotalRecords / finalRecordsPerPage)} pages.`
            );
        }

        const avgFieldSize = 25;
        const estimatedMemoryMB = Math.ceil((finalRecordsPerPage * finalNumFields * avgFieldSize) / (1024 * 1024));
        if (estimatedMemoryMB > 200) {
            logger.warn(
                `Estimated memory usage per page: ~${estimatedMemoryMB}MB. Total dataset: ${finalTotalRecords.toLocaleString()} records.`
            );
        }

        const effectivePageSize = finalRecordsPerPage;
        const effectiveTotalRecords = finalTotalRecords;
        const totalPages = Math.ceil(effectiveTotalRecords / effectivePageSize);
        if (currentPageNumber > totalPages) {
            return res.status(400).json({
                error: `Page ${currentPageNumber} does not exist. Total pages: ${totalPages}`
            });
        }

        const startIndex = (currentPageNumber - 1) * effectivePageSize;
        const endIndex = Math.min(startIndex + effectivePageSize, effectiveTotalRecords);
        const recordsToGenerate = endIndex - startIndex;

        const data = generateRealisticData(
            finalNumFields,
            finalNumObjects,
            finalNumNesting,
            recordsToGenerate,
            finalNestedFields,
            finalExcludeEmoji
        );

        const hasNextPage = currentPageNumber < totalPages;
        const hasPreviousPage = currentPageNumber > 1;
        const nextPageNumber = hasNextPage ? currentPageNumber + 1 : null;
        const prevPageNumber = hasPreviousPage ? currentPageNumber - 1 : null;

        const paginationResponse = {
            currentPage: currentPageNumber,
            totalPages,
            totalRecords: effectiveTotalRecords,
            recordsPerPage: effectivePageSize,
            recordsInCurrentPage: recordsToGenerate,
            hasNextPage,
            hasPreviousPage,
            nextPageNumber,
            prevPageNumber
        };

        if (req.method === 'GET') {
            paginationResponse.nextUrl = hasNextPage ? buildPaginationDataUrl(req, nextPageNumber) : null;
            paginationResponse.prevUrl = hasPreviousPage ? buildPaginationDataUrl(req, prevPageNumber) : null;
        }

        if (currentPageNumber === totalPages) {
            logger.info(
                `Pagination complete: last page served (${totalPages} pages, ${effectiveTotalRecords} total records, ${recordsToGenerate} records this page)`
            );
        }

        res.json({
            success: true,
            data,
            pagination: paginationResponse
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function handlePaginatedUseCopy(req, res, body, existingSessionId) {
    const pageNumber = body.pageNumber || 1;
    const currentPageNumber = pageNumber;
    const totalRec = body.totalRecords !== undefined ? body.totalRecords : body.numRecords;

    let sessionConfig;
    let entry = null;
    let finalSessionId = existingSessionId;

    if (!existingSessionId) {
        const finalNumFields = body.numFields !== undefined ? body.numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = body.numObjects !== undefined ? body.numObjects : 0;
        const finalNumNesting = body.numNesting !== undefined ? body.numNesting : 0;
        const finalTotalRecords = totalRec !== undefined ? totalRec : CONFIG.limits.numRecords.default;
        const finalNestedFields = body.nestedFields !== undefined ? body.nestedFields : 0;
        const finalRecordsPerPage = body.recordsPerPage !== undefined ? body.recordsPerPage : 100;
        const finalExcludeEmoji = body.excludeEmoji !== undefined ? body.excludeEmoji : false;

        const limits = CONFIG.limits;
        if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
            return res.status(400).json({
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}`
            });
        }
        if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
            return res.status(400).json({
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}`
            });
        }
        if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
            return res.status(400).json({
                error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}`
            });
        }
        if (finalTotalRecords < limits.totalRecordsPagination.min || finalTotalRecords > limits.totalRecordsPagination.max) {
            return res.status(400).json({
                error: `Total records must be between ${limits.totalRecordsPagination.min} and ${limits.totalRecordsPagination.max.toLocaleString()} for pagination`
            });
        }
        if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
            return res.status(400).json({
                error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}`
            });
        }
        if (finalRecordsPerPage < limits.recordsPerPage.min || finalRecordsPerPage > limits.recordsPerPage.max) {
            return res.status(400).json({
                error: `Records per page must be between ${limits.recordsPerPage.min} and ${limits.recordsPerPage.max}`
            });
        }

        if (currentPageNumber < 1) {
            return res.status(400).json({ error: 'Invalid page number. Must be a positive integer.' });
        }

        sessionConfig = {
            numFields: finalNumFields,
            numObjects: finalNumObjects,
            numNesting: finalNumNesting,
            totalRecords: finalTotalRecords,
            nestedFields: finalNestedFields,
            recordsPerPage: finalRecordsPerPage,
            excludeEmoji: finalExcludeEmoji
        };

        finalSessionId = generateUseCopySessionId();
        await storeUseCopySession(finalSessionId, sessionConfig);
        entry = await getUseCopySession(finalSessionId);
    } else {
        entry = await getUseCopySession(existingSessionId);
        if (!entry) {
            return res.status(404).json({
                error: 'useCopy session not found or expired. Start again with useCopy=true and no sessionId.'
            });
        }
        sessionConfig = entry.config;
        finalSessionId = existingSessionId;
    }

    const effectivePageSize = sessionConfig.recordsPerPage;
    const effectiveTotalRecords = sessionConfig.totalRecords;
    const totalPages = Math.ceil(effectiveTotalRecords / effectivePageSize);

    if (currentPageNumber > totalPages) {
        return res.status(400).json({
            error: `Page ${currentPageNumber} does not exist. Total pages: ${totalPages}`
        });
    }

    const startIndex = (currentPageNumber - 1) * effectivePageSize;
    const endIndex = Math.min(startIndex + effectivePageSize, effectiveTotalRecords);
    const recordsToGenerate = endIndex - startIndex;

    let data;
    const mongoStore = useCopyUsesMongoStore();
    if (mongoStore) {
        const pageSnapshot = await findUseCopyPageMongo(finalSessionId, currentPageNumber);
        if (pageSnapshot != null) {
            data = applyFreshUuid1FromSnapshot(pageSnapshot);
        } else {
            data = generateRealisticData(
                sessionConfig.numFields,
                sessionConfig.numObjects,
                sessionConfig.numNesting,
                recordsToGenerate,
                sessionConfig.nestedFields,
                sessionConfig.excludeEmoji
            );
            await saveUseCopyPageMongo(finalSessionId, currentPageNumber, structuredClone(data));
        }
    } else if (entry.responseCopyByPage && entry.responseCopyByPage.has(currentPageNumber)) {
        data = applyFreshUuid1FromSnapshot(entry.responseCopyByPage.get(currentPageNumber));
    } else {
        data = generateRealisticData(
            sessionConfig.numFields,
            sessionConfig.numObjects,
            sessionConfig.numNesting,
            recordsToGenerate,
            sessionConfig.nestedFields,
            sessionConfig.excludeEmoji
        );
        if (!entry.responseCopyByPage) {
            entry.responseCopyByPage = new Map();
        }
        entry.responseCopyByPage.set(currentPageNumber, structuredClone(data));
        USE_COPY_SESSION_CACHE.set(finalSessionId, entry);
    }

    const hasNextPage = currentPageNumber < totalPages;
    const hasPreviousPage = currentPageNumber > 1;
    const nextPageNumber = hasNextPage ? currentPageNumber + 1 : null;
    const prevPageNumber = hasPreviousPage ? currentPageNumber - 1 : null;

    const urlOpts = { sessionId: finalSessionId, useCopy: true };
    const paginationResponse = {
        currentPage: currentPageNumber,
        totalPages,
        totalRecords: effectiveTotalRecords,
        recordsPerPage: effectivePageSize,
        recordsInCurrentPage: recordsToGenerate,
        hasNextPage,
        hasPreviousPage,
        nextPageNumber,
        prevPageNumber,
        useCopy: true
    };

    if (req.method === 'GET') {
        paginationResponse.nextUrl = hasNextPage ? buildPaginationDataUrl(req, nextPageNumber, urlOpts) : null;
        paginationResponse.prevUrl = hasPreviousPage ? buildPaginationDataUrl(req, prevPageNumber, urlOpts) : null;
    }

    if (currentPageNumber === totalPages) {
        logger.info(
            `Pagination complete: last page served (${totalPages} pages, ${effectiveTotalRecords} total records, ${recordsToGenerate} records this page) [useCopy]`
        );
    }

    res.json({
        success: true,
        sessionId: finalSessionId,
        data,
        pagination: paginationResponse
    });
}

// GET endpoint for /data - accepts parameters via URL query string
app.get('/data', async (req, res) => {
    try {
        // Extract parameters from query string and convert to appropriate types
        const {
            numFields,
            numObjects,
            numNesting,
            numRecords,
            nestedFields,
            storeIt,
            enablePagination,
            recordsPerPage,
            pageNumber,
            excludeEmoji,
            sessionId: querySessionId,
            useCopy: queryUseCopy
        } = req.query;

        // Convert string parameters to appropriate types
        const parsedParams = {
            numFields: numFields ? parseInt(numFields) : undefined,
            numObjects: numObjects !== undefined ? parseInt(numObjects) : undefined,
            numNesting: numNesting !== undefined ? parseInt(numNesting) : undefined,
            numRecords: numRecords ? parseInt(numRecords) : undefined,
            nestedFields: nestedFields !== undefined ? parseInt(nestedFields) : undefined,
            storeIt: storeIt === 'true',
            enablePagination: enablePagination === 'true',
            recordsPerPage: recordsPerPage ? parseInt(recordsPerPage) : undefined,
            pageNumber: pageNumber ? parseInt(pageNumber) : undefined,
            excludeEmoji: excludeEmoji === 'true',
            sessionId: querySessionId || undefined,
            useCopy: queryUseCopy === 'true'
        };

        // Create a mock request object with the parsed parameters in the body
        const mockReq = {
            body: parsedParams,
            query: req.query,
            headers: req.headers,
            method: req.method,
            protocol: req.protocol,
            get: req.get.bind(req)
        };

        // Minimal useCopy URLs: ?sessionId=...&pageNumber=N (config is loaded from session cache)
        const trimmedSessionId =
            querySessionId && String(querySessionId).trim() !== '' ? String(querySessionId).trim() : null;
        if (trimmedSessionId) {
            const entry = await getUseCopySession(trimmedSessionId);
            if (!entry) {
                return res.status(404).json({
                    success: false,
                    error: 'useCopy session not found or expired. Start again with useCopy=true and no sessionId.'
                });
            }
            const cfg = entry.config;
            const pageNum = parsedParams.pageNumber || 1;
            mockReq.body = {
                numFields: cfg.numFields,
                numObjects: cfg.numObjects,
                numNesting: cfg.numNesting,
                totalRecords: cfg.totalRecords,
                nestedFields: cfg.nestedFields,
                recordsPerPage: cfg.recordsPerPage,
                pageNumber: pageNum,
                excludeEmoji: cfg.excludeEmoji,
                sessionId: trimmedSessionId,
                useCopy: true
            };
            return await handlePaginatedRequest(mockReq, res);
        }

        // If pagination is enabled, redirect to pagination logic
        if (parsedParams.enablePagination) {
            if (LOG_DEBUG) {
                logger.debug(
                    `GET /data (pagination): ${parsedParams.numRecords ?? 'default'} records, ${parsedParams.numFields ?? 'default'} fields, store: ${!!parsedParams.storeIt}`
                );
            }
            
            // Set defaults for pagination parameters
            const finalPaginationNumFields = parsedParams.numFields !== undefined ? parsedParams.numFields : CONFIG.limits.numFields.default;
            const finalPaginationNumObjects = parsedParams.numObjects !== undefined ? parsedParams.numObjects : 0;
            const finalPaginationNumNesting = parsedParams.numNesting !== undefined ? parsedParams.numNesting : 0;
            const finalPaginationNumRecords = parsedParams.numRecords !== undefined ? parsedParams.numRecords : CONFIG.limits.numRecords.default;
            const finalPaginationNestedFields = parsedParams.nestedFields !== undefined ? parsedParams.nestedFields : 0;
            const finalPaginationRecordsPerPage = parsedParams.recordsPerPage !== undefined ? parsedParams.recordsPerPage : 100;
            const finalPaginationExcludeEmoji = parsedParams.excludeEmoji !== undefined ? parsedParams.excludeEmoji : false;
            
            // Transform request to pagination format
            const paginationRequest = {
                numFields: finalPaginationNumFields,
                numObjects: finalPaginationNumObjects,
                numNesting: finalPaginationNumNesting,
                totalRecords: finalPaginationNumRecords,
                nestedFields: finalPaginationNestedFields,
                recordsPerPage: finalPaginationRecordsPerPage,
                pageNumber: parsedParams.pageNumber || 1,
                excludeEmoji: finalPaginationExcludeEmoji,
                sessionId: parsedParams.sessionId,
                useCopy: parsedParams.useCopy
            };
            
            // Call the pagination logic directly
            mockReq.body = paginationRequest;
            return await handlePaginatedRequest(mockReq, res);
        }
        
        logger.info(`GET Data request: ${parsedParams.numRecords} records, ${parsedParams.numFields} fields, store: ${!!parsedParams.storeIt}`);

        // Set defaults if not provided
        const finalNumFields = parsedParams.numFields !== undefined ? parsedParams.numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = parsedParams.numObjects !== undefined ? parsedParams.numObjects : 0;
        const finalNumNesting = parsedParams.numNesting !== undefined ? parsedParams.numNesting : 0;
        const finalNumRecords = parsedParams.numRecords !== undefined ? parsedParams.numRecords : CONFIG.limits.numRecords.default;
        const finalNestedFields = parsedParams.nestedFields !== undefined ? parsedParams.nestedFields : 0;
        const finalStoreIt = parsedParams.storeIt !== undefined ? parsedParams.storeIt : false;
        const finalExcludeEmoji = parsedParams.excludeEmoji !== undefined ? parsedParams.excludeEmoji : false;

        // No validation required - all parameters now have defaults

        const limits = CONFIG.limits;

        // Validate numFields
        if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
            return res.status(400).json({ 
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
            });
        }

        // Validate numObjects
        if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
            return res.status(400).json({ 
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
            });
        }

        // Validate numNesting
        if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
            return res.status(400).json({ 
                error: `Nesting level must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
            });
        }

        // Validate numRecords
        if (finalNumRecords < limits.numRecords.min || finalNumRecords > limits.numRecords.max) {
            return res.status(400).json({ 
                error: `Number of records must be between ${limits.numRecords.min} and ${limits.numRecords.max}` 
            });
        }

        // Validate nestedFields
        if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
            return res.status(400).json({ 
                error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}` 
            });
        }

        // Performance warnings for large datasets
        if (finalNumRecords > 100000) {
            logger.warn(`Large dataset requested: ${finalNumRecords} records. Consider using pagination for better performance.`);
        }
        const estimatedMemoryMB = Math.ceil((finalNumRecords * finalNumFields * 50) / (1024 * 1024));
        if (estimatedMemoryMB > 500) {
            logger.warn(`Estimated memory usage: ~${estimatedMemoryMB}MB. Monitor server resources.`);
        }

        // Generate data
        const data = generateRealisticData(
            finalNumFields,
            finalNumObjects,
            finalNumNesting,
            finalNumRecords,
            finalNestedFields,
            finalExcludeEmoji
        );

        // Store in MongoDB if requested
        if (finalStoreIt) {
            try {
                const collection = db.collection('generated_data');
                const result = await collection.insertMany(data);
                logger.info(`Stored ${result.insertedCount} records in MongoDB`);
            } catch (dbError) {
                logger.error(`Failed to store data in MongoDB: ${dbError.message}`);
                // Continue without storing - don't fail the request
            }
        }

        res.json(data);
    } catch (error) {
        logger.error(`GET /data error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// POST endpoint for /data - returns just the data array (same as /generate-data but only returns data)
app.post('/data', async (req, res) => {
    try {
        const { numFields, numObjects, numNesting, numRecords, nestedFields, storeIt, enablePagination, recordsPerPage, excludeEmoji, pageNumber: postPageNumber, sessionId: postSessionId, useCopy: postUseCopy } = req.body;
        
        // If pagination is enabled, redirect to pagination logic
        if (enablePagination) {
            if (LOG_DEBUG) {
                logger.debug(
                    `POST /data (pagination): ${numRecords} total records, ${numFields} fields, store: ${!!storeIt}`
                );
            }
            
            // Transform request to pagination format and call pagination endpoint internally
            // Set defaults for pagination parameters
            const finalPaginationNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
            const finalPaginationNumObjects = numObjects !== undefined ? numObjects : 0;
            const finalPaginationNumNesting = numNesting !== undefined ? numNesting : 0;
            const finalPaginationNumRecords = numRecords !== undefined ? numRecords : CONFIG.limits.numRecords.default;
            const finalPaginationNestedFields = nestedFields !== undefined ? nestedFields : 0;
            const finalPaginationRecordsPerPage = recordsPerPage !== undefined ? recordsPerPage : 100;
            const finalPaginationExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;
            
            const paginationRequest = {
                numFields: finalPaginationNumFields,
                numObjects: finalPaginationNumObjects,
                numNesting: finalPaginationNumNesting,
                totalRecords: finalPaginationNumRecords,
                nestedFields: finalPaginationNestedFields,
                recordsPerPage: finalPaginationRecordsPerPage,
                pageNumber: postPageNumber !== undefined ? postPageNumber : 1,
                excludeEmoji: finalPaginationExcludeEmoji,
                sessionId: postSessionId,
                useCopy: postUseCopy
            };
            
            // Call the pagination logic directly
            req.body = paginationRequest;
            return await handlePaginatedRequest(req, res);
        }
        
        // Set defaults if not provided
        const finalNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = numObjects !== undefined ? numObjects : 0;
        const finalNumNesting = numNesting !== undefined ? numNesting : 0;
        const finalNumRecords = numRecords !== undefined ? numRecords : CONFIG.limits.numRecords.default;
        const finalNestedFields = nestedFields !== undefined ? nestedFields : 0;
        const finalStoreIt = storeIt !== undefined ? storeIt : false;
        const finalExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;

        logger.info(`Data request: ${finalNumRecords} records, ${finalNumFields} fields, store: ${!!finalStoreIt}`);

        // No validation required - all parameters now have defaults

        const limits = CONFIG.limits;

        // Validate numFields
        if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
            return res.status(400).json({ 
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
            });
        }

        // Validate numObjects
        if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
            return res.status(400).json({ 
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
            });
        }

        // Validate numNesting
        if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
            return res.status(400).json({ 
                error: `Nesting level must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
            });
        }

        // Validate numRecords
        if (finalNumRecords < limits.numRecords.min || finalNumRecords > limits.numRecords.max) {
            return res.status(400).json({ 
                error: `Number of records must be between ${limits.numRecords.min} and ${limits.numRecords.max}` 
            });
        }

        // Validate nestedFields
        if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
            return res.status(400).json({ 
                error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}` 
            });
        }

        // Performance warning for very large datasets
        if (finalNumRecords > 100000) {
            logger.warn(`Large dataset requested: ${finalNumRecords} records. Consider using pagination for better performance.`);
        }
        
        // Memory usage estimation (more realistic calculation)
        const avgFieldSize = 25; // Average bytes per field (JSON + field name + value)
        const estimatedMemoryMB = Math.ceil((finalNumRecords * finalNumFields * avgFieldSize) / (1024 * 1024));
        if (estimatedMemoryMB > 1000) { // Increased threshold to 1GB
            logger.warn(`Estimated memory usage: ~${estimatedMemoryMB}MB. Monitor server resources.`);
        }

        // Generate data
        const data = generateRealisticData(finalNumFields, finalNumObjects, finalNumNesting, finalNumRecords, finalNestedFields, finalExcludeEmoji);

        // Store to MongoDB if requested
        if (finalStoreIt) {
            const sessionId = `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const requestParams = {
                numFields,
                numObjects,
                numNesting,
                numRecords,
                nestedFields: finalNestedFields,
                storeIt: finalStoreIt
            };
            
            await storeDataToMongoDB(sessionId, requestParams, data);
        }

        // Return only the data array
        res.json(data);

    } catch (error) {
        logger.error('Error generating data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Data generation endpoint
app.post('/generate-data', async (req, res) => {
    try {
        const { numFields, numObjects, numNesting, numRecords, nestedFields, storeIt, excludeEmoji } = req.body;
        
        // Set defaults if not provided
        const finalNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = numObjects !== undefined ? numObjects : 0;
        const finalNumNesting = numNesting !== undefined ? numNesting : 0;
        const finalNumRecords = numRecords !== undefined ? numRecords : CONFIG.limits.numRecords.default;
        const finalNestedFields = nestedFields !== undefined ? nestedFields : 0;
        const finalStoreIt = storeIt !== undefined ? storeIt : false;
        const finalExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;

        logger.info(`Data generation request: ${finalNumRecords} records, ${finalNumFields} fields, store: ${!!finalStoreIt}`);

        // Validate limits using configuration
        const limits = CONFIG.limits;
        
        if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
            return res.status(400).json({ 
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
            });
        }

        if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
            return res.status(400).json({ 
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
            });
        }

        if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
            return res.status(400).json({ 
                error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
            });
        }

        if (finalNumRecords < limits.numRecords.min || finalNumRecords > limits.numRecords.max) {
            return res.status(400).json({ 
                error: `Number of records must be between ${limits.numRecords.min} and ${limits.numRecords.max}` 
            });
        }

        if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
            return res.status(400).json({ 
                error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}` 
            });
        }

        // Performance validation removed - no limits on total fields
        
        // Performance warning for very large datasets
        if (finalNumRecords > 100000) {
            logger.warn(`Large dataset requested: ${finalNumRecords} records. Consider using pagination for better performance.`);
        }
        
        // Memory usage estimation (more realistic calculation)
        const avgFieldSize = 25; // Average bytes per field (JSON + field name + value)
        const estimatedMemoryMB = Math.ceil((finalNumRecords * finalNumFields * avgFieldSize) / (1024 * 1024));
        if (estimatedMemoryMB > 1000) { // Increased threshold to 1GB
            logger.warn(`Estimated memory usage: ~${estimatedMemoryMB}MB. Monitor server resources.`);
        }

        const data = generateRealisticData(finalNumFields, finalNumObjects, finalNumNesting, finalNumRecords, finalNestedFields, finalExcludeEmoji);

        // Store to MongoDB if requested
        if (finalStoreIt) {
            const sessionId = `generate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const requestParams = {
                numFields: finalNumFields,
                numObjects: finalNumObjects,
                numNesting: finalNumNesting,
                numRecords: finalNumRecords,
                nestedFields: finalNestedFields,
                storeIt: finalStoreIt,
                excludeEmoji: finalExcludeEmoji
            };
            
            await storeDataToMongoDB(sessionId, requestParams, data);
        }
        
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Paginated data generation (stateless: send full params + pageNumber on every request)
app.post('/generate-paginated', async (req, res) => {
    return await handlePaginatedRequest(req, res);
});

// --- Async job queue (BullMQ + Redis): run `npm run worker` in a separate process ---
app.post('/jobs/generate-data', async (req, res) => {
    try {
        if (!isQueueEnabled()) {
            return res.status(503).json({
                error: 'Job queue is not configured. Set REDIS_URL and run the worker (npm run worker).'
            });
        }

        const { numFields, numObjects, numNesting, numRecords, nestedFields, storeIt, excludeEmoji } = req.body;

        const finalNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = numObjects !== undefined ? numObjects : 0;
        const finalNumNesting = numNesting !== undefined ? numNesting : 0;
        const finalNumRecords = numRecords !== undefined ? numRecords : CONFIG.limits.numRecords.default;
        const finalNestedFields = nestedFields !== undefined ? nestedFields : 0;
        const finalStoreIt = storeIt !== undefined ? storeIt : false;
        const finalExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;

        const limits = CONFIG.limits;

        if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
            return res.status(400).json({
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}`
            });
        }
        if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
            return res.status(400).json({
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}`
            });
        }
        if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
            return res.status(400).json({
                error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}`
            });
        }
        if (finalNumRecords < limits.numRecords.min || finalNumRecords > limits.numRecords.max) {
            return res.status(400).json({
                error: `Number of records must be between ${limits.numRecords.min} and ${limits.numRecords.max}`
            });
        }
        if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
            return res.status(400).json({
                error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}`
            });
        }

        const jobPayload = {
            numFields: finalNumFields,
            numObjects: finalNumObjects,
            numNesting: finalNumNesting,
            numRecords: finalNumRecords,
            nestedFields: finalNestedFields,
            storeIt: finalStoreIt,
            excludeEmoji: finalExcludeEmoji
        };

        const job = await addGenerateDataJob(jobPayload);
        logger.info(`Queued data generation job ${job.id}`);

        res.json({
            success: true,
            jobId: String(job.id),
            state: 'queued',
            message: 'Poll GET /jobs/:jobId until state is completed, then read the data field.',
            pollUrl: `/jobs/${job.id}`
        });
    } catch (error) {
        logger.error(`Job enqueue error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/jobs/:jobId', async (req, res) => {
    try {
        if (!isQueueEnabled()) {
            return res.status(503).json({
                error: 'Job queue is not configured. Set REDIS_URL and run the worker (npm run worker).'
            });
        }

        const report = await buildJobStatusResponse(req.params.jobId);
        if (!report) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(report);
    } catch (error) {
        logger.error(`Job status error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    logger.info(`Data Generator Server running on http://localhost:${PORT}`);
    logger.info(`Log level: ${Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === CURRENT_LOG_LEVEL)}`);
    
    // Start health check ping every 5 minutes to keep app alive
    setInterval(() => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/ping',
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            logger.debug(`Health check ping: ${res.statusCode}`);
        });

        req.on('error', (err) => {
            logger.error(`Health check ping failed: ${err.message}`);
        });

        req.end();
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
    
    logger.debug(`Health check ping scheduled every 5 minutes`);
}); 
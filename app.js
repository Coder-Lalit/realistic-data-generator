const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const { faker } = require('@faker-js/faker');
const cors = require('cors');
const path = require('path');
const http = require('http');
require('dotenv').config();

const useCopyRedis = require('./use-copy-redis');

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
        uniformFieldLength: {
            default: false // deterministic Faker seed from layout (same params => same sequence per batch)
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

// Fixed field types array for consistent ordering
const FIELD_TYPES = [
    // Unique Identifier (1 field) - ALWAYS FIRST
    'uuid',
    
    // Personal Information (13 fields)
    'firstName', 'lastName', 'fullName', 'middleName', 'gender', 'birthDate', 'age',
    'bio', 'jobTitle', 'suffix', 'prefix', 'phone', 'phoneNumber',
    
    // Location & Address (10 fields)
    'address', 'streetName', 'buildingNumber', 'city', 'state', 'country', 
    'zipCode', 'latitude', 'longitude', 'timezone',
    
    // Business & Finance (13 fields)
    'company', 'department', 'catchPhrase', 'buzzword', 'salary', 'accountNumber',
    'routingNumber', 'creditCard', 'currency', 'price', 'transactionType',
    'bitcoinAddress', 'bankName', 'iban',
    
    // Internet & Technology (12 fields)
    'email', 'website', 'username', 'password', 'domainName', 'ip', 'ipv6',
    'mac', 'userAgent', 'protocol', 'port', 'emoji',
    
    // Commerce & Products (8 fields)
    'productName', 'productDescription', 'productMaterial', 'productAdjective',
    'rating', 'isbn', 'ean', 'productCategory',
    
    // Vehicle & Transportation (6 fields)
    'vehicle', 'vehicleModel', 'vehicleManufacturer', 'vehicleType', 'vehicleFuel', 'vin',
    
    // System & Files (5 fields)
    'fileName', 'fileExtension', 'mimeType', 'directoryPath', 'semver',
    
    // Dates & Time (5 fields)
    'date', 'recentDate', 'futureDate', 'weekday', 'month',
    
    // Text & Content (6 fields)
    'description', 'sentence', 'paragraph', 'words', 'slug', 'title',
    
    // Identification & Codes (7 fields)
    'nanoid', 'color', 'hexColor', 'number', 'boolean',
    'imei', 'creditCardCVV', 'licenseNumber'
];

/** Deterministic Faker seed from layout params (used when uniformFieldLength is true) */
function stableSeedForUniformLength(numFields, numObjects, nestingLevel, nestedFields) {
    let h = 2166136261 >>> 0;
    for (const n of [numFields, numObjects, nestingLevel, nestedFields, 0x554e464d]) {
        h ^= n;
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Build query string for GET /data pagination next/prev links */
function buildPaginationDataUrl(req, pageNum, useCopyOpts = null) {
    // useCopy: sessionId is config-derived — minimal URLs use sessionId + pageNumber
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
        ['uniformFieldLength', src.uniformFieldLength],
        ['excludeEmoji', src.excludeEmoji]
    ];
    for (const [k, v] of keys) {
        if (v !== undefined && v !== null) {
            params.set(k, String(v));
        }
    }
    params.set('pageNumber', String(pageNum));
    return `/data?${params.toString()}`;
}

// --- useCopy: Redis (REDIS_URL) = one row template + TTL + lock; else in-memory. Page = N clones with fresh uuid_1. sessionId = deterministic ucopy_<hash> ---
const USE_COPY_TTL_MS = 10 * 60 * 1000;
const USE_COPY_SESSION_CACHE = new Map();

/** Fields that define generated shape; must stay in sync with parseValidatedUseCopySessionConfig. */
function useCopyConfigFingerprint(config) {
    return {
        numFields: config.numFields,
        numObjects: config.numObjects,
        numNesting: config.numNesting,
        nestedFields: config.nestedFields,
        recordsPerPage: config.recordsPerPage,
        totalRecords: config.totalRecords,
        uniformFieldLength: !!config.uniformFieldLength,
        excludeEmoji: !!config.excludeEmoji
    };
}

function buildUseCopyCacheKeyFromConfig(config) {
    const json = JSON.stringify(useCopyConfigFingerprint(config));
    const h = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
    return `ucopy_${h}`;
}

function useCopyConfigsEqual(a, b) {
    return JSON.stringify(useCopyConfigFingerprint(a)) === JSON.stringify(useCopyConfigFingerprint(b));
}

/** Build and validate pagination config from request body (defaults match stateless pagination). */
function parseValidatedUseCopySessionConfig(body) {
    const totalRec = body.totalRecords !== undefined ? body.totalRecords : body.numRecords;
    const finalNumFields = body.numFields !== undefined ? body.numFields : CONFIG.limits.numFields.default;
    const finalNumObjects = body.numObjects !== undefined ? body.numObjects : 0;
    const finalNumNesting = body.numNesting !== undefined ? body.numNesting : 0;
    const finalTotalRecords = totalRec !== undefined ? totalRec : CONFIG.limits.numRecords.default;
    const finalNestedFields = body.nestedFields !== undefined ? body.nestedFields : 0;
    const finalUniformLength = body.uniformFieldLength !== undefined ? body.uniformFieldLength : false;
    const finalRecordsPerPage = body.recordsPerPage !== undefined ? body.recordsPerPage : 100;
    const finalExcludeEmoji = body.excludeEmoji !== undefined ? body.excludeEmoji : false;

    const limits = CONFIG.limits;
    if (finalNumFields < limits.numFields.min || finalNumFields > limits.numFields.max) {
        return {
            error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}`
        };
    }
    if (finalNumObjects < limits.numObjects.min || finalNumObjects > limits.numObjects.max) {
        return {
            error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}`
        };
    }
    if (finalNumNesting < limits.numNesting.min || finalNumNesting > limits.numNesting.max) {
        return {
            error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}`
        };
    }
    if (finalTotalRecords < limits.totalRecordsPagination.min || finalTotalRecords > limits.totalRecordsPagination.max) {
        return {
            error: `Total records must be between ${limits.totalRecordsPagination.min} and ${limits.totalRecordsPagination.max.toLocaleString()} for pagination`
        };
    }
    if (finalNestedFields < limits.nestedFields.min || finalNestedFields > limits.nestedFields.max) {
        return {
            error: `Number of nested fields must be between ${limits.nestedFields.min} and ${limits.nestedFields.max}`
        };
    }
    if (finalRecordsPerPage < limits.recordsPerPage.min || finalRecordsPerPage > limits.recordsPerPage.max) {
        return {
            error: `Records per page must be between ${limits.recordsPerPage.min} and ${limits.recordsPerPage.max}`
        };
    }

    return {
        error: null,
        config: {
            numFields: finalNumFields,
            numObjects: finalNumObjects,
            numNesting: finalNumNesting,
            totalRecords: finalTotalRecords,
            nestedFields: finalNestedFields,
            uniformFieldLength: finalUniformLength,
            recordsPerPage: finalRecordsPerPage,
            excludeEmoji: finalExcludeEmoji
        }
    };
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

function storeUseCopySession(sessionId, config) {
    cleanExpiredUseCopySessionsMemory();
    USE_COPY_SESSION_CACHE.set(sessionId, {
        config,
        expiresAt: Date.now() + USE_COPY_TTL_MS,
        responseCopyTemplate: null
    });
    logger.info(`useCopy cache key stored: ${sessionId} (TTL ${USE_COPY_TTL_MS / 60000}min)`);
}

function getUseCopySession(sessionId) {
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

/** Build a page by cloning one template row `count` times with a new uuid_1 each. */
function pageDataFromSingleRowTemplate(templateRow, count) {
    const data = [];
    for (let i = 0; i < count; i++) {
        const row = structuredClone(templateRow);
        if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'uuid_1')) {
            row.uuid_1 = crypto.randomUUID();
        }
        data.push(row);
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
app.use(cors({ exposedHeaders: ['X-UseCopy-Session-Cache'] }));
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
    const activeSessions = USE_COPY_SESSION_CACHE.size;
    const redisConfigured = useCopyRedis.isConfigured();
    const redisConnected = redisConfigured && (await useCopyRedis.isReady());
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
        useCopyStore: redisConnected ? 'redis' : 'memory',
        useCopyRedisConfigured: redisConfigured,
        useCopyRedisConnected: redisConnected,
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


/** Positive integer page index for pagination bounds (useCopy ignores page for which rows are returned). */
function parsePositivePageNumber(raw, defaultPage = 1) {
    const n = parseInt(String(raw === undefined || raw === null || raw === '' ? defaultPage : raw), 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
}

// Function to handle paginated requests (shared by /data and /generate-paginated)
// Default: stateless (full params each time). useCopy=true: one template row + TTL (Redis or memory); page = N clones + new uuid_1 each
async function handlePaginatedRequest(req, res) {
    try {
        const body = req.body || {};
        const useCopyFlag =
            body.useCopy === true || body.useCopy === 'true' || body.useCopy === 1 || body.useCopy === '1';
        const existingUseCopySessionId =
            body.sessionId && String(body.sessionId).trim() !== '' ? String(body.sessionId).trim() : null;

        let useCopy = useCopyFlag;
        if (!useCopy && existingUseCopySessionId) {
            if (getUseCopySession(existingUseCopySessionId)) {
                useCopy = true;
            } else if (await useCopyRedis.isReady()) {
                const rc = await useCopyRedis.getConfig(existingUseCopySessionId);
                if (rc) {
                    useCopy = true;
                }
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
            uniformFieldLength,
            recordsPerPage,
            excludeEmoji
        } = body;
        const totalRec = totalRecords !== undefined ? totalRecords : body.numRecords;
        const currentPageNumber = parsePositivePageNumber(pageNumber, 1);
        if (currentPageNumber === null) {
            return res.status(400).json({
                error: 'Invalid page number. Must be a positive integer.'
            });
        }

        logger.debug(
            `Paginated request: ${totalRec ?? 'default'} total records, ${numFields ?? 'default'} fields, page ${currentPageNumber}, uniform: ${!!uniformFieldLength}`
        );

        const finalNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = numObjects !== undefined ? numObjects : 0;
        const finalNumNesting = numNesting !== undefined ? numNesting : 0;
        const finalTotalRecords = totalRec !== undefined ? totalRec : CONFIG.limits.numRecords.default;
        const finalNestedFields = nestedFields !== undefined ? nestedFields : 0;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : false;
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

        const { data } = generateRealisticData(
            finalNumFields,
            finalNumObjects,
            finalNumNesting,
            recordsToGenerate,
            finalNestedFields,
            finalUniformLength,
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
    const currentPageNumber = parsePositivePageNumber(body.pageNumber, 1);
    if (currentPageNumber === null) {
        return res.status(400).json({ error: 'Invalid page number. Must be a positive integer.' });
    }

    const parsed = parseValidatedUseCopySessionConfig(body);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }
    const sessionConfig = parsed.config;
    const cacheKey = buildUseCopyCacheKeyFromConfig(sessionConfig);

    const redisOk = await useCopyRedis.isReady();

    if (redisOk) {
        if (existingSessionId && existingSessionId !== cacheKey) {
            const remoteCfg = await useCopyRedis.getConfig(existingSessionId);
            if (!remoteCfg || !useCopyConfigsEqual(remoteCfg, sessionConfig)) {
                return res.status(400).json({
                    error: 'sessionId does not match the provided configuration'
                });
            }
        }
    } else {
        let entry = null;
        if (existingSessionId) {
            entry = getUseCopySession(existingSessionId);
            if (entry && !useCopyConfigsEqual(entry.config, sessionConfig)) {
                return res.status(400).json({
                    error: 'sessionId does not match the provided configuration'
                });
            }
        }
        if (!entry) {
            entry = getUseCopySession(cacheKey);
        }
        if (!entry) {
            storeUseCopySession(cacheKey, sessionConfig);
        }
    }

    const finalSessionId = cacheKey;

    const effectivePageSize = sessionConfig.recordsPerPage;
    const effectiveTotalRecords = sessionConfig.totalRecords;
    const totalPages = Math.ceil(effectiveTotalRecords / effectivePageSize);

    if (currentPageNumber > totalPages) {
        return res.status(400).json({
            error: `Page ${currentPageNumber} does not exist. Total pages: ${totalPages}`
        });
    }

    const firstPageRecordCount = Math.min(effectivePageSize, effectiveTotalRecords);

    let data;
    let sessionSnapshotHit = false;

    if (redisOk) {
        let tmpl;
        try {
            tmpl = await useCopyRedis.getOrCreateTemplateRow(sessionConfig, cacheKey, () => {
                const { data: generated } = generateRealisticData(
                    sessionConfig.numFields,
                    sessionConfig.numObjects,
                    sessionConfig.numNesting,
                    1,
                    sessionConfig.nestedFields,
                    sessionConfig.uniformFieldLength,
                    sessionConfig.excludeEmoji
                );
                return generated[0];
            });
        } catch (e) {
            logger.error(`useCopy Redis template error: ${e.message}`);
            return res.status(503).json({
                success: false,
                error: 'useCopy cache temporarily unavailable; retry shortly.'
            });
        }

        if (tmpl.error === 'lock_wait_timeout') {
            return res.status(503).json({
                success: false,
                error: 'useCopy template is being generated; retry shortly.'
            });
        }
        if (tmpl.error === 'redis_unavailable' || !tmpl.row) {
            return res.status(503).json({
                success: false,
                error: 'useCopy cache temporarily unavailable; retry shortly.'
            });
        }

        sessionSnapshotHit = tmpl.hit;
        data = pageDataFromSingleRowTemplate(tmpl.row, firstPageRecordCount);
    } else {
        let entry = getUseCopySession(cacheKey);
        if (!entry) {
            storeUseCopySession(cacheKey, sessionConfig);
            entry = getUseCopySession(cacheKey);
        }

        if (entry.responseCopyTemplate != null) {
            sessionSnapshotHit = true;
            data = pageDataFromSingleRowTemplate(entry.responseCopyTemplate, firstPageRecordCount);
        } else {
            const { data: generated } = generateRealisticData(
                sessionConfig.numFields,
                sessionConfig.numObjects,
                sessionConfig.numNesting,
                1,
                sessionConfig.nestedFields,
                sessionConfig.uniformFieldLength,
                sessionConfig.excludeEmoji
            );
            entry.responseCopyTemplate = structuredClone(generated[0]);
            USE_COPY_SESSION_CACHE.set(cacheKey, entry);
            sessionSnapshotHit = false;
            data = pageDataFromSingleRowTemplate(entry.responseCopyTemplate, firstPageRecordCount);
        }
    }

    const recordsInCurrentPage = data.length;

    res.set('X-UseCopy-Session-Cache', sessionSnapshotHit ? 'HIT' : 'MISS');

    const hasNextPage = currentPageNumber < totalPages;
    const hasPreviousPage = currentPageNumber > 1;
    const nextPageNumber = hasNextPage ? currentPageNumber + 1 : null;
    const prevPageNumber = hasPreviousPage ? currentPageNumber - 1 : null;

    const urlOpts = { sessionId: finalSessionId };
    const paginationResponse = {
        currentPage: currentPageNumber,
        totalPages,
        totalRecords: effectiveTotalRecords,
        recordsPerPage: effectivePageSize,
        recordsInCurrentPage,
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
            `Pagination complete: last page index reached (${totalPages} pages, ${effectiveTotalRecords} total records) [useCopy; ${recordsInCurrentPage} rows from one template + fresh uuid_1]`
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
            uniformFieldLength,
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
            uniformFieldLength: uniformFieldLength === 'true',
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
            let cfg = null;
            const memEntry = getUseCopySession(trimmedSessionId);
            if (memEntry) {
                cfg = memEntry.config;
            } else if (await useCopyRedis.isReady()) {
                cfg = await useCopyRedis.getConfig(trimmedSessionId);
            }
            if (!cfg) {
                return res.status(404).json({
                    success: false,
                    error: 'useCopy session not found or expired. Start again with useCopy=true and no sessionId.'
                });
            }
            const pageNum = parsedParams.pageNumber || 1;
            mockReq.body = {
                numFields: cfg.numFields,
                numObjects: cfg.numObjects,
                numNesting: cfg.numNesting,
                totalRecords: cfg.totalRecords,
                nestedFields: cfg.nestedFields,
                uniformFieldLength: cfg.uniformFieldLength,
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
            logger.debug(
                `GET /data (pagination): ${parsedParams.numRecords ?? 'default'} records, ${parsedParams.numFields ?? 'default'} fields, uniform: ${!!parsedParams.uniformFieldLength}`
            );

            // Set defaults for pagination parameters
            const finalPaginationNumFields = parsedParams.numFields !== undefined ? parsedParams.numFields : CONFIG.limits.numFields.default;
            const finalPaginationNumObjects = parsedParams.numObjects !== undefined ? parsedParams.numObjects : 0;
            const finalPaginationNumNesting = parsedParams.numNesting !== undefined ? parsedParams.numNesting : 0;
            const finalPaginationNumRecords = parsedParams.numRecords !== undefined ? parsedParams.numRecords : CONFIG.limits.numRecords.default;
            const finalPaginationNestedFields = parsedParams.nestedFields !== undefined ? parsedParams.nestedFields : 0;
            const finalPaginationUniformLength = parsedParams.uniformFieldLength !== undefined ? parsedParams.uniformFieldLength : false;
            const finalPaginationRecordsPerPage = parsedParams.recordsPerPage !== undefined ? parsedParams.recordsPerPage : 100;
            const finalPaginationExcludeEmoji = parsedParams.excludeEmoji !== undefined ? parsedParams.excludeEmoji : false;
            
            // Transform request to pagination format
            const paginationRequest = {
                numFields: finalPaginationNumFields,
                numObjects: finalPaginationNumObjects,
                numNesting: finalPaginationNumNesting,
                totalRecords: finalPaginationNumRecords,
                nestedFields: finalPaginationNestedFields,
                uniformFieldLength: finalPaginationUniformLength,
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
        
        logger.info(`GET Data request: ${parsedParams.numRecords} records, ${parsedParams.numFields} fields, uniform: ${!!parsedParams.uniformFieldLength}`);

        // Set defaults if not provided
        const finalNumFields = parsedParams.numFields !== undefined ? parsedParams.numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = parsedParams.numObjects !== undefined ? parsedParams.numObjects : 0;
        const finalNumNesting = parsedParams.numNesting !== undefined ? parsedParams.numNesting : 0;
        const finalNumRecords = parsedParams.numRecords !== undefined ? parsedParams.numRecords : CONFIG.limits.numRecords.default;
        const finalNestedFields = parsedParams.nestedFields !== undefined ? parsedParams.nestedFields : 0;
        const finalUniformLength = parsedParams.uniformFieldLength !== undefined ? parsedParams.uniformFieldLength : false;
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

        const { data } = generateRealisticData(
            finalNumFields,
            finalNumObjects,
            finalNumNesting,
            finalNumRecords,
            finalNestedFields,
            finalUniformLength,
            finalExcludeEmoji
        );

        res.json(data);
    } catch (error) {
        logger.error(`GET /data error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// POST endpoint for /data - returns just the data array (same as /generate-data but only returns data)
app.post('/data', async (req, res) => {
    try {
        const { numFields, numObjects, numNesting, numRecords, nestedFields, uniformFieldLength, enablePagination, recordsPerPage, excludeEmoji, pageNumber: postPageNumber, sessionId: postSessionId, useCopy: postUseCopy } = req.body;
        
        // If pagination is enabled, redirect to pagination logic
        if (enablePagination) {
            logger.debug(
                `POST /data (pagination): ${numRecords} total records, ${numFields} fields, uniform: ${!!uniformFieldLength}`
            );

            // Transform request to pagination format and call pagination endpoint internally
            // Set defaults for pagination parameters
            const finalPaginationNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
            const finalPaginationNumObjects = numObjects !== undefined ? numObjects : 0;
            const finalPaginationNumNesting = numNesting !== undefined ? numNesting : 0;
            const finalPaginationNumRecords = numRecords !== undefined ? numRecords : CONFIG.limits.numRecords.default;
            const finalPaginationNestedFields = nestedFields !== undefined ? nestedFields : 0;
            const finalPaginationUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : false;
            const finalPaginationRecordsPerPage = recordsPerPage !== undefined ? recordsPerPage : 100;
            const finalPaginationExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;
            
            const paginationRequest = {
                numFields: finalPaginationNumFields,
                numObjects: finalPaginationNumObjects,
                numNesting: finalPaginationNumNesting,
                totalRecords: finalPaginationNumRecords,
                nestedFields: finalPaginationNestedFields,
                uniformFieldLength: finalPaginationUniformLength,
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
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : false;
        const finalExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;

        logger.info(`Data request: ${finalNumRecords} records, ${finalNumFields} fields, uniform: ${!!finalUniformLength}`);

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
        const { data } = generateRealisticData(finalNumFields, finalNumObjects, finalNumNesting, finalNumRecords, finalNestedFields, finalUniformLength, finalExcludeEmoji);

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
        const { numFields, numObjects, numNesting, numRecords, nestedFields, uniformFieldLength, excludeEmoji } = req.body;
        
        // Set defaults if not provided
        const finalNumFields = numFields !== undefined ? numFields : CONFIG.limits.numFields.default;
        const finalNumObjects = numObjects !== undefined ? numObjects : 0;
        const finalNumNesting = numNesting !== undefined ? numNesting : 0;
        const finalNumRecords = numRecords !== undefined ? numRecords : CONFIG.limits.numRecords.default;
        const finalNestedFields = nestedFields !== undefined ? nestedFields : 0;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : false;
        const finalExcludeEmoji = excludeEmoji !== undefined ? excludeEmoji : false;

        logger.info(`Data generation request: ${finalNumRecords} records, ${finalNumFields} fields, uniform: ${!!finalUniformLength}`);

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

        const { data } = generateRealisticData(finalNumFields, finalNumObjects, finalNumNesting, finalNumRecords, finalNestedFields, finalUniformLength, finalExcludeEmoji);

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Paginated data generation (stateless: send full params + pageNumber on every request)
app.post('/generate-paginated', async (req, res) => {
    return await handlePaginatedRequest(req, res);
});

// Function to generate realistic data — uniformFieldLength seeds Faker from layout (reproducible per batch, not fixed string widths)
function generateRealisticData(
    numFields,
    numObjects,
    nestingLevel,
    numRecords,
    nestedFields,
    useUniformLength = false,
    excludeEmoji = false
) {
    const records = [];

    if (useUniformLength) {
        faker.seed(stableSeedForUniformLength(numFields, numObjects, nestingLevel, nestedFields));
    }

    for (let i = 0; i < numRecords; i++) {
        const record = generateObject(numFields, numObjects, nestingLevel, nestedFields, excludeEmoji);
        records.push(record);
    }

    return { data: records };
}

// Function to generate a single object with specified parameters
function generateObject(numFields, numObjects, nestingLevel, nestedFields = 3, excludeEmoji = false) {
    const obj = {};

    // Generate basic fields using the global FIELD_TYPES array for consistent ordering
    for (let i = 0; i < numFields; i++) {
        const fieldType = FIELD_TYPES[i % FIELD_TYPES.length];
        const fieldName = `${fieldType}_${i + 1}`;
        
        // Skip emoji-containing fields if excludeEmoji is true
        if (excludeEmoji && isEmojiField(fieldType)) {
            continue;
        }
        
        const rawValue = generateFieldValue(fieldType);
        obj[fieldName] = validateAndCleanFieldValue(fieldName, rawValue);
    }

    // Generate nested objects only if we should nest
    if (nestingLevel > 0) {
        for (let i = 0; i < numObjects; i++) {
            const objectName = `nested_object_${i + 1}`;
            if (nestingLevel > 1) {
                // Recursive nesting with same number of objects at each level
                obj[objectName] = generateObject(
                    nestedFields,
                    numObjects,
                    nestingLevel - 1,
                    nestedFields,
                    excludeEmoji
                );
            } else {
                // Last level: simple object with configurable number of fields
                obj[objectName] = generateSimpleObject(nestedFields, excludeEmoji);
            }
        }
    }

    return obj;
}

// Function to generate a simple object (no nesting)
function generateSimpleObject(numFields = 4, excludeEmoji = false) {
    const obj = {};

    // Use the same global FIELD_TYPES array for consistent ordering
    for (let i = 0; i < numFields; i++) {
        const fieldType = FIELD_TYPES[i % FIELD_TYPES.length];
        const fieldName = `${fieldType}_${i + 1}`;
        
        // Skip emoji-containing fields if excludeEmoji is true
        if (excludeEmoji && isEmojiField(fieldType)) {
            continue;
        }
        
        const rawValue = generateFieldValue(fieldType);
        obj[fieldName] = validateAndCleanFieldValue(fieldName, rawValue);
    }

    return obj;
}

// Function to check if a field type is known to contain emojis
function isEmojiField(fieldType) {
    const emojiFields = ['bio', 'emoji'];
    return emojiFields.includes(fieldType);
}

function containsEmoji(text) {
    if (typeof text !== 'string') return false;
    const emojiRegex =
        /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
    return emojiRegex.test(text);
}

function removeEmojis(text) {
    if (typeof text !== 'string') return text;
    const emojiRegex =
        /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
    return text.replace(emojiRegex, '').trim();
}

// Function to validate and clean field values
function validateAndCleanFieldValue(fieldName, fieldValue) {
    let processedValue = fieldValue;
    
    // Skip emoji validation for fields that start with "emoji"
    if (!fieldName.toLowerCase().startsWith('emoji')) {
        // Check if the field contains emojis and remove them if found
        if (containsEmoji(processedValue)) {
            processedValue = removeEmojis(processedValue);
        }
    }
    
    return processedValue;
}

// Function to generate field values based on type
function generateFieldValue(fieldType) {
    switch (fieldType) {
        // Personal Information
        case 'firstName':
            return faker.person.firstName();
        case 'lastName':
            return faker.person.lastName();
        case 'fullName':
            return faker.person.fullName();
        case 'middleName':
            return faker.person.middleName();
        case 'gender':
            return faker.person.gender();
        case 'birthDate':
            return faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0];
        case 'age':
            return faker.number.int({ min: 18, max: 85 });
        case 'bio':
            return faker.person.bio();
        case 'jobTitle':
            return faker.person.jobTitle();
        case 'suffix':
            return faker.person.suffix();
        case 'prefix':
            return faker.person.prefix();

        // Location & Address
        case 'address':
            return faker.location.streetAddress();
        case 'streetName':
            return faker.location.street();
        case 'buildingNumber':
            return faker.location.buildingNumber();
        case 'city':
            return faker.location.city();
        case 'state':
            return faker.location.state();
        case 'country':
            return faker.location.country();
        case 'zipCode':
            return faker.location.zipCode();
        case 'latitude':
            return faker.location.latitude();
        case 'longitude':
            return faker.location.longitude();
        case 'timezone':
            return faker.location.timeZone();

        // Business & Finance
        case 'company':
            return faker.company.name();
        case 'department':
            return faker.commerce.department();
        case 'catchPhrase':
            return faker.company.catchPhrase();
        case 'buzzword':
            return faker.company.buzzPhrase();
        case 'salary':
            return faker.number.int({ min: 30000, max: 200000 });
        case 'accountNumber':
            return faker.finance.accountNumber();
        case 'routingNumber':
            return faker.finance.routingNumber();
        case 'creditCard':
            return faker.finance.creditCardNumber();
        case 'currency':
            return faker.finance.currencyCode();
        case 'price':
            return parseFloat(faker.commerce.price({ min: 1, max: 1000, dec: 2 }));
        case 'transactionType':
            return faker.finance.transactionType();
        case 'bitcoinAddress':
            return faker.finance.bitcoinAddress();
        case 'bankName':
            return faker.company.name() + ' Bank';
        case 'iban':
            return faker.finance.iban();

        // Internet & Technology
        case 'email':
            return faker.internet.email();
        case 'website':
            return faker.internet.url();
        case 'username':
            return faker.internet.userName();
        case 'password':
            return faker.internet.password({ length: 12 });
        case 'domainName':
            return faker.internet.domainName();
        case 'ip':
            return faker.internet.ip();
        case 'ipv6':
            return faker.internet.ipv6();
        case 'mac':
            return faker.internet.mac();
        case 'userAgent':
            return faker.internet.userAgent();
        case 'protocol':
            return faker.internet.protocol();
        case 'port':
            return faker.internet.port();
        case 'emoji':
            return faker.internet.emoji();

        // Commerce & Products
        case 'productName':
            return faker.commerce.productName();
        case 'productDescription':
            return faker.commerce.productDescription();
        case 'productMaterial':
            return faker.commerce.productMaterial();
        case 'productAdjective':
            return faker.commerce.productAdjective();
        case 'rating':
            return faker.number.float({ min: 1, max: 5, fractionDigits: 1 });
        case 'isbn':
            return faker.commerce.isbn();
        case 'ean':
            return faker.commerce.isbn({ variant: 13 });
        case 'productCategory':
            return faker.commerce.department();

        // Vehicle & Transportation
        case 'vehicle':
            return faker.vehicle.vehicle();
        case 'vehicleModel':
            return faker.vehicle.model();
        case 'vehicleManufacturer':
            return faker.vehicle.manufacturer();
        case 'vehicleType':
            return faker.vehicle.type();
        case 'vehicleFuel':
            return faker.vehicle.fuel();
        case 'vin':
            return faker.vehicle.vin();

        // System & Files
        case 'fileName':
            return faker.system.fileName();
        case 'fileExtension':
            return faker.system.fileExt();
        case 'mimeType':
            return faker.system.mimeType();
        case 'directoryPath':
            return faker.system.directoryPath();
        case 'semver':
            return faker.system.semver();

        // Dates & Time
        case 'date':
            return faker.date.recent().toISOString();
        case 'recentDate':
            return faker.date.recent({ days: 30 }).toISOString().split('T')[0];
        case 'futureDate':
            return faker.date.future({ years: 1 }).toISOString().split('T')[0];
        case 'weekday':
            return faker.date.weekday();
        case 'month':
            return faker.date.month();

        // Text & Content
        case 'description':
            return faker.hacker.phrase();
        case 'sentence':
            return faker.lorem.sentence();
        case 'paragraph':
            return faker.lorem.paragraph();
        case 'words':
            return faker.lorem.words();
        case 'slug':
            return faker.lorem.slug();
        case 'title':
            return faker.lorem.sentence({ min: 3, max: 6 }).replace(/\.$/, '');

        // Communication
        case 'phone':
            return faker.phone.number();
        case 'phoneNumber':
            return faker.phone.number();

        // Identification & Codes
        case 'uuid':
            return crypto.randomUUID();
        case 'nanoid':
            return faker.string.nanoid();
        case 'color':
            return faker.color.human();
        case 'hexColor':
            return faker.color.rgb();
        case 'number':
            return faker.number.int({ min: 1, max: 10000 });
        case 'boolean':
            return faker.datatype.boolean();
        case 'imei':
            return faker.phone.imei();
        case 'creditCardCVV':
            return faker.finance.creditCardCVV();
        case 'licenseNumber':
            return faker.string.alphanumeric({ length: { min: 8, max: 12 } }).toUpperCase();

        default:
            return faker.word.noun();
    }
}

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
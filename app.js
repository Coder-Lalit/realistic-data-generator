const express = require('express');
const { faker } = require('@faker-js/faker');
const cors = require('cors');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;


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

// MongoDB Connection
const connectToMongoDB = async () => {
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
            logger.info('Connected to MongoDB successfully');
        } else {
            logger.warn('MONGODB_URI not found in environment variables - MongoDB storage disabled');
        }
    } catch (error) {
        logger.error(`MongoDB connection failed: ${error.message}`);
        logger.warn('Continuing without MongoDB - storage functionality disabled');
    }
};

// MongoDB Schema for storing generated data
const GeneratedDataSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    requestParams: {
        numFields: Number,
        numObjects: Number,
        numNesting: Number,
        numRecords: Number,
        nestedFields: Number,
        uniformFieldLength: Boolean,
        totalRecords: Number,
        recordsPerPage: Number,
        storeIt: Boolean
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 24 * 60 * 60 // 24 hours TTL
    }
});

const GeneratedData = mongoose.model('GeneratedData', GeneratedDataSchema);

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
            max: 300,
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
            default: false  // boolean flag to enable uniform field lengths across records
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

// Global variable to store field length mappings for uniform length mode
let FIELD_LENGTH_MAP = {};

// Schema cache for pagination with TTL (10 minutes)
const SCHEMA_CACHE = new Map();
const SCHEMA_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

// Function to generate unique session ID
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Function to generate deterministic seed for pagination
function generatePageSeed(sessionId, pageNumber) {
    // Create a consistent seed based on session ID and page number
    const sessionHash = sessionId.split('_').pop(); // Get the random part
    const pageHash = pageNumber.toString();
    const combinedString = sessionHash + pageHash;
    
    // Simple hash function to convert string to number
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
        const char = combinedString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash);
}

// Function to clean expired schemas from cache
function cleanExpiredSchemas() {
    const now = Date.now();
    for (const [sessionId, data] of SCHEMA_CACHE.entries()) {
        if (now > data.expiresAt) {
            SCHEMA_CACHE.delete(sessionId);
            console.log(`🗑️  Expired schema removed: ${sessionId}`);
        }
    }
}

// Function to store schema in cache
function storeSchemaInCache(sessionId, config, fieldLengthMap) {
    const expiresAt = Date.now() + SCHEMA_TTL;
    SCHEMA_CACHE.set(sessionId, {
        config,
        fieldLengthMap,
        hasFixedFieldLength: config.uniformFieldLength, // Store the Fixed Field Length flag
        expiresAt,
        createdAt: Date.now()
    });
    logger.info(`Schema stored for session: ${sessionId.slice(-8)} (TTL: 10min, Fixed Length: ${!!config.uniformFieldLength})`);
    
    // Clean expired schemas periodically
    cleanExpiredSchemas();
}

// Function to retrieve schema from cache and refresh TTL
function getSchemaFromCache(sessionId) {
    const data = SCHEMA_CACHE.get(sessionId);
    if (!data) {
        return null;
    }
    
    if (Date.now() > data.expiresAt) {
        SCHEMA_CACHE.delete(sessionId);
        logger.debug(`Schema expired and removed: ${sessionId.slice(-8)}`);
        return null;
    }
    
    // Refresh TTL on access
    const newExpiresAt = Date.now() + SCHEMA_TTL;
    data.expiresAt = newExpiresAt;
    SCHEMA_CACHE.set(sessionId, data);
    logger.debug(`TTL refreshed for session: ${sessionId.slice(-8)}`);
    
    return data;
}

// Function to generate field length map from a sample record
function generateFieldLengthMapFromSample(numFields, numObjects, nestingLevel, nestedFields) {
    logger.debug('Generating field length map from sample record...');
    
    // Generate one complete sample record with natural faker data
    const sampleRecord = generateObject(numFields, numObjects, nestingLevel, nestedFields, false); // false = no uniform length
    
    const lengthMap = {};
    
    // Extract field lengths from the sample record
    function extractLengthsFromObject(obj, prefix = '') {
        for (const [fieldName, fieldValue] of Object.entries(obj)) {
            if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
                // Recursively handle nested objects
                extractLengthsFromObject(fieldValue, `${prefix}${fieldName}.`);
            } else {
                // Extract field type from field name (e.g., "firstName_2" -> "firstName")
                const fieldType = fieldName.split('_')[0];
                
                // Special handling for certain field types that should keep natural length
                if (['uuid', 'nanoid'].includes(fieldType)) {
                    lengthMap[fieldType] = null; // Skip length enforcement for these
                    continue;
                }
                
                // Skip length mapping for non-string field types
                if (!isStringFieldType(fieldType)) {
                    lengthMap[fieldType] = null; // Skip length enforcement for non-string fields
                    continue;
                }
                
                // Convert value to string and get its length
                const stringValue = String(fieldValue);
                const actualLength = stringValue.length;
                
                // Store the actual length from the sample
                lengthMap[fieldType] = actualLength;
                
                logger.debug(`Field type '${fieldType}': sample value '${stringValue}' -> length ${actualLength}`);
            }
        }
    }
    
    extractLengthsFromObject(sampleRecord);
    
    logger.info(`Generated field length map from sample record with ${Object.keys(lengthMap).length} field types`);
    return lengthMap;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint for keep-alive and monitoring
app.get('/ping', (req, res) => {
    const status = {
        success: true,
        message: 'pong',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        activeSessions: SCHEMA_CACHE.size
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
async function handlePaginatedRequest(req, res) {
    try {
        const { sessionId, pageNumber, numFields, numObjects, numNesting, totalRecords, nestedFields, uniformFieldLength, recordsPerPage, storeIt } = req.body;
        // Determine if this is a new session or existing session navigation
        const isNewSession = !sessionId || sessionId === null || sessionId === "";
        const currentPageNumber = pageNumber || 1;
        
        if (isNewSession) {
            logger.info(`New pagination session: ${totalRecords} total records, ${numFields} fields, uniform: ${!!uniformFieldLength}`);
        } else {
            logger.info(`Pagination navigation: session ${sessionId.slice(-8)}, page ${currentPageNumber}`);
        }

        // Set defaults if not provided
        const finalNestedFields = nestedFields !== undefined ? nestedFields : CONFIG.limits.nestedFields.default;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : CONFIG.limits.uniformFieldLength.default;
        const finalRecordsPerPage = recordsPerPage !== undefined ? recordsPerPage : CONFIG.limits.recordsPerPage.default;

        // Validate input - for new sessions, all parameters are required
        // For existing sessions, only sessionId and pageNumber are needed
        const isExistingSession = sessionId && sessionId !== null && sessionId !== "";
        
        if (!isExistingSession && (!numFields || numObjects === undefined || numNesting === undefined || !totalRecords)) {
            return res.status(400).json({ 
                error: 'Missing required parameters: numFields, numObjects, numNesting, totalRecords' 
            });
        }

        // Validate limits using configuration - only for new sessions
        if (!isExistingSession) {
            const limits = CONFIG.limits;
            
            if (numFields < limits.numFields.min || numFields > limits.numFields.max) {
                return res.status(400).json({ 
                    error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
                });
            }

            if (numObjects < limits.numObjects.min || numObjects > limits.numObjects.max) {
                return res.status(400).json({ 
                    error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
                });
            }

            if (numNesting < limits.numNesting.min || numNesting > limits.numNesting.max) {
                return res.status(400).json({ 
                    error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
                });
            }

            if (totalRecords < limits.totalRecordsPagination.min || totalRecords > limits.totalRecordsPagination.max) {
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
        }

        // Performance warning for very large paginated datasets
        if (totalRecords > 100000) {
            logger.warn(`Large paginated dataset requested: ${totalRecords} total records. This will create ${Math.ceil(totalRecords / finalRecordsPerPage)} pages.`);
        }
        
        // Memory usage estimation for pagination (more realistic calculation)
        const avgFieldSize = 25; // Average bytes per field (JSON + field name + value)
        const estimatedMemoryMB = Math.ceil((finalRecordsPerPage * numFields * avgFieldSize) / (1024 * 1024));
        if (estimatedMemoryMB > 200) { // Per page threshold
            logger.warn(`Estimated memory usage per page: ~${estimatedMemoryMB}MB. Total dataset: ${totalRecords.toLocaleString()} records.`);
        }

        // Handle session ID and page validation
        let finalSessionId;
        let cachedData = null;
        
        if (isNewSession) {
            // Generate new session ID for new sessions
            finalSessionId = generateSessionId();
            
            // Validate page number for new sessions (should be 1 or undefined)
            if (currentPageNumber !== 1) {
                return res.status(400).json({ 
                    error: 'New sessions must start from page 1' 
                });
            }
        } else {
            // Use provided session ID and validate it exists
            finalSessionId = sessionId;
            
            // Validate page number for existing sessions
            if (currentPageNumber < 1) {
                return res.status(400).json({ 
                    error: 'Invalid page number. Must be a positive integer.' 
                });
            }
            
            // Retrieve and validate existing session
            cachedData = getSchemaFromCache(finalSessionId);
            if (!cachedData) {
                return res.status(404).json({ 
                    error: 'Session not found or expired. Please start a new pagination session.' 
                });
            }
        }
        
        // Handle configuration for new vs existing sessions
        let sessionConfig;
        let effectivePageSize;
        let effectiveTotalRecords;
        let fieldLengthMap = null;
        
        if (isNewSession) {
            // Store configuration for new sessions
            sessionConfig = {
                numFields,
                numObjects,
                numNesting,
                totalRecords,
                nestedFields: finalNestedFields,
                uniformFieldLength: finalUniformLength,
                recordsPerPage: finalRecordsPerPage
            };
            
            effectivePageSize = finalRecordsPerPage;
            effectiveTotalRecords = totalRecords;
            
            // Generate field length map if uniform length is requested
            if (finalUniformLength) {
                fieldLengthMap = generateFieldLengthMapFromSample(numFields, numObjects, numNesting, finalNestedFields);
            }
            
            // Store in cache for new sessions
            storeSchemaInCache(finalSessionId, sessionConfig, fieldLengthMap);
        } else {
            // Use cached configuration for existing sessions
            sessionConfig = {
                numFields: cachedData.config.numFields,
                numObjects: cachedData.config.numObjects,
                numNesting: cachedData.config.numNesting,
                totalRecords: cachedData.config.totalRecords,
                nestedFields: cachedData.config.nestedFields,
                uniformFieldLength: cachedData.config.uniformFieldLength,
                recordsPerPage: cachedData.config.recordsPerPage
            };
            
            effectivePageSize = cachedData.config.recordsPerPage;
            effectiveTotalRecords = cachedData.config.totalRecords;
            fieldLengthMap = cachedData.fieldLengthMap;
        }

        // Validate page number against total records
        const totalPages = Math.ceil(effectiveTotalRecords / effectivePageSize);
        if (currentPageNumber > totalPages) {
            return res.status(400).json({ 
                error: `Page ${currentPageNumber} does not exist. Total pages: ${totalPages}` 
            });
        }

        // Generate data for requested page
        const startIndex = (currentPageNumber - 1) * effectivePageSize;
        const endIndex = Math.min(startIndex + effectivePageSize, effectiveTotalRecords);
        const recordsToGenerate = endIndex - startIndex;
        
        // Temporarily set the global field length map for this generation
        if (fieldLengthMap) {
            FIELD_LENGTH_MAP = fieldLengthMap;
        }

        // Generate deterministic data for requested page
        const seed = generatePageSeed(finalSessionId, currentPageNumber);
        const data = generateRealisticData(
            sessionConfig.numFields, 
            sessionConfig.numObjects, 
            sessionConfig.numNesting, 
            recordsToGenerate, 
            sessionConfig.nestedFields, 
            sessionConfig.uniformFieldLength, 
            seed
        );
        
        // Calculate pagination info
        const hasNextPage = currentPageNumber < totalPages;
        const hasPreviousPage = currentPageNumber > 1;

        // Generate page numbers for navigation
        const nextPageNumber = hasNextPage ? currentPageNumber + 1 : null;
        const prevPageNumber = hasPreviousPage ? currentPageNumber - 1 : null;

        // Build pagination response
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

        // Add navigation URLs for GET requests
        if (req.method === 'GET') {
            const baseUrl = `${req.protocol}://${req.get('host')}/data`;
            const baseParams = `enablePagination=true&sessionId=${finalSessionId}`;
            
            paginationResponse.nextUrl = hasNextPage ? 
                `${baseUrl}?${baseParams}&pageNumber=${nextPageNumber}` : null;
            paginationResponse.prevUrl = hasPreviousPage ? 
                `${baseUrl}?${baseParams}&pageNumber=${prevPageNumber}` : null;
        }

        res.json({
            success: true,
            sessionId: finalSessionId,
            data,
            pagination: paginationResponse
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
            storeIt,
            enablePagination,
            recordsPerPage,
            sessionId,
            pageNumber
        } = req.query;

        // Convert string parameters to appropriate types
        const parsedParams = {
            numFields: numFields ? parseInt(numFields) : undefined,
            numObjects: numObjects !== undefined ? parseInt(numObjects) : undefined,
            numNesting: numNesting !== undefined ? parseInt(numNesting) : undefined,
            numRecords: numRecords ? parseInt(numRecords) : undefined,
            nestedFields: nestedFields !== undefined ? parseInt(nestedFields) : undefined,
            uniformFieldLength: uniformFieldLength === 'true',
            storeIt: storeIt === 'true',
            enablePagination: enablePagination === 'true',
            recordsPerPage: recordsPerPage ? parseInt(recordsPerPage) : undefined,
            sessionId: sessionId || undefined,
            pageNumber: pageNumber ? parseInt(pageNumber) : undefined
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

        // If pagination is enabled, redirect to pagination logic
        if (parsedParams.enablePagination) {
            logger.info(`GET Data request (pagination): ${parsedParams.numRecords || 'existing session'} total records, ${parsedParams.numFields || 'cached'} fields, uniform: ${!!parsedParams.uniformFieldLength}, store: ${!!parsedParams.storeIt}`);
            
            // Transform request to pagination format
            const paginationRequest = {
                numFields: parsedParams.numFields,
                numObjects: parsedParams.numObjects,
                numNesting: parsedParams.numNesting,
                totalRecords: parsedParams.numRecords,
                nestedFields: parsedParams.nestedFields,
                uniformFieldLength: parsedParams.uniformFieldLength,
                recordsPerPage: parsedParams.recordsPerPage,
                pageNumber: parsedParams.pageNumber || 1,
                sessionId: parsedParams.sessionId
            };
            
            // Call the pagination logic directly
            mockReq.body = paginationRequest;
            return await handlePaginatedRequest(mockReq, res);
        }
        
        logger.info(`GET Data request: ${parsedParams.numRecords} records, ${parsedParams.numFields} fields, uniform: ${!!parsedParams.uniformFieldLength}, store: ${!!parsedParams.storeIt}`);

        // Set defaults if not provided
        const finalNestedFields = parsedParams.nestedFields !== undefined ? parsedParams.nestedFields : CONFIG.limits.nestedFields.default;
        const finalUniformLength = parsedParams.uniformFieldLength !== undefined ? parsedParams.uniformFieldLength : CONFIG.limits.uniformFieldLength.default;
        const finalStoreIt = parsedParams.storeIt !== undefined ? parsedParams.storeIt : false;

        // Validate input
        if (!parsedParams.numFields || parsedParams.numObjects === undefined || parsedParams.numNesting === undefined || !parsedParams.numRecords) {
            return res.status(400).json({ 
                error: 'Missing required parameters: numFields, numObjects, numNesting, numRecords' 
            });
        }

        const limits = CONFIG.limits;

        // Validate numFields
        if (parsedParams.numFields < limits.numFields.min || parsedParams.numFields > limits.numFields.max) {
            return res.status(400).json({ 
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
            });
        }

        // Validate numObjects
        if (parsedParams.numObjects < limits.numObjects.min || parsedParams.numObjects > limits.numObjects.max) {
            return res.status(400).json({ 
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
            });
        }

        // Validate numNesting
        if (parsedParams.numNesting < limits.numNesting.min || parsedParams.numNesting > limits.numNesting.max) {
            return res.status(400).json({ 
                error: `Nesting level must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
            });
        }

        // Validate numRecords
        if (parsedParams.numRecords < limits.numRecords.min || parsedParams.numRecords > limits.numRecords.max) {
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
        if (parsedParams.numRecords > 100000) {
            logger.warn(`Large dataset requested: ${parsedParams.numRecords} records. Consider using pagination for better performance.`);
        }
        const estimatedMemoryMB = Math.ceil((parsedParams.numRecords * parsedParams.numFields * 50) / (1024 * 1024));
        if (estimatedMemoryMB > 500) {
            logger.warn(`Estimated memory usage: ~${estimatedMemoryMB}MB. Monitor server resources.`);
        }

        // Generate data
        const data = generateRealisticData(
            parsedParams.numFields, 
            parsedParams.numObjects, 
            parsedParams.numNesting, 
            parsedParams.numRecords, 
            finalNestedFields, 
            finalUniformLength
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
        const { numFields, numObjects, numNesting, numRecords, nestedFields, uniformFieldLength, storeIt, enablePagination, recordsPerPage } = req.body;
        
        // If pagination is enabled, redirect to pagination logic
        if (enablePagination) {
            logger.info(`Data request (pagination): ${numRecords} total records, ${numFields} fields, uniform: ${!!uniformFieldLength}, store: ${!!storeIt}`);
            
            // Transform request to pagination format and call pagination endpoint internally
            const paginationRequest = {
                numFields,
                numObjects,
                numNesting,
                totalRecords: numRecords,
                nestedFields,
                uniformFieldLength,
                recordsPerPage: recordsPerPage || 100,
                pageNumber: 1 // Default to first page
            };
            
            // Call the pagination logic directly
            req.body = paginationRequest;
            return await handlePaginatedRequest(req, res);
        }
        
        logger.info(`Data request: ${numRecords} records, ${numFields} fields, uniform: ${!!uniformFieldLength}, store: ${!!storeIt}`);

        // Set defaults if not provided
        const finalNestedFields = nestedFields !== undefined ? nestedFields : CONFIG.limits.nestedFields.default;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : CONFIG.limits.uniformFieldLength.default;
        const finalStoreIt = storeIt !== undefined ? storeIt : false;

        // Validate input
        if (!numFields || numObjects === undefined || numNesting === undefined || !numRecords) {
            return res.status(400).json({ 
                error: 'Missing required parameters: numFields, numObjects, numNesting, numRecords' 
            });
        }

        const limits = CONFIG.limits;

        // Validate numFields
        if (numFields < limits.numFields.min || numFields > limits.numFields.max) {
            return res.status(400).json({ 
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
            });
        }

        // Validate numObjects
        if (numObjects < limits.numObjects.min || numObjects > limits.numObjects.max) {
            return res.status(400).json({ 
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
            });
        }

        // Validate numNesting
        if (numNesting < limits.numNesting.min || numNesting > limits.numNesting.max) {
            return res.status(400).json({ 
                error: `Nesting level must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
            });
        }

        // Validate numRecords
        if (numRecords < limits.numRecords.min || numRecords > limits.numRecords.max) {
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
        if (numRecords > 100000) {
            logger.warn(`Large dataset requested: ${numRecords} records. Consider using pagination for better performance.`);
        }
        
        // Memory usage estimation (more realistic calculation)
        const avgFieldSize = 25; // Average bytes per field (JSON + field name + value)
        const estimatedMemoryMB = Math.ceil((numRecords * numFields * avgFieldSize) / (1024 * 1024));
        if (estimatedMemoryMB > 1000) { // Increased threshold to 1GB
            logger.warn(`Estimated memory usage: ~${estimatedMemoryMB}MB. Monitor server resources.`);
        }

        // Generate data
        const data = generateRealisticData(numFields, numObjects, numNesting, numRecords, finalNestedFields, finalUniformLength);

        // Store to MongoDB if requested
        if (finalStoreIt) {
            const sessionId = `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const requestParams = {
                numFields,
                numObjects,
                numNesting,
                numRecords,
                nestedFields: finalNestedFields,
                uniformFieldLength: finalUniformLength,
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
        const { numFields, numObjects, numNesting, numRecords, nestedFields, uniformFieldLength, storeIt } = req.body;
        logger.info(`Data generation request: ${numRecords} records, ${numFields} fields, uniform: ${!!uniformFieldLength}, store: ${!!storeIt}`);

        // Set defaults if not provided
        const finalNestedFields = nestedFields !== undefined ? nestedFields : CONFIG.limits.nestedFields.default;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : CONFIG.limits.uniformFieldLength.default;
        const finalStoreIt = storeIt !== undefined ? storeIt : false;

        // Validate input
        if (!numFields || numObjects === undefined || numNesting === undefined || !numRecords) {
            return res.status(400).json({ 
                error: 'Missing required parameters: numFields, numObjects, numNesting, numRecords' 
            });
        }

        // Validate limits using configuration
        const limits = CONFIG.limits;
        
        if (numFields < limits.numFields.min || numFields > limits.numFields.max) {
            return res.status(400).json({ 
                error: `Number of fields must be between ${limits.numFields.min} and ${limits.numFields.max}` 
            });
        }

        if (numObjects < limits.numObjects.min || numObjects > limits.numObjects.max) {
            return res.status(400).json({ 
                error: `Number of objects must be between ${limits.numObjects.min} and ${limits.numObjects.max}` 
            });
        }

        if (numNesting < limits.numNesting.min || numNesting > limits.numNesting.max) {
            return res.status(400).json({ 
                error: `Nesting depth must be between ${limits.numNesting.min} and ${limits.numNesting.max}` 
            });
        }

        if (numRecords < limits.numRecords.min || numRecords > limits.numRecords.max) {
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
        if (numRecords > 100000) {
            logger.warn(`Large dataset requested: ${numRecords} records. Consider using pagination for better performance.`);
        }
        
        // Memory usage estimation (more realistic calculation)
        const avgFieldSize = 25; // Average bytes per field (JSON + field name + value)
        const estimatedMemoryMB = Math.ceil((numRecords * numFields * avgFieldSize) / (1024 * 1024));
        if (estimatedMemoryMB > 1000) { // Increased threshold to 1GB
            logger.warn(`Estimated memory usage: ~${estimatedMemoryMB}MB. Monitor server resources.`);
        }

        const data = generateRealisticData(numFields, numObjects, numNesting, numRecords, finalNestedFields, finalUniformLength);
        
        // Store to MongoDB if requested
        if (finalStoreIt) {
            const sessionId = `generate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const requestParams = {
                numFields,
                numObjects,
                numNesting,
                numRecords,
                nestedFields: finalNestedFields,
                uniformFieldLength: finalUniformLength,
                storeIt: finalStoreIt
            };
            
            await storeDataToMongoDB(sessionId, requestParams, data);
        }
        
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Unified paginated data generation endpoint - handles both new sessions and page navigation
app.post('/generate-paginated', async (req, res) => {
    return await handlePaginatedRequest(req, res);
});

// Function to generate realistic data
function generateRealisticData(numFields, numObjects, nestingLevel, numRecords, nestedFields, useUniformLength = false, seed = null) {
    const records = [];

    // Handle schema generation based on useUniformLength flag
    if (useUniformLength) {
        // Only generate new map if no map exists (for initial session creation)
        if (!FIELD_LENGTH_MAP || Object.keys(FIELD_LENGTH_MAP).length === 0) {
            FIELD_LENGTH_MAP = generateFieldLengthMapFromSample(numFields, numObjects, nestingLevel, nestedFields);
            logger.debug(`Generated new field length map from sample record for uniform length data`);
        }
    } else {
        // For non-uniform length, completely skip schema generation
        // Just generate natural data without any length processing
        FIELD_LENGTH_MAP = null;
        logger.debug(`Generating natural data without any schema or length processing`);
    }

    // Set seed for deterministic generation (pagination consistency)
    if (seed !== null) {
        faker.seed(seed);
        logger.debug(`Using deterministic seed: ${seed} for consistent data generation`);
    }

    for (let i = 0; i < numRecords; i++) {
        // For pagination, create a unique seed for each record based on base seed + index
        if (seed !== null) {
            // Create deterministic seed for this specific record
            faker.seed(seed + (i * 1000)); // Multiply by 1000 to ensure distinct seeds
        }
        
        const record = generateObject(numFields, numObjects, nestingLevel, nestedFields, useUniformLength);
        records.push(record);
    }

    return records;
}

// Function to generate a single object with specified parameters
function generateObject(numFields, numObjects, nestingLevel, nestedFields = 3, useUniformLength = false) {
    const obj = {};

    // Generate basic fields using the global FIELD_TYPES array for consistent ordering
    for (let i = 0; i < numFields; i++) {
        const fieldType = FIELD_TYPES[i % FIELD_TYPES.length];
        const fieldName = `${fieldType}_${i + 1}`;
        const rawValue = generateFieldValue(fieldType);
        obj[fieldName] = validateAndCleanFieldValue(fieldName, rawValue, fieldType, useUniformLength);
    }

    // Generate nested objects only if we should nest
    if (nestingLevel > 0) {
        for (let i = 0; i < numObjects; i++) {
            const objectName = `nested_object_${i + 1}`;
            if (nestingLevel > 1) {
                // Recursive nesting with same number of objects at each level
                obj[objectName] = generateObject(nestedFields, numObjects, nestingLevel - 1, nestedFields, useUniformLength);
            } else {
                // Last level: simple object with configurable number of fields
                obj[objectName] = generateSimpleObject(nestedFields, useUniformLength);
            }
        }
    }

    return obj;
}

// Function to generate a simple object (no nesting)
function generateSimpleObject(numFields = 4, useUniformLength = false) {
    const obj = {};

    // Use the same global FIELD_TYPES array for consistent ordering
    for (let i = 0; i < numFields; i++) {
        const fieldType = FIELD_TYPES[i % FIELD_TYPES.length];
        const fieldName = `${fieldType}_${i + 1}`;
        const rawValue = generateFieldValue(fieldType);
        obj[fieldName] = validateAndCleanFieldValue(fieldName, rawValue, fieldType, useUniformLength);
    }

    return obj;
}

// Function to detect if text contains emoji characters
function containsEmoji(text) {
    if (typeof text !== 'string') return false;
    
    // Unicode ranges for emojis
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
    
    return emojiRegex.test(text);
}

// Function to remove emoji characters from text
function removeEmojis(text) {
    if (typeof text !== 'string') return text;
    
    // Unicode ranges for emojis
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
    
    return text.replace(emojiRegex, '').trim();
}

// Function to determine if a field type generates string values
function isStringFieldType(fieldType) {
    // Field types that generate non-string values
    const nonStringFieldTypes = [
        'age',           // number
        'latitude',      // number  
        'longitude',     // number
        'salary',        // number
        'price',         // number
        'number',        // number
        'rating',        // number
        'port',          // number
        'boolean'        // boolean
    ];
    
    return !nonStringFieldTypes.includes(fieldType);
}

// Function to enforce uniform field length based on field type
function enforceUniformLength(fieldValue, fieldType, useUniformLength) {
    if (!useUniformLength || !FIELD_LENGTH_MAP || !FIELD_LENGTH_MAP.hasOwnProperty(fieldType) || FIELD_LENGTH_MAP[fieldType] === null) {
        return fieldValue; // No length enforcement, no map, or special null marker
    }
    
    // Only enforce length for string field types
    if (!isStringFieldType(fieldType)) {
        return fieldValue; // Skip length enforcement for non-string fields
    }
    
    const targetLength = FIELD_LENGTH_MAP[fieldType];
    
    // Convert to string if not already
    let stringValue = String(fieldValue);
    
    if (stringValue.length > targetLength) {
        // Truncate to exact target length for ALL field types
        return stringValue.substring(0, targetLength);
    } else if (stringValue.length < targetLength) {
        // Pad ALL field types to exact target length
        const additionalChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        while (stringValue.length < targetLength) {
            const randomIndex = Math.floor(faker.number.float({ min: 0, max: 1 }) * additionalChars.length);
            stringValue += additionalChars[randomIndex];
        }
        return stringValue;
    }
    
    return stringValue;
}

// Function to validate and clean field values
function validateAndCleanFieldValue(fieldName, fieldValue, fieldType, useUniformLength = false) {
    let processedValue = fieldValue;
    
    // Skip emoji validation for fields that start with "emoji"
    if (!fieldName.toLowerCase().startsWith('emoji')) {
        // Check if the field contains emojis and remove them if found
        if (containsEmoji(processedValue)) {
            processedValue = removeEmojis(processedValue);
        }
    }
    
    // Apply uniform length if specified and field length map exists
    if (useUniformLength && FIELD_LENGTH_MAP && FIELD_LENGTH_MAP.hasOwnProperty(fieldType) && FIELD_LENGTH_MAP[fieldType] !== null) {
        const originalLength = String(processedValue).length;
        const targetLength = FIELD_LENGTH_MAP[fieldType];
        processedValue = enforceUniformLength(processedValue, fieldType, useUniformLength);
        const finalLength = String(processedValue).length;
        if (originalLength !== finalLength) {
            logger.debug(`Field '${fieldName}' (${fieldType}) length: ${originalLength} → ${finalLength} (target: ${targetLength})`);
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
        case 'timeZone':
            return faker.location.timeZone();

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
            return faker.string.uuid();
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
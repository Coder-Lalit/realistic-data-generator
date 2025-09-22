const express = require('express');
const { faker } = require('@faker-js/faker');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

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
            max: 10000,
            default: 10
        },
        nestedFields: {
            min: 0,
            max: 50,
            default: 3
        },
        uniformFieldLength: {
            default: false  // boolean flag to enable uniform field lengths across records
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

// Function to generate random field length map
function generateFieldLengthMap() {
    const lengthMap = {};
    
    // Create different length categories for variety
    const lengthCategories = {
        veryShort: [3, 4, 5],
        short: [6, 7, 8, 9, 10],
        medium: [11, 12, 13, 14, 15, 16, 17, 18],
        long: [19, 20, 21, 22, 23, 24, 25],
        veryLong: [26, 27, 28, 29, 30, 35, 40]
    };
    
    for (const fieldType of FIELD_TYPES) {
        let selectedCategory;
        
        // Assign categories based on field type characteristics, but with some randomness
        switch (fieldType) {
            case 'uuid':
            case 'nanoid':
                // These should keep their natural length - skip uniform length enforcement
                lengthMap[fieldType] = null; // Special marker to skip length enforcement
                continue;
                
            case 'age':
            case 'rating':
            case 'number':
            case 'port':
                selectedCategory = Math.random() < 0.8 ? 'veryShort' : 'short';
                break;
                
            case 'boolean':
            case 'currency':
            case 'zipCode':
            case 'fileExtension':
                selectedCategory = Math.random() < 0.7 ? 'veryShort' : 'short';
                break;
                
            case 'firstName':
            case 'lastName':
            case 'middleName':
            case 'city':
            case 'state':
            case 'country':
            case 'color':
            case 'weekday':
            case 'month':
                selectedCategory = Math.random() < 0.6 ? 'short' : 'medium';
                break;
                
            case 'fullName':
            case 'email':
            case 'website':
            case 'username':
            case 'company':
            case 'jobTitle':
            case 'phone':
            case 'phoneNumber':
                selectedCategory = Math.random() < 0.5 ? 'medium' : 'long';
                break;
                
            case 'address':
            case 'description':
            case 'sentence':
            case 'title':
            case 'productName':
            case 'productDescription':
            case 'catchPhrase':
            case 'buzzword':
                selectedCategory = Math.random() < 0.4 ? 'long' : 'veryLong';
                break;
                
            case 'paragraph':
            case 'bio':
            case 'userAgent':
            case 'directoryPath':
                selectedCategory = Math.random() < 0.8 ? 'veryLong' : 'long';
                break;
                
            default:
                // Random assignment for other fields
                const categories = Object.keys(lengthCategories);
                selectedCategory = categories[Math.floor(Math.random() * categories.length)];
                break;
        }
        
        // Pick a random length from the selected category
        const availableLengths = lengthCategories[selectedCategory];
        lengthMap[fieldType] = availableLengths[Math.floor(Math.random() * availableLengths.length)];
    }
    
    console.log('🎲 Generated random field length schema:', lengthMap);
    return lengthMap;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/ping', (req, res) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    };
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

// Data generation endpoint
app.post('/generate-data', (req, res) => {
    try {
        const { numFields, numObjects, numNesting, numRecords, nestedFields, uniformFieldLength } = req.body;

        // Set defaults if not provided
        const finalNestedFields = nestedFields !== undefined ? nestedFields : CONFIG.limits.nestedFields.default;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : CONFIG.limits.uniformFieldLength.default;

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

        const data = generateRealisticData(numFields, numObjects, numNesting, numRecords, finalNestedFields, finalUniformLength);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Data-only endpoint (returns only data array without success wrapper)
app.post('/data', (req, res) => {
    try {
        const { numFields, numObjects, numNesting, numRecords, nestedFields, uniformFieldLength } = req.body;

        // Set defaults if not provided
        const finalNestedFields = nestedFields !== undefined ? nestedFields : CONFIG.limits.nestedFields.default;
        const finalUniformLength = uniformFieldLength !== undefined ? uniformFieldLength : CONFIG.limits.uniformFieldLength.default;

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

        const data = generateRealisticData(numFields, numObjects, numNesting, numRecords, finalNestedFields, finalUniformLength);
        res.json(data); // Return only the data array
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Function to generate realistic data
function generateRealisticData(numFields, numObjects, nestingLevel, numRecords, nestedFields, useUniformLength = false) {
    const records = [];

    // Generate field length map if uniform length is requested
    if (useUniformLength) {
        FIELD_LENGTH_MAP = generateFieldLengthMap();
    }

    for (let i = 0; i < numRecords; i++) {
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

// Function to enforce uniform field length based on field type
function enforceUniformLength(fieldValue, fieldType, useUniformLength) {
    if (!useUniformLength || !FIELD_LENGTH_MAP.hasOwnProperty(fieldType) || FIELD_LENGTH_MAP[fieldType] === null) {
        return fieldValue; // No length enforcement or special null marker
    }
    
    const targetLength = FIELD_LENGTH_MAP[fieldType];
    
    // Convert to string if not already
    let stringValue = String(fieldValue);
    
    if (stringValue.length > targetLength) {
        // Truncate and add ellipsis if too long (but ensure minimum length of 3 for ellipsis)
        if (targetLength <= 3) {
            return stringValue.substring(0, targetLength);
        } else {
            return stringValue.substring(0, targetLength - 3) + '...';
        }
    } else if (stringValue.length < targetLength) {
        // For specific field types, pad to exact length
        if (['number', 'age', 'rating', 'port', 'zipCode', 'boolean'].includes(fieldType)) {
            return stringValue.padEnd(targetLength, ' ');
        }
        // For text fields, generate additional content to reach target length
        if (['firstName', 'lastName', 'middleName', 'city', 'state', 'country'].includes(fieldType)) {
            // For names, add random characters
            const additionalChars = 'abcdefghijklmnopqrstuvwxyz';
            while (stringValue.length < targetLength) {
                stringValue += additionalChars[Math.floor(Math.random() * additionalChars.length)];
            }
            return stringValue;
        }
        // For other fields, keep natural length if shorter than target
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
            console.log(`⚠️  Emoji detected in field '${fieldName}': ${processedValue}`);
            processedValue = removeEmojis(processedValue);
            console.log(`✅ Cleaned field '${fieldName}': ${processedValue}`);
        }
    }
    
    // Apply uniform length if specified
    if (useUniformLength && FIELD_LENGTH_MAP.hasOwnProperty(fieldType) && FIELD_LENGTH_MAP[fieldType] !== null) {
        const originalLength = String(processedValue).length;
        const targetLength = FIELD_LENGTH_MAP[fieldType];
        processedValue = enforceUniformLength(processedValue, fieldType, useUniformLength);
        const finalLength = String(processedValue).length;
        if (originalLength !== finalLength) {
            console.log(`📏 Adjusted field '${fieldName}' (${fieldType}) length: ${originalLength} → ${finalLength} (target: ${targetLength})`);
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
    console.log(`🚀 Data Generator Server running on http://localhost:${PORT}`);
    
    // Start health check ping every 5 minutes to keep app alive
    setInterval(() => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/ping',
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            console.log(`📡 Health check ping: ${res.statusCode} at ${new Date().toISOString()}`);
        });

        req.on('error', (err) => {
            console.error(`❌ Health check ping failed: ${err.message}`);
        });

        req.end();
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
    
    console.log(`💓 Health check ping scheduled every 5 minutes`);
}); 
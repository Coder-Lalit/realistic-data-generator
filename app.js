const express = require('express');
const { faker } = require('@faker-js/faker');
const cors = require('cors');
const path = require('path');

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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
        const { numFields, numObjects, numNesting, numRecords, nestedFields } = req.body;

        // Set default for nestedFields if not provided
        const finalNestedFields = nestedFields !== undefined ? nestedFields : CONFIG.limits.nestedFields.default;

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

        const data = generateRealisticData(numFields, numObjects, numNesting, numRecords, finalNestedFields);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Function to generate realistic data
function generateRealisticData(numFields, numObjects, nestingLevel, numRecords, nestedFields) {
    const records = [];

    for (let i = 0; i < numRecords; i++) {
        const record = generateObject(numFields, numObjects, nestingLevel, nestedFields);
        records.push(record);
    }

    return records;
}

// Function to generate a single object with specified parameters
function generateObject(numFields, numObjects, nestingLevel, nestedFields = 3) {
    const obj = {};

    // Generate basic fields using the global FIELD_TYPES array for consistent ordering
    for (let i = 0; i < numFields; i++) {
        const fieldType = FIELD_TYPES[i % FIELD_TYPES.length];
        const fieldName = `${fieldType}_${i + 1}`;
        obj[fieldName] = generateFieldValue(fieldType);
    }

    // Generate nested objects
    for (let i = 0; i < numObjects; i++) {
        const objectName = `nested_object_${i + 1}`;
        if (nestingLevel > 0) {
            // Recursive nesting with configurable nested fields
            const nestedObjects = Math.max(0, numObjects - 1);
            obj[objectName] = generateObject(nestedFields, nestedObjects, nestingLevel - 1, nestedFields);
        } else {
            // Simple object with configurable number of fields
            obj[objectName] = generateSimpleObject(nestedFields);
        }
    }

    return obj;
}

// Function to generate a simple object (no nesting)
function generateSimpleObject(numFields = 4) {
    const obj = {};

    // Use the same global FIELD_TYPES array for consistent ordering
    for (let i = 0; i < numFields; i++) {
        const fieldType = FIELD_TYPES[i % FIELD_TYPES.length];
        const fieldName = `${fieldType}_${i + 1}`;
        obj[fieldName] = generateFieldValue(fieldType);
    }

    return obj;
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
}); 
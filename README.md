# 🎲 Realistic Data Generator

A powerful Node.js application with a modern web UI for generating realistic JSON data with customizable parameters. Perfect for testing, prototyping, and development purposes.

## ✨ Features

- **🎯 Customizable Parameters**: Control the number of fields, nested objects, nesting depth, and records
- **🤖 Realistic Data**: Uses Faker.js to generate authentic-looking data (names, emails, addresses, etc.)
- **🔄 Flexible Nesting**: Support for complex nested object structures
- **🎨 Modern UI**: Beautiful, responsive web interface with gradient backgrounds and smooth animations
- **📋 Easy Export**: Copy to clipboard or download as JSON file
- **⚡ Real-time Generation**: Fast data generation with loading indicators
- **📱 Mobile Friendly**: Fully responsive design that works on all devices
- **🔒 Fixed Field Length Mode**: Generate data with consistent field lengths for UI/layout testing
- **🌿 Natural Length Mode**: Generate data with realistic, varying field lengths
- **📄 Pagination Support**: Handle large datasets (10K+ records) with efficient pagination
- **🎯 Smart Field Type Detection**: Intelligent handling of string vs non-string field types
- **🧪 Comprehensive Testing**: Full test suite with validation for different data generation modes
- **🔄 useCopy (session cache)**: One **template row** per config fingerprint; each response builds the page as **N clones** with new **`uuid_1`** (tiny Redis footprint). Optional **`REDIS_URL`** for multi-instance; otherwise in-memory. Parallel first requests coordinate with a **Redis lock** (wait/retry; rare **503** if generation is slow). Deterministic **`sessionId`**; **`pageNumber`** only drives pagination bounds
- **🔄 Environment Configuration**: Optional `.env` for port, logging, compression, and proxy settings

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

### Development Mode

For development with auto-restart:
```bash
npm run dev
```

## 🎮 Usage

### Web Interface

1. **Set Parameters**:
   - **Number of Fields** (1+): Basic data fields like names, emails, addresses
   - **Number of Nested Objects** (0-10): Objects nested within each record
   - **Fields per Nested Object** (0-50): Number of fields in each nested object
   - **Nesting Depth** (0-5): How deep the nesting structure goes
   - **Number of Records** (1-10000): Total number of data records to generate

2. **Generate Data**: Click the "Generate Data" button

3. **Export Options**:
   - **Copy JSON**: Copy the generated data to clipboard
   - **Download JSON**: Download as a `.json` file

## 🔒 Fixed Field Length Mode

The data generator supports **Fixed Field Length Mode** for consistent UI/layout testing. This feature ensures all string fields have uniform lengths across all records while preserving the natural data types of non-string fields.

### 🎯 How It Works

When `uniformFieldLength: true` is enabled:

1. **String Fields**: Get consistent lengths based on a sample record
   - `firstName_2`: All names will be exactly 8 characters
   - `lastName_3`: All surnames will be exactly 5 characters  
   - `email_39`: All emails will be exactly 25 characters
   
2. **Non-String Fields**: Maintain their natural values and types
   - `age_8`: Remains a number (e.g., 25, 67, 43)
   - `boolean_85`: Remains a boolean (true/false)
   - `latitude_22`: Remains a float (e.g., 55.4593)
   - `uuid_1`: Maintains standard 36-character UUID format

### 🧠 Smart Field Type Detection

The system intelligently categorizes fields into:

**String Fields** (length enforced):
- Personal info: `firstName`, `lastName`, `fullName`, `bio`, etc.
- Contact info: `email`, `phone`, `address`, etc.
- Business data: `company`, `jobTitle`, `department`, etc.
- Technical data: `uuid`, `nanoid`, `ip`, `userAgent`, etc.

**Non-String Fields** (natural values preserved):
- **Numbers**: `age`, `salary`, `price`, `rating`, `port`, `number`
- **Floats**: `latitude`, `longitude`  
- **Booleans**: `boolean`

### 📊 Example Comparison

**Fixed Length Mode (`uniformFieldLength: true`)**:
```json
[
  {
    "uuid_1": "4bb76e61-309c-4b28-b10d-e16d6e0fc411",
    "firstName_2": "Joh",      // ← 3 chars (consistent)
    "lastName_3": "Smithxyz",  // ← 8 chars (consistent) 
    "age_8": 25,               // ← Natural number
    "boolean_85": true         // ← Natural boolean
  },
  {
    "uuid_1": "def360aa-31c7-4ab1-90d2-c172c3f525cb", 
    "firstName_2": "Jan",      // ← 3 chars (consistent)
    "lastName_3": "Wilsonab",  // ← 8 chars (consistent)
    "age_8": 67,               // ← Natural number
    "boolean_85": false        // ← Natural boolean
  }
]
```

**Natural Length Mode (`uniformFieldLength: false`)**:
```json
[
  {
    "uuid_1": "4bb76e61-309c-4b28-b10d-e16d6e0fc411",
    "firstName_2": "John",     // ← 4 chars (natural)
    "lastName_3": "Smith",     // ← 5 chars (natural)
    "age_8": 25,               // ← Natural number
    "boolean_85": true         // ← Natural boolean
  },
  {
    "uuid_1": "def360aa-31c7-4ab1-90d2-c172c3f525cb",
    "firstName_2": "Alexander", // ← 9 chars (natural)
    "lastName_3": "Johnson",   // ← 7 chars (natural) 
    "age_8": 67,               // ← Natural number
    "boolean_85": false        // ← Natural boolean
  }
]
```

## 💾 useCopy (template row + optional Redis)

For **paginated** generation, you can set **`useCopy: true`**. The cache key is a hash of **`numFields`**, **`numObjects`**, **`numNesting`**, **`nestedFields`**, **`recordsPerPage`**, **`totalRecords`** (or **`numRecords`**), **`uniformFieldLength`**, and **`excludeEmoji`**. The server stores **one generated row** per key (small in Redis or RAM). Each response returns **`min(recordsPerPage, totalRecords)`** rows by **cloning that template** with a new **`uuid_1`** per row (same field values across rows except UUIDs). The **`sessionId`** in responses is **deterministic** (`ucopy_` + hex). **`pageNumber`** only drives **pagination metadata** (`currentPage`, `totalPages`, `hasNextPage`, `nextUrl`). Wrong **`sessionId`** vs body config returns **400**.

**Without `REDIS_URL`:** in-process cache (~10 minute TTL). **With `REDIS_URL`:** shared template for **cluster / multiple instances**. Parallel first hits use a **Redis lock**; waiters **poll** until the template exists, or get **503** *retry shortly* if `USE_COPY_LOCK_WAIT_MS` elapses.

Optional env: `USE_COPY_REDIS_TTL_SEC` (default `600`, sliding window—each **hit** refreshes template + config expiry by this many seconds), `USE_COPY_LOCK_SEC` (default `45`), `USE_COPY_LOCK_WAIT_MS` (default `20000`), `USE_COPY_LOCK_POLL_MS` (default `50`). **`GET /ping`** includes `useCopyStore`, `useCopyRedisConfigured`, `useCopyRedisConnected`.

Responses include **`X-UseCopy-Session-Cache: MISS`** on first populate and **`HIT`** on reuse.

### API Endpoints

You can also use the API directly:

#### **Main Endpoint (with success wrapper)**
```bash
POST /generate-data
Content-Type: application/json

{
  "numFields": 5,
  "numObjects": 2,
  "numNesting": 2,
  "numRecords": 10,
  "nestedFields": 3,
  "uniformFieldLength": true   // ← Enable Fixed Field Length Mode
}
```

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

#### **Data-Only Endpoint (clean response)**
```bash
POST /data
Content-Type: application/json

{
  "numFields": 5,
  "numObjects": 2,
  "numNesting": 2,
  "numRecords": 10,
  "nestedFields": 3,
  "uniformFieldLength": false  // ← Natural Length Mode (default)
}
```

**Response:**
```json
[...]
```

#### **GET Data Endpoint (URL parameters)**
```bash
# Basic data generation
GET /data?numFields=5&numObjects=0&numNesting=0&numRecords=100&nestedFields=0&uniformFieldLength=false

# Pagination (new session) - supports up to 100M records
GET /data?numFields=5&numRecords=50000000&enablePagination=true&recordsPerPage=100

# Pagination navigation (existing session)
GET /data?enablePagination=true&sessionId=session_1234567890_abc123&pageNumber=2

# Boolean parameters
GET /data?numFields=3&numRecords=10&uniformFieldLength=true
```

**Features:**
- ✅ **All POST Parameters**: Supports every parameter available in POST `/data`
- ✅ **Pagination Support**: Full pagination with session navigation
- ✅ **Type Conversion**: Automatic string-to-type conversion for URL parameters
- ✅ **Large Datasets**: Supports up to 100M records with pagination
- ✅ **Easy Testing**: Test API directly in browser or with simple curl commands
- ✅ **Shareable URLs**: Share exact data generation configurations via URL

**Parameter Types:**
- **Integers**: `numFields`, `numObjects`, `numNesting`, `numRecords`, `nestedFields`, `recordsPerPage`, `pageNumber`
- **Booleans**: `uniformFieldLength=true/false`, `enablePagination=true/false`, `useCopy=true/false`
- **Strings**: `sessionId`

**Response:** Same as POST `/data` - returns array for regular requests or pagination object for paginated requests

#### **Pagination Endpoint (for large datasets)**
```bash
POST /generate-paginated
Content-Type: application/json

{
  "numFields": 5,
  "numObjects": 0,
  "numNesting": 0,
  "totalRecords": 10000,
  "nestedFields": 0,
  "uniformFieldLength": true,
  "recordsPerPage": 100,
  "useCopy": true              // ← Optional session snapshot (first page rows) + sessionId
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "session_1234567890_abc123",
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 100,
    "totalRecords": 10000,
    "recordsPerPage": 100,
    "hasNext": true,
    "hasPrevious": false,
    "nextUrl": "/generate-paginated?sessionId=session_1234567890_abc123&page=2",
    "previousUrl": null
  }
}
```

## 📊 Example Output

```json
[
  {
    "firstName_1": "John",
    "lastName_2": "Doe",
    "email_3": "john.doe@example.com",
    "phone_4": "(555) 123-4567",
    "address_5": "123 Main Street",
    "nested_object_1": {
      "firstName_1": "Jane",
      "lastName_2": "Smith",
      "email_3": "jane.smith@example.com",
      "nested_object_1": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Alice Johnson",
        "value": 742,
        "active": true
      }
    },
    "nested_object_2": {
      "firstName_1": "Bob",
      "lastName_2": "Wilson",
      "email_3": "bob.wilson@example.com",
      "nested_object_1": {
        "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "name": "Charlie Brown",
        "value": 156,
        "active": false
      }
    }
  }
]
```

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Data Generation**: Faker.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Styling**: Modern CSS with gradients, animations, and responsive design

## 🧪 Testing Suite

The project includes a comprehensive testing suite to validate all data generation modes and features:

### 🏃‍♂️ Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:fixed        # Fixed Length mode tests
npm run test:natural      # Natural Length mode tests  
npm run test:compare      # Comprehensive comparison tests
npm run test:pagesize     # Configurable page size tests
```

### 📋 Test Coverage

1. **Fixed Length Pagination Test** (`test-fixed-length-pagination.js`)
   - Validates consistent field lengths across all pages
   - Tests deterministic behavior for same page requests
   - Handles large datasets (10K+ records)
   - Validates schema caching functionality

2. **Natural Length Pagination Test** (`test-natural-length-pagination.js`)
   - Confirms natural field length variation
   - Tests pagination with realistic data
   - Validates deterministic behavior

3. **Comprehensive Comparison Test** (`test-comprehensive-comparison.js`)
   - Side-by-side comparison of Fixed vs Natural modes
   - Performance benchmarking
   - Cross-page consistency validation
   - Field type behavior verification

4. **Field Length Validation Test** (`test-field-length-validation.js`)
   - Deep analysis of field length consistency
   - String vs non-string field type validation
   - Large-scale data validation (1000+ records)

5. **Configurable Page Size Test** (`test-configurable-page-size.js`)
   - Tests various page sizes (50, 100, 200, 500 records)
   - Validates pagination metadata accuracy

### 🎯 Smart Test Validation

All tests now include **Smart Field Type Detection**:
- ✅ **String fields** are validated for length consistency in Fixed mode
- ⏭️ **Non-string fields** (numbers, booleans) are skipped from length validation
- 🔍 **Clear reporting** shows which fields are validated vs skipped

## 📁 Project Structure

```
data-generator-project/
├── package.json          # Project dependencies and scripts
├── app.js                # Main Express server with Smart Field Detection
├── .env                  # Optional environment variables (PORT, LOG_LEVEL, etc.)
├── README.md             # Project documentation
├── public/               # Static files
│   ├── index.html        # Main web interface
│   ├── styles.css        # Modern styling
│   └── script.js         # Frontend JavaScript
└── tests/                # Comprehensive test suite
    ├── README.md         # Test documentation
    ├── run-all-tests.js  # Test runner
    ├── test-fixed-length-pagination.js
    ├── test-natural-length-pagination.js
    ├── test-comprehensive-comparison.js
    ├── test-field-length-validation.js
    └── test-configurable-page-size.js
```

## 🎨 Field Types Generated

The application generates various realistic field types:

- **Unique Identifier**: UUID (always first field)
- **Personal**: First name, last name, full name
- **Contact**: Email, phone number, address
- **Professional**: Company name, job title
- **Technical**: Dates, numbers, booleans, IDs
- **Content**: Realistic descriptions and text

## 📋 Predictable Field Order

The data generator uses a **consistent, predictable field ordering system**. Fields are always generated in the same order, making your API responses reliable and data processing easier.

### 🔄 How It Works

- **Consistent Ordering**: Every request with the same number of fields will produce the same field order
- **Deterministic Cycling**: When requesting more than 88 fields, the system cycles back to the beginning
- **Cross-Record Consistency**: All records in a dataset have identical field ordering

### 📊 Complete Field Order (88 Total Field Types)

#### **Unique Identifier (1 field) - ALWAYS FIRST**
```
uuid_1
```

#### **Personal Information (13 fields)**
```
firstName_2 → lastName_3 → fullName_4 → middleName_5 → gender_6 → birthDate_7 → age_8 → bio_9 → jobTitle_10 → suffix_11 → prefix_12 → phone_13 → phoneNumber_14
```

#### **Location & Address (10 fields)**
```
address_15 → streetName_16 → buildingNumber_17 → city_18 → state_19 → country_20 → zipCode_21 → latitude_22 → longitude_23 → timezone_24
```

#### **Business & Finance (13 fields)**
```
company_25 → department_26 → catchPhrase_27 → buzzword_28 → salary_29 → accountNumber_30 → routingNumber_31 → creditCard_32 → currency_33 → price_34 → transactionType_35 → bitcoinAddress_36 → bankName_37 → iban_38
```

#### **Internet & Technology (12 fields)**
```
email_39 → website_40 → username_41 → password_42 → domainName_43 → ip_44 → ipv6_45 → mac_46 → userAgent_47 → protocol_48 → port_49 → emoji_50
```

#### **Commerce & Products (8 fields)**
```
productName_51 → productDescription_52 → productMaterial_53 → productAdjective_54 → rating_55 → isbn_56 → ean_57 → productCategory_58
```

#### **Vehicle & Transportation (6 fields)**
```
vehicle_59 → vehicleModel_60 → vehicleManufacturer_61 → vehicleType_62 → vehicleFuel_63 → vin_64
```

#### **System & Files (5 fields)**
```
fileName_65 → fileExtension_66 → mimeType_67 → directoryPath_68 → semver_69
```

#### **Dates & Time (5 fields)**
```
date_70 → recentDate_71 → futureDate_72 → weekday_73 → month_74
```

#### **Text & Content (6 fields)**
```
description_75 → sentence_76 → paragraph_77 → words_78 → slug_79 → title_80
```

#### **Identification & Codes (7 fields)**
```
nanoid_81 → color_82 → hexColor_83 → number_84 → boolean_85 → imei_86 → creditCardCVV_87 → licenseNumber_88
```

### 💡 Example Usage

**Requesting 5 fields will always produce:**
```json
{
  "uuid_1": "550e8400-e29b-41d4-a716-446655440000",
  "firstName_2": "John",
  "lastName_3": "Doe", 
  "fullName_4": "Jane Smith",
  "middleName_5": "Michael"
}
```

**Requesting 15 fields will always start with the same 5, then continue:**
```json
{
  "uuid_1": "550e8400-e29b-41d4-a716-446655440000",
  "firstName_2": "John",
  "lastName_3": "Doe",
  "fullName_4": "Jane Smith", 
  "middleName_5": "Michael",
  "gender_6": "Female",
  "birthDate_7": "1990-05-15",
  "age_8": 32,
  "bio_9": "software developer",
  "jobTitle_10": "Senior Engineer",
  "suffix_11": "Jr.",
  "prefix_12": "Mr.",
  "phone_13": "(555) 123-4567",
  "phoneNumber_14": "+1-555-987-6543",
  "address_15": "123 Main St"
}
```

**Cycling example - requesting 90 fields (cycles back after 88):**
```json
{
  "uuid_1": "550e8400-e29b-41d4-a716-446655440000",
  "firstName_2": "John",
  // ... fields 3-88 ...
  "licenseNumber_88": "ABC123DEF",
  "uuid_89": "123e4567-e89b-12d3-a456-426614174000",     // ← Cycles back to uuid
  "firstName_90": "Sarah"     // ← Continues with firstName
}
```

### ✅ Benefits

- **🔑 Unique ID First**: Every record starts with a unique UUID identifier for easy tracking
- **🎯 Predictable API Responses**: Client applications can rely on consistent field positions
- **🔄 Easier Data Processing**: Scripts and tools can expect fields in the same order every time
- **🐛 Better Debugging**: Easier to spot patterns and troubleshoot issues
- **📊 Consistent UI**: Frontend components can display data fields reliably

## 🔧 Configuration

### Server Configuration
- **Port**: Default 3000 (configurable via `PORT` environment variable)
- **CORS**: Enabled for cross-origin requests
- **ACCESS_LOG**: `true` / `1` logs every request (status, method, URL, duration); `false` / `0` turns that off. Default is **on** when `NODE_ENV` is not `production` (so local `npm start` shows `/data` traffic). Static assets like `.js` / `.css` are skipped to reduce noise.
- **Multi-worker (Node cluster)**: `npm run start:cluster` runs `cluster.js`, which forks **`WEB_CONCURRENCY`** workers (or **`CLUSTER_WORKERS`**, default = CPU count, max 32). All workers share **`PORT`**. Use **`REDIS_URL`** with **useCopy** so cache is shared across workers; without Redis, useCopy is still per-process. **`npm start`** remains a **single** process.

### Validation Limits
- Fields: 1+ (no upper limit)
- Nested Objects: 0-10
- Fields per Nested Object: 0-50
- Nesting Depth: 0-5
- Records (Regular): 1-20,000,000 (20M)
- Records (Pagination): 1-100,000,000 (100M)
- Records per Page: 10-1,000

## 🔬 Technical Implementation

### 🧠 Smart Field Type Detection Algorithm

The system uses an intelligent field type detection algorithm to categorize fields:

```javascript
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
```

### 🔒 Fixed Length Implementation Approach

1. **Sample-Based Schema Generation**:
   - Generate one sample record with natural Faker.js data
   - Extract field lengths from the sample for string fields only
   - Store length mappings for consistent application

2. **Selective Length Enforcement**:
   - **String fields**: Apply length padding/truncation to match sample
   - **Non-string fields**: Skip length processing entirely
   - **Special fields**: UUID and nanoid maintain their standard formats

3. **Deterministic Pagination**:
   - Use seeded random generation for consistent page results
   - Cache field length schemas with TTL (10 minutes)
   - Maintain session-based consistency across page requests

### 🌿 Natural Length Mode

- Uses pure Faker.js output without any length modifications
- Preserves realistic data variation and authenticity
- Maintains all original data types and ranges
- Ideal for realistic testing scenarios

### 📄 Pagination Architecture

- **Session Management**: Unique session IDs for large dataset handling
- **Schema Caching**: 10-minute TTL for field length maps
- **Deterministic Seeds**: Consistent data across page requests
- **Efficient Memory Usage**: Generate pages on-demand, not all at once

### 🧪 Test-Driven Development

All features were developed using a test-driven approach:

1. **Test First**: Write comprehensive tests for expected behavior
2. **Implementation**: Build features to pass the tests
3. **Validation**: Ensure both Fixed and Natural modes work correctly
4. **Regression Testing**: Verify no existing functionality is broken

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📈 Changelog

### 🆕 Latest Updates

**🔒 Fixed Field Length Mode**
- ✅ Added intelligent field type detection for string vs non-string fields
- ✅ Implemented selective length enforcement (strings only)
- ✅ Preserved natural data types for numbers, booleans, and floats
- ✅ Maintained UUID standard format compliance

**📄 Pagination Support**
- ✅ Added pagination endpoint for large datasets (10K+ records)
- ✅ Implemented session-based schema caching with TTL
- ✅ Added deterministic data generation for consistent page results
- ✅ Built efficient memory management for on-demand page generation

**🧪 Comprehensive Testing Suite**
- ✅ Created 5 specialized test files covering all functionality
- ✅ Added smart field type validation in all tests
- ✅ Implemented performance benchmarking and comparison tests
- ✅ Built automated test runner with individual test commands

**🎯 Smart Field Detection**
- ✅ Categorized all 88 field types into string vs non-string
- ✅ Updated length validation logic to skip non-string fields
- ✅ Added clear test reporting for validated vs skipped fields
- ✅ Ensured data integrity across all generation modes

**🌐 GET API Endpoint**
- ✅ Added GET `/data` endpoint with URL parameter support
- ✅ Implemented automatic type conversion for query parameters
- ✅ Full pagination support including session navigation via URL
- ✅ Supports up to 100M records with pagination mode
- ✅ Enhanced cURL generation with complete pagination parameters
- ✅ Shareable URLs for data generation configurations

**🔧 Technical Improvements**
- ✅ Refactored field length enforcement algorithm
- ✅ Added session management for pagination consistency
- ✅ Implemented schema caching with automatic expiration
- ✅ Enhanced error handling and validation
### 🎯 Use Cases

**Fixed Length Mode** - Perfect for:
- 🎨 UI/Layout testing with consistent field widths
- 📊 Table/grid components with uniform column sizes
- 🧪 Frontend component testing with predictable data shapes
- 📱 Mobile UI testing with consistent text lengths

**Natural Length Mode** - Ideal for:
- 🌿 Realistic data simulation and testing
- 🔍 Backend API testing with authentic data variation
- 📈 Performance testing with real-world data patterns
- 🎭 Demo data that looks genuinely authentic

## 🙏 Acknowledgments

- [Faker.js](https://fakerjs.dev/) for realistic data generation
- [Express.js](https://expressjs.com/) for the web framework
- Modern CSS techniques for the beautiful UI
- Test-driven development methodology for robust implementation

---

**Happy Data Generating! 🎉** 
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
- **📄 Pagination Support**: Handle large datasets (10K+ records) with efficient pagination
- **🧪 Comprehensive Testing**: Full test suite with validation for different data generation modes
- **💾 MongoDB Storage**: Optional data persistence with automatic 24-hour TTL
- **🔄 Environment Configuration**: Secure environment variable management for database connections

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment file** (optional connections):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` only for **`MONGODB_URI`** and **`REDIS_URL`** (local defaults point at `127.0.0.1`). Every other setting is optional and has a **built-in default** in code — those are documented below; you do not need to add them to `.env` unless you want to override.

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

### Development Mode

For development with auto-restart:
```bash
npm run dev
```

## Environment variables

Use **`.env`** (from [`.env.example`](.env.example)) for **`MONGODB_URI`** and **`REDIS_URL`** when you are not using the local defaults. Do not duplicate the variables in the table below in `.env` unless you need to override the default.

| Variable | In `.env`? | Default (if unset) | Purpose |
|----------|------------|--------------------|---------|
| `MONGODB_URI` | Yes, if not local | *(none — Mongo disabled)* | MongoDB connection; storage, useCopy backing, async job results |
| `REDIS_URL` | Yes, if not local | *(none — job queue disabled)* | Redis for BullMQ (`POST /jobs/generate-data`); use `redis://host:port` or `rediss://` for TLS |
| `PORT` | No | `3000` | HTTP port |
| `TRUST_PROXY` | No | trust proxy **on**; set to `false` to disable | Behind reverse proxies (e.g. Render) |
| `LOG_LEVEL` | No | `INFO` | `ERROR`, `WARN`, `INFO`, `DEBUG` |
| `NODE_ENV` | No | `development` (typical) | Standard Node environment |
| `USE_COPY_BACKING_STORE` | No | `auto` | `auto` \| `mongo` \| `memory` — where useCopy sessions/pages are stored |
| `COMPRESSION_THRESHOLD_BYTES` | No | `1024` | Minimum response size (bytes) before gzip |
| `JSON_BODY_LIMIT` | No | `10mb` | Max JSON body size for Express |
| `JOB_ATTEMPTS` | No | `2` | BullMQ job retries |
| `JOB_QUEUE_COMPLETE_MAX_COUNT` | No | `50` | Max completed jobs kept in Redis |
| `JOB_QUEUE_COMPLETE_MAX_AGE_SEC` | No | `600` | Max age (seconds) for completed job metadata |
| `JOB_QUEUE_FAIL_MAX_COUNT` | No | `30` | Max failed jobs kept in Redis |
| `JOB_QUEUE_FAIL_MAX_AGE_SEC` | No | `3600` | Max age (seconds) for failed job metadata |
| `REDIS_MAX_JOB_RESULT_BYTES` | No | `8388608` (8 MiB) | Max JSON size when storing job output in Redis (no Mongo) |
| `JOB_RESULT_TTL_SEC` | No | `86400` | TTL for `jobdata:*` keys in Redis |

**Job queue:** With `REDIS_URL` set, run the API (`npm start`) and a worker (`npm run worker`) in separate processes.

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

## 💾 MongoDB Storage

The data generator supports **optional MongoDB storage** for persisting generated data. When enabled, data is automatically stored with a 24-hour TTL (Time To Live).

### 🔧 Setup

1. **Environment Configuration**: Copy [`.env.example`](.env.example) to `.env` and set `MONGODB_URI` (and `REDIS_URL` if you use the job queue). For Atlas, use a URI such as `mongodb+srv://user:pass@cluster/...`.

2. **Automatic Connection**: The server automatically connects to MongoDB on startup if `MONGODB_URI` is configured

3. **Graceful Fallback**: If MongoDB is unavailable, the server continues to work without storage functionality

### 🎯 How It Works

Add the `storeIt: true` parameter to any API request to enable storage:

```javascript
{
  "numFields": 5,
  "numRecords": 10,
  "storeIt": true  // ← Enable MongoDB storage
}
```

**Storage Features:**
- **Automatic Indexing**: Session IDs are indexed for fast retrieval
- **24-Hour TTL**: Data automatically expires after 24 hours
- **Request Metadata**: Stores original request parameters alongside generated data
- **Unique Session IDs**: Each storage operation gets a unique identifier
- **Error Resilience**: Failed storage attempts don't affect API responses

### 📊 Stored Data Structure

```javascript
{
  "_id": "ObjectId(...)",
  "sessionId": "data_1234567890_abc123def",
  "requestParams": {
    "numFields": 5,
    "numObjects": 1,
    "numNesting": 1,
    "numRecords": 10,
    "storeIt": true
  },
  "data": [...], // The generated data array
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

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
  "storeIt": true               // ← Enable MongoDB Storage
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
  "storeIt": false              // ← Disable MongoDB Storage (default)
}
```

**Response:**
```json
[...]
```

#### **GET Data Endpoint (URL parameters)**
```bash
# Basic data generation
GET /data?numFields=5&numObjects=0&numNesting=0&numRecords=100&nestedFields=0&storeIt=false

# Pagination (new session) - supports up to 100M records
GET /data?numFields=5&numRecords=50000000&enablePagination=true&recordsPerPage=100

# Pagination navigation (existing session)
GET /data?enablePagination=true&sessionId=session_1234567890_abc123&pageNumber=2

# Boolean parameters
GET /data?numFields=3&numRecords=10&storeIt=true
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
- **Booleans**: `storeIt=true/false`, `enablePagination=true/false`
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
  "recordsPerPage": 100,
  "storeIt": true               // ← Store paginated data to MongoDB
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

Integration tests call a running server at `http://localhost:3000` (start with `npm start`).

### 🏃‍♂️ Running Tests

```bash
# Run all tests
npm test

# Run specific suites
npm run test:natural      # Pagination + natural Faker lengths
npm run test:pagesize     # Configurable records per page
```

### 📋 Test Coverage

1. **Natural Length Pagination** (`test-natural-length-pagination.js`) — deterministic pages, realistic string variation
2. **Configurable Page Size** (`test-configurable-page-size.js`) — page sizes and pagination metadata

## 📁 Project Structure

```
data-generator-project/
├── package.json          # Project dependencies and scripts
├── app.js                # Main Express server & MongoDB
├── .env.example          # Template: MONGODB_URI, REDIS_URL (copy to .env)
├── .env                  # Local overrides (gitignored)
├── README.md             # Project documentation
├── public/               # Static files
│   ├── index.html        # Main web interface
│   ├── styles.css        # Modern styling
│   └── script.js         # Frontend JavaScript
└── tests/
    ├── README.md         # Test documentation
    ├── run-all-tests.js  # Test runner
    ├── test-natural-length-pagination.js
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

### Validation Limits
- Fields: 1+ (no upper limit)
- Nested Objects: 0-10
- Fields per Nested Object: 0-50
- Nesting Depth: 0-5
- Records (Regular): 1-20,000,000 (20M)
- Records (Pagination): 1-100,000,000 (100M)
- Records per Page: 10-1,000

## 🔬 Technical Implementation

### Data generation

- Faker.js produces realistic values; string lengths follow natural variation.
- Pagination uses deterministic seeds so the same page request returns the same records.

### Pagination and useCopy

- **Sessions**: Large datasets use a session id and `pageNumber` / `recordsPerPage` navigation.
- **useCopy** (optional): Caches a full generated page per session with a TTL; repeat requests clone rows and refresh `uuid_1` for uniqueness.

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

**📄 Pagination Support**
- ✅ Pagination endpoint for large datasets (10K+ records)
- ✅ Session-based navigation with deterministic page generation
- ✅ Optional useCopy mode with TTL session cache

**🧪 Testing Suite**
- ✅ Pagination and page-size integration tests

**💾 MongoDB Storage Integration**
- ✅ Added optional MongoDB data persistence with 24-hour TTL
- ✅ Implemented secure environment variable configuration
- ✅ Created automatic database connection with graceful fallback
- ✅ Built session-based storage with unique identifiers
- ✅ Added request metadata storage alongside generated data

**🌐 GET API Endpoint**
- ✅ Added GET `/data` endpoint with URL parameter support
- ✅ Implemented automatic type conversion for query parameters
- ✅ Full pagination support including session navigation via URL
- ✅ Supports up to 100M records with pagination mode
- ✅ Enhanced cURL generation with complete pagination parameters
- ✅ Shareable URLs for data generation configurations

**🔧 Technical Improvements**
- ✅ Session management for pagination consistency
- ✅ Enhanced error handling and validation
- ✅ MongoDB integration with Mongoose ODM

### 🎯 Use Cases

**Data generation** — Useful for:
- 🌿 Realistic data simulation and API testing
- 📈 Performance and load testing with large paginated datasets
- 🎭 Demo data that looks authentic

**MongoDB Storage** - Perfect for:
- 💾 Persisting test data for repeated use across test runs
- 📊 Audit trails of generated data for compliance testing
- 🔄 Sharing generated datasets across development teams
- 🕐 Time-based data retention with automatic cleanup
- 📝 Storing data generation metadata for analysis

## 🙏 Acknowledgments

- [Faker.js](https://fakerjs.dev/) for realistic data generation
- [Express.js](https://expressjs.com/) for the web framework
- [MongoDB](https://www.mongodb.com/) for flexible document database storage
- [Mongoose](https://mongoosejs.com/) for elegant MongoDB object modeling
- Modern CSS techniques for the beautiful UI
- Test-driven development methodology for robust implementation

---

**Happy Data Generating! 🎉** 
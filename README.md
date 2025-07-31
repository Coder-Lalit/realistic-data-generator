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
   - **Number of Fields** (1-300): Basic data fields like names, emails, addresses
   - **Number of Nested Objects** (0-10): Objects nested within each record
   - **Fields per Nested Object** (0-50): Number of fields in each nested object
   - **Nesting Depth** (0-5): How deep the nesting structure goes
   - **Number of Records** (1-10000): Total number of data records to generate

2. **Generate Data**: Click the "Generate Data" button

3. **Export Options**:
   - **Copy JSON**: Copy the generated data to clipboard
   - **Download JSON**: Download as a `.json` file

### API Endpoint

You can also use the API directly:

```bash
POST /generate-data
Content-Type: application/json

{
  "numFields": 5,
  "numObjects": 2,
  "numNesting": 2,
  "numRecords": 10,
  "nestedFields": 3
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

## 📁 Project Structure

```
data-generator-project/
├── package.json          # Project dependencies and scripts
├── app.js                # Main Express server
├── README.md             # Project documentation
└── public/               # Static files
    ├── index.html        # Main web interface
    ├── styles.css        # Modern styling
    └── script.js         # Frontend JavaScript
```

## 🎨 Field Types Generated

The application generates various realistic field types:

- **Personal**: First name, last name, full name
- **Contact**: Email, phone number, address
- **Professional**: Company name, job title
- **Technical**: UUID, dates, numbers, booleans
- **Content**: Lorem ipsum descriptions

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

- **🎯 Predictable API Responses**: Client applications can rely on consistent field positions
- **🔄 Easier Data Processing**: Scripts and tools can expect fields in the same order every time
- **🐛 Better Debugging**: Easier to spot patterns and troubleshoot issues
- **📊 Consistent UI**: Frontend components can display data fields reliably

## 🔧 Configuration

### Server Configuration
- **Port**: Default 3000 (configurable via `PORT` environment variable)
- **CORS**: Enabled for cross-origin requests

### Validation Limits
- Fields: 1-300
- Nested Objects: 0-10
- Fields per Nested Object: 0-50
- Nesting Depth: 0-5
- Records: 1-10000

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Faker.js](https://fakerjs.dev/) for realistic data generation
- [Express.js](https://expressjs.com/) for the web framework
- Modern CSS techniques for the beautiful UI

---

**Happy Data Generating! 🎉** 
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

#### **Personal Information (13 fields)**
```
firstName_1 → lastName_2 → fullName_3 → middleName_4 → gender_5 → birthDate_6 → age_7 → bio_8 → jobTitle_9 → suffix_10 → prefix_11 → phone_12 → phoneNumber_13
```

#### **Location & Address (10 fields)**
```
address_14 → streetName_15 → buildingNumber_16 → city_17 → state_18 → country_19 → zipCode_20 → latitude_21 → longitude_22 → timezone_23
```

#### **Business & Finance (13 fields)**
```
company_24 → department_25 → catchPhrase_26 → buzzword_27 → salary_28 → accountNumber_29 → routingNumber_30 → creditCard_31 → currency_32 → price_33 → transactionType_34 → bitcoinAddress_35 → bankName_36 → iban_37
```

#### **Internet & Technology (12 fields)**
```
email_38 → website_39 → username_40 → password_41 → domainName_42 → ip_43 → ipv6_44 → mac_45 → userAgent_46 → protocol_47 → port_48 → emoji_49
```

#### **Commerce & Products (8 fields)**
```
productName_50 → productDescription_51 → productMaterial_52 → productAdjective_53 → rating_54 → isbn_55 → ean_56 → productCategory_57
```

#### **Vehicle & Transportation (6 fields)**
```
vehicle_58 → vehicleModel_59 → vehicleManufacturer_60 → vehicleType_61 → vehicleFuel_62 → vin_63
```

#### **System & Files (5 fields)**
```
fileName_64 → fileExtension_65 → mimeType_66 → directoryPath_67 → semver_68
```

#### **Dates & Time (5 fields)**
```
date_69 → recentDate_70 → futureDate_71 → weekday_72 → month_73
```

#### **Text & Content (6 fields)**
```
description_74 → sentence_75 → paragraph_76 → words_77 → slug_78 → title_79
```

#### **Identification & Codes (9 fields)**
```
uuid_80 → nanoid_81 → color_82 → hexColor_83 → number_84 → boolean_85 → imei_86 → creditCardCVV_87 → licenseNumber_88
```

### 💡 Example Usage

**Requesting 5 fields will always produce:**
```json
{
  "firstName_1": "John",
  "lastName_2": "Doe", 
  "fullName_3": "Jane Smith",
  "middleName_4": "Michael",
  "gender_5": "Female"
}
```

**Requesting 15 fields will always start with the same 5, then continue:**
```json
{
  "firstName_1": "John",
  "lastName_2": "Doe",
  "fullName_3": "Jane Smith", 
  "middleName_4": "Michael",
  "gender_5": "Female",
  "birthDate_6": "1990-05-15",
  "age_7": 32,
  "bio_8": "software developer",
  "jobTitle_9": "Senior Engineer",
  "suffix_10": "Jr.",
  "prefix_11": "Mr.",
  "phone_12": "(555) 123-4567",
  "phoneNumber_13": "+1-555-987-6543",
  "address_14": "123 Main St",
  "streetName_15": "Oak Avenue"
}
```

**Cycling example - requesting 90 fields (cycles back after 88):**
```json
{
  "firstName_1": "John",
  "lastName_2": "Doe",
  // ... fields 3-88 ...
  "licenseNumber_88": "ABC123DEF",
  "firstName_89": "Sarah",     // ← Cycles back to firstName
  "lastName_90": "Wilson"     // ← Continues with lastName
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
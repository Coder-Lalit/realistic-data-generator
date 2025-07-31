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
   - **Nesting Depth** (0-5): How deep the nesting structure goes
   - **Number of Records** (1-1000): Total number of data records to generate

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
  "numRecords": 10
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

## 🔧 Configuration

### Server Configuration
- **Port**: Default 3000 (configurable via `PORT` environment variable)
- **CORS**: Enabled for cross-origin requests

### Validation Limits
- Fields: 1-300
- Nested Objects: 0-10  
- Nesting Depth: 0-5
- Records: 1-1000

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
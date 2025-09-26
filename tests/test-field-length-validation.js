#!/usr/bin/env node

/**
 * Field Length Validation Test
 * 
 * This script tests the uniformFieldLength feature by:
 * 1. Generating data with 200 fields, 1000 records, and uniformFieldLength: true
 * 2. Validating that all fields have consistent lengths across all records
 * 3. Providing detailed analysis of field length distribution
 * 4. Identifying any inconsistencies or violations
 */

const http = require('http');

// Function to determine if a field type generates string values (same as in app.js)
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

// Test configuration matching your curl request
const testConfig = {
    numFields: 200,
    numObjects: 0,
    numNesting: 0,
    numRecords: 1000,
    totalRecords: null,
    nestedFields: 0,
    uniformFieldLength: true,
    enablePagination: false
};

// HTTP request helper function
function makeRequest(hostname, port, path, method, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedBody = JSON.parse(body);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: parsedBody
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

// Field length analysis functions
function analyzeFieldLengths(data) {
    if (!data || data.length === 0) {
        return { error: 'No data to analyze' };
    }

    const analysis = {
        totalRecords: data.length,
        totalFields: Object.keys(data[0]).length,
        fieldLengthMap: {},
        inconsistencies: [],
        summary: {}
    };

    console.log(`📊 Analyzing ${analysis.totalRecords} records with ${analysis.totalFields} fields...`);

    // Get field names from first record
    const fieldNames = Object.keys(data[0]);

    // Analyze each field across all records
    fieldNames.forEach((fieldName, fieldIndex) => {
        // Extract field type from field name (e.g., "firstName_2" -> "firstName")
        const fieldType = fieldName.split('_')[0];
        
        // Skip validation for non-string field types
        if (!isStringFieldType(fieldType)) {
            console.log(`   Skipping ${fieldName} (${fieldType}) - non-string field type`);
            return; // Skip this field entirely
        }

        const lengths = [];
        const lengthCounts = {};
        let hasInconsistency = false;

        // Check length of this field in every record
        data.forEach((record, recordIndex) => {
            const fieldValue = record[fieldName];
            const fieldLength = fieldValue ? String(fieldValue).length : 0;
            lengths.push(fieldLength);

            // Count occurrences of each length
            lengthCounts[fieldLength] = (lengthCounts[fieldLength] || 0) + 1;
        });

        // Determine expected length (most common length)
        const lengthEntries = Object.entries(lengthCounts);
        lengthEntries.sort((a, b) => b[1] - a[1]); // Sort by count (descending)
        const expectedLength = parseInt(lengthEntries[0][0]);
        const expectedCount = lengthEntries[0][1];

        // Check for inconsistencies
        if (lengthEntries.length > 1) {
            hasInconsistency = true;
            const inconsistency = {
                field: fieldName,
                expectedLength,
                expectedCount,
                totalRecords: data.length,
                lengthDistribution: lengthCounts,
                violations: []
            };

            // Find specific violations
            data.forEach((record, recordIndex) => {
                const fieldLength = record[fieldName] ? String(record[fieldName]).length : 0;
                if (fieldLength !== expectedLength) {
                    inconsistency.violations.push({
                        recordIndex,
                        actualLength: fieldLength,
                        value: record[fieldName]
                    });
                }
            });

            analysis.inconsistencies.push(inconsistency);
        }

        // Store field analysis
        analysis.fieldLengthMap[fieldName] = {
            expectedLength,
            consistent: !hasInconsistency,
            lengthDistribution: lengthCounts,
            minLength: Math.min(...lengths),
            maxLength: Math.max(...lengths),
            averageLength: lengths.reduce((sum, len) => sum + len, 0) / lengths.length
        };

        // Progress indicator
        if ((fieldIndex + 1) % 50 === 0 || fieldIndex === fieldNames.length - 1) {
            console.log(`   Analyzed ${fieldIndex + 1}/${fieldNames.length} fields...`);
        }
    });

    // Generate summary
    const consistentFields = Object.values(analysis.fieldLengthMap).filter(f => f.consistent).length;
    const inconsistentFields = analysis.totalFields - consistentFields;

    analysis.summary = {
        consistentFields,
        inconsistentFields,
        consistencyPercentage: ((consistentFields / analysis.totalFields) * 100).toFixed(2),
        totalViolations: analysis.inconsistencies.reduce((sum, inc) => sum + inc.violations.length, 0)
    };

    return analysis;
}

function displayResults(analysis) {
    console.log('\n' + '='.repeat(80));
    console.log('📋 FIELD LENGTH VALIDATION RESULTS');
    console.log('='.repeat(80));

    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   Total Records: ${analysis.totalRecords}`);
    console.log(`   Total Fields: ${analysis.totalFields}`);
    console.log(`   Consistent Fields: ${analysis.summary.consistentFields}`);
    console.log(`   Inconsistent Fields: ${analysis.summary.inconsistentFields}`);
    console.log(`   Consistency Rate: ${analysis.summary.consistencyPercentage}%`);
    console.log(`   Total Violations: ${analysis.summary.totalViolations}`);

    // Overall result
    const isSuccess = analysis.summary.inconsistentFields === 0;
    console.log(`\n🎯 OVERALL RESULT: ${isSuccess ? '✅ PASS' : '❌ FAIL'}`);

    if (isSuccess) {
        console.log('   🎉 All fields have consistent lengths across all records!');
    } else {
        console.log(`   ⚠️  ${analysis.summary.inconsistentFields} fields have length inconsistencies.`);
    }

    // Detailed inconsistency report
    if (analysis.inconsistencies.length > 0) {
        console.log('\n❌ INCONSISTENCY DETAILS:');
        console.log('-'.repeat(50));

        analysis.inconsistencies.forEach((inc, index) => {
            console.log(`\n${index + 1}. Field: ${inc.field}`);
            console.log(`   Expected Length: ${inc.expectedLength}`);
            console.log(`   Records with Expected Length: ${inc.expectedCount}/${inc.totalRecords}`);
            console.log(`   Length Distribution:`, inc.lengthDistribution);
            
            if (inc.violations.length <= 10) {
                console.log(`   Violations (${inc.violations.length}):`);
                inc.violations.forEach(violation => {
                    console.log(`     Record ${violation.recordIndex}: ${violation.actualLength} chars - "${violation.value}"`);
                });
            } else {
                console.log(`   Violations: ${inc.violations.length} (showing first 5):`);
                inc.violations.slice(0, 5).forEach(violation => {
                    console.log(`     Record ${violation.recordIndex}: ${violation.actualLength} chars - "${violation.value}"`);
                });
                console.log(`     ... and ${inc.violations.length - 5} more`);
            }
        });
    }

    // Field length distribution
    console.log('\n📏 FIELD LENGTH DISTRIBUTION (First 20 Fields):');
    console.log('-'.repeat(50));
    const fieldNames = Object.keys(analysis.fieldLengthMap).slice(0, 20);
    fieldNames.forEach(fieldName => {
        const field = analysis.fieldLengthMap[fieldName];
        const status = field.consistent ? '✅' : '❌';
        console.log(`   ${status} ${fieldName}: ${field.expectedLength} chars ${field.consistent ? '' : '(inconsistent)'}`);
    });

    if (Object.keys(analysis.fieldLengthMap).length > 20) {
        console.log(`   ... and ${Object.keys(analysis.fieldLengthMap).length - 20} more fields`);
    }

    return isSuccess;
}

// Main test function
async function testFieldLengthValidation() {
    console.log('🧪 Starting Field Length Validation Test');
    console.log('=' .repeat(80));
    console.log('\n📋 Test Configuration:');
    console.log(JSON.stringify(testConfig, null, 2));

    try {
        console.log('\n🚀 Generating data...');
        const startTime = Date.now();
        
        const response = await makeRequest(
            'localhost',
            3000,
            '/generate-data',
            'POST',
            JSON.stringify(testConfig)
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        if (response.statusCode !== 200) {
            throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
        }

        if (!response.body.success) {
            throw new Error(`API Error: ${response.body.error || 'Unknown error'}`);
        }

        console.log(`✅ Data generated successfully in ${duration}ms`);
        console.log(`📊 Generated ${response.body.data.length} records`);

        // Analyze field lengths
        console.log('\n🔍 Analyzing field lengths...');
        const analysis = analyzeFieldLengths(response.body.data);

        // Display results
        const isSuccess = displayResults(analysis);

        // Final result
        console.log('\n' + '='.repeat(80));
        if (isSuccess) {
            console.log('🎉 TEST PASSED: All field lengths are consistent!');
            process.exit(0);
        } else {
            console.log('💥 TEST FAILED: Field length inconsistencies detected!');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n💥 TEST ERROR:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

// Export functions for use in other tests
module.exports = {
    testFieldLengthValidation,
    analyzeFieldLengths,
    displayResults,
    makeRequest
};

// Run test if this file is executed directly
if (require.main === module) {
    testFieldLengthValidation();
}

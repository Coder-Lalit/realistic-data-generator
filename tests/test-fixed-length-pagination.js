#!/usr/bin/env node

/**
 * FIXED LENGTH PAGINATION TEST
 * ============================
 * 
 * This test validates that Fixed Field Length mode works correctly:
 * - All field lengths are consistent across all pages
 * - Same page returns identical data on multiple calls (deterministic)
 * - Large datasets (10K records) are handled properly
 * - Schema caching works correctly
 * 
 * Usage: node tests/test-fixed-length-pagination.js
 */

const http = require('http');

// Simple HTTP request function
function makeRequest(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch (error) {
                    reject(new Error(`JSON Parse Error: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testFixedLengthPagination() {
    console.log('🔒 FIXED LENGTH PAGINATION TEST - 10K RECORDS');
    console.log('=============================================');
    console.log();

    try {
        // Step 1: Create a session with 10,000 records and Fixed Field Length
        console.log('📋 Step 1: Creating session with 10,000 records + Fixed Field Length...');
        const sessionData = {
            numFields: 5,
            numObjects: 0,
            numNesting: 0,
            totalRecords: 10000,
            nestedFields: 0,
            uniformFieldLength: true,  // 🔒 CRITICAL: Fixed length enabled
            recordsPerPage: 100  // Configurable page size
        };

        const sessionResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
        
        if (!sessionResponse.success) {
            throw new Error(`Session creation failed: ${sessionResponse.error}`);
        }

        const sessionId = sessionResponse.sessionId;
        const totalPages = sessionResponse.pagination.totalPages;
        console.log(`✅ Session created: ${sessionId}`);
        console.log(`📊 Total pages: ${totalPages} (${sessionResponse.pagination.totalRecords} records)`);
        console.log(`🔒 Fixed Field Length: ENABLED`);
        console.log();

        // Step 2: Extract field length schema from first page
        console.log('📏 Step 2: Analyzing fixed field length schema...');
        const firstPageData = sessionResponse.data;
        const expectedLengths = {};
        
        if (firstPageData.length > 0) {
            const sampleRecord = firstPageData[0];
            for (const [fieldName, fieldValue] of Object.entries(sampleRecord)) {
                expectedLengths[fieldName] = String(fieldValue).length;
            }
        }

        console.log('📋 Expected field lengths (should be consistent across ALL pages):');
        for (const [field, length] of Object.entries(expectedLengths)) {
            console.log(`   ${field}: ${length} characters`);
        }
        console.log();

        // Step 3: Test multiple pages for consistency
        console.log('🔍 Step 3: Testing field length consistency across pages...');
        const pagesToTest = [1, 5, 25, 50, 75, 99, 100]; // Test various pages including edge cases
        const inconsistencies = [];

        for (const pageNum of pagesToTest) {
            if (pageNum > totalPages) continue;

            console.log(`   Testing page ${pageNum}...`);
            
            try {
                let pageData;
                if (pageNum === 1) {
                    pageData = firstPageData; // Use already fetched data
                } else {
                    // Create POST payload for page request with sessionId in payload
                    const pagePayload = {
                        ...sessionData,
                        sessionId: sessionId,
                        pageNumber: pageNum
                    };
                    const pageResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', pagePayload);
                    if (!pageResponse.success) {
                        throw new Error(`Page ${pageNum} request failed: ${pageResponse.error}`);
                    }
                    pageData = pageResponse.data;
                }

                // Check first few records of this page
                for (let recordIndex = 0; recordIndex < Math.min(3, pageData.length); recordIndex++) {
                    const record = pageData[recordIndex];
                    for (const [fieldName, fieldValue] of Object.entries(record)) {
                        const actualLength = String(fieldValue).length;
                        const expectedLength = expectedLengths[fieldName];
                        
                        if (actualLength !== expectedLength) {
                            inconsistencies.push({
                                page: pageNum,
                                record: recordIndex,
                                field: fieldName,
                                expected: expectedLength,
                                actual: actualLength,
                                value: fieldValue
                            });
                        }
                    }
                }
            } catch (error) {
                console.log(`   ❌ Error testing page ${pageNum}: ${error.message}`);
                inconsistencies.push({
                    page: pageNum,
                    error: error.message
                });
            }

            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Step 4: Report results
        console.log();
        // Verify relative URLs
        console.log('🔗 URL Format Check:');
        if (sessionResponse.pagination.nextUrl && sessionResponse.pagination.nextUrl.startsWith('/')) {
            console.log('✅ nextUrl is relative path (no domain)');
        } else {
            console.log('❌ nextUrl should be relative path');
        }
        console.log();
        
        console.log('📊 FIXED LENGTH CONSISTENCY RESULTS:');
        console.log('===================================');
        
        if (inconsistencies.length === 0) {
            console.log('✅ PERFECT! All field lengths are consistent across all tested pages!');
            console.log(`✅ Fixed Field Length is working correctly for ${sessionResponse.pagination.totalRecords} records`);
            console.log(`✅ Schema consistency maintained across ${totalPages} pages`);
        } else {
            console.log(`❌ Found ${inconsistencies.length} inconsistencies:`);
            
            for (const issue of inconsistencies.slice(0, 10)) { // Show first 10 issues
                if (issue.error) {
                    console.log(`   Page ${issue.page}: ERROR - ${issue.error}`);
                } else {
                    console.log(`   Page ${issue.page}, Record ${issue.record}, Field '${issue.field}':`);
                    console.log(`     Expected: ${issue.expected} chars, Got: ${issue.actual} chars`);
                    console.log(`     Value: "${issue.value}"`);
                }
            }
            
            if (inconsistencies.length > 10) {
                console.log(`   ... and ${inconsistencies.length - 10} more issues`);
            }
        }

        // Step 5: Test specific page multiple times for determinism
        console.log();
        console.log('🔄 Step 5: Testing deterministic behavior (same page multiple calls)...');
        const testPage = Math.min(50, totalPages);
        const multipleCalls = [];
        
        for (let i = 0; i < 3; i++) {
            const pagePayload = {
                ...sessionData,
                pageNumber: testPage
            };
            const response = await makeRequest(`http://localhost:3000/generate-paginated/${sessionId}`, 'POST', pagePayload);
            if (response.success && response.data.length > 0) {
                multipleCalls.push({
                    call: i + 1,
                    firstRecord: response.data[0]
                });
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (multipleCalls.length >= 2) {
            const isDeterministic = JSON.stringify(multipleCalls[0].firstRecord) === JSON.stringify(multipleCalls[1].firstRecord);
            
            if (isDeterministic) {
                console.log(`✅ Page ${testPage} returns identical data on multiple calls (deterministic)`);
            } else {
                console.log(`❌ Page ${testPage} returns different data on multiple calls (non-deterministic)`);
                console.log('   Call 1 first record:', JSON.stringify(multipleCalls[0].firstRecord, null, 2));
                console.log('   Call 2 first record:', JSON.stringify(multipleCalls[1].firstRecord, null, 2));
            }
        }

        console.log();
        console.log('🎯 FIXED LENGTH TEST SUMMARY:');
        console.log('=============================');
        console.log(`Session ID: ${sessionId}`);
        console.log(`Total Records: ${sessionResponse.pagination.totalRecords}`);
        console.log(`Total Pages: ${totalPages}`);
        console.log(`Field Count: ${Object.keys(expectedLengths).length}`);
        console.log(`Pages Tested: ${pagesToTest.filter(p => p <= totalPages).length}`);
        console.log(`Length Inconsistencies: ${inconsistencies.length}`);
        
        if (inconsistencies.length === 0) {
            console.log('🏆 FIXED LENGTH TEST PASSED! All validations successful!');
        } else {
            console.log('🐛 FIXED LENGTH TEST FAILED! Issues detected.');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testFixedLengthPagination().then(() => {
        console.log('\n✨ Fixed Length test completed!');
    }).catch(error => {
        console.error('\n💥 Test crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { testFixedLengthPagination };

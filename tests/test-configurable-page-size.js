#!/usr/bin/env node

/**
 * CONFIGURABLE PAGE SIZE TEST
 * ===========================
 * 
 * This test validates the configurable records per page feature:
 * - Different page sizes (10, 25, 50, 100, 500, 1000)
 * - Validation of min/max limits (10-1000)
 * - Correct pagination calculations
 * - Page navigation with different page sizes
 * - Edge cases and boundary conditions
 * 
 * Usage: node tests/test-configurable-page-size.js
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

async function testConfigurablePageSize() {
    console.log('📊 CONFIGURABLE PAGE SIZE TEST');
    console.log('==============================');
    console.log('Testing records per page configurability (10-1000 range)');
    console.log();

    const testResults = {
        pageSizeTests: 0,
        validationTests: 0,
        navigationTests: 0,
        edgeCaseTests: 0,
        passed: 0,
        failed: 0
    };

    try {
        // Test 1: Different Page Sizes
        console.log('📋 TEST 1: Different Page Sizes');
        console.log('===============================');
        
        const pageSizeTests = [
            { pageSize: 10, totalRecords: 100, expectedPages: 10, description: "Minimum page size" },
            { pageSize: 25, totalRecords: 500, expectedPages: 20, description: "Small page size" },
            { pageSize: 50, totalRecords: 1000, expectedPages: 20, description: "Medium page size" },
            { pageSize: 100, totalRecords: 1000, expectedPages: 10, description: "Default page size" },
            { pageSize: 200, totalRecords: 1000, expectedPages: 5, description: "Large page size" },
            { pageSize: 500, totalRecords: 2000, expectedPages: 4, description: "Very large page size" },
            { pageSize: 1000, totalRecords: 5000, expectedPages: 5, description: "Maximum page size" }
        ];

        for (const test of pageSizeTests) {
            testResults.pageSizeTests++;
            console.log(`   Testing ${test.description} (${test.pageSize} records/page)...`);
            
            const sessionData = {
                numFields: 3,
                numObjects: 0,
                numNesting: 0,
                totalRecords: test.totalRecords,
                nestedFields: 0,
                uniformFieldLength: false,
                recordsPerPage: test.pageSize
            };

            try {
                const response = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
                
                if (!response.success) {
                    throw new Error(`Request failed: ${response.error}`);
                }

                const { pagination } = response;
                
                // Validate pagination calculations
                if (pagination.recordsPerPage !== test.pageSize) {
                    throw new Error(`Expected recordsPerPage ${test.pageSize}, got ${pagination.recordsPerPage}`);
                }
                
                if (pagination.totalPages !== test.expectedPages) {
                    throw new Error(`Expected ${test.expectedPages} pages, got ${pagination.totalPages}`);
                }
                
                if (pagination.recordsInCurrentPage !== Math.min(test.pageSize, test.totalRecords)) {
                    throw new Error(`Expected ${Math.min(test.pageSize, test.totalRecords)} records in page 1, got ${pagination.recordsInCurrentPage}`);
                }
                
                if (response.data.length !== pagination.recordsInCurrentPage) {
                    throw new Error(`Data array length (${response.data.length}) doesn't match recordsInCurrentPage (${pagination.recordsInCurrentPage})`);
                }

                console.log(`     ✅ Page size ${test.pageSize}: ${pagination.totalPages} pages, ${pagination.recordsInCurrentPage} records in page 1`);
                testResults.passed++;
                
            } catch (error) {
                console.log(`     ❌ Failed: ${error.message}`);
                testResults.failed++;
            }

            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        }

        console.log();

        // Test 2: Validation Tests (Invalid Page Sizes)
        console.log('🔒 TEST 2: Validation Tests');
        console.log('===========================');
        
        const validationTests = [
            { pageSize: 5, description: "Below minimum (5 < 10)" },
            { pageSize: 9, description: "Just below minimum (9 < 10)" },
            { pageSize: 1001, description: "Just above maximum (1001 > 1000)" },
            { pageSize: 1500, description: "Well above maximum (1500 > 1000)" },
            { pageSize: 0, description: "Zero page size" },
            { pageSize: -10, description: "Negative page size" }
        ];

        for (const test of validationTests) {
            testResults.validationTests++;
            console.log(`   Testing ${test.description}...`);
            
            const sessionData = {
                numFields: 3,
                numObjects: 0,
                numNesting: 0,
                totalRecords: 100,
                nestedFields: 0,
                uniformFieldLength: false,
                recordsPerPage: test.pageSize
            };

            try {
                const response = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
                
                if (response.success) {
                    console.log(`     ❌ Expected validation error but request succeeded`);
                    testResults.failed++;
                } else {
                    if (response.error && response.error.includes('Records per page must be between 10 and 1000')) {
                        console.log(`     ✅ Correctly rejected with: "${response.error}"`);
                        testResults.passed++;
                    } else {
                        console.log(`     ❌ Wrong error message: "${response.error}"`);
                        testResults.failed++;
                    }
                }
                
            } catch (error) {
                console.log(`     ❌ Network error: ${error.message}`);
                testResults.failed++;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log();

        // Test 3: Page Navigation with Different Page Sizes
        console.log('🔄 TEST 3: Page Navigation Tests');
        console.log('================================');
        
        const navigationTests = [
            { pageSize: 25, totalRecords: 250, testPage: 5, expectedRecords: 25 },
            { pageSize: 30, totalRecords: 100, testPage: 4, expectedRecords: 10 } // Last page with fewer records
        ];

        for (const test of navigationTests) {
            testResults.navigationTests++;
            console.log(`   Testing navigation with ${test.pageSize} records/page (page ${test.testPage})...`);
            
            const sessionData = {
                numFields: 3,
                numObjects: 0,
                numNesting: 0,
                totalRecords: test.totalRecords,
                nestedFields: 0,
                uniformFieldLength: false,
                recordsPerPage: test.pageSize
            };

            try {
                // Create session
                const sessionResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
                
                if (!sessionResponse.success) {
                    throw new Error(`Session creation failed: ${sessionResponse.error}`);
                }

                const sessionId = sessionResponse.sessionId;
                
                // Navigate to specific page
                const pagePayload = {
                    ...sessionData,
                    pageNumber: test.testPage
                };
                
                const pageResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...pagePayload, sessionId: sessionId });
                
                if (!pageResponse.success) {
                    throw new Error(`Page navigation failed: ${pageResponse.error}`);
                }

                const { pagination } = pageResponse;
                
                if (pagination.currentPage !== test.testPage) {
                    throw new Error(`Expected page ${test.testPage}, got ${pagination.currentPage}`);
                }
                
                if (pagination.recordsInCurrentPage !== test.expectedRecords) {
                    throw new Error(`Expected ${test.expectedRecords} records, got ${pagination.recordsInCurrentPage}`);
                }
                
                if (pageResponse.data.length !== test.expectedRecords) {
                    throw new Error(`Data array length (${pageResponse.data.length}) doesn't match expected (${test.expectedRecords})`);
                }

                console.log(`     ✅ Page ${test.testPage}: ${pagination.recordsInCurrentPage} records (expected ${test.expectedRecords})`);
                testResults.passed++;
                
            } catch (error) {
                console.log(`     ❌ Failed: ${error.message}`);
                testResults.failed++;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log();

        // Test 4: Edge Cases
        console.log('⚠️  TEST 4: Edge Cases');
        console.log('======================');
        
        const edgeCaseTests = [
            { 
                pageSize: 100, 
                totalRecords: 99, 
                expectedPages: 1, 
                expectedRecords: 99,
                description: "Total records less than page size" 
            },
            { 
                pageSize: 50, 
                totalRecords: 50, 
                expectedPages: 1, 
                expectedRecords: 50,
                description: "Total records equals page size" 
            },
            { 
                pageSize: 33, 
                totalRecords: 100, 
                expectedPages: 4, 
                expectedRecords: 33,
                description: "Non-divisible page size" 
            }
        ];

        for (const test of edgeCaseTests) {
            testResults.edgeCaseTests++;
            console.log(`   Testing ${test.description}...`);
            
            const sessionData = {
                numFields: 3,
                numObjects: 0,
                numNesting: 0,
                totalRecords: test.totalRecords,
                nestedFields: 0,
                uniformFieldLength: false,
                recordsPerPage: test.pageSize
            };

            try {
                const response = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
                
                if (!response.success) {
                    throw new Error(`Request failed: ${response.error}`);
                }

                const { pagination } = response;
                
                if (pagination.totalPages !== test.expectedPages) {
                    throw new Error(`Expected ${test.expectedPages} pages, got ${pagination.totalPages}`);
                }
                
                if (pagination.recordsInCurrentPage !== test.expectedRecords) {
                    throw new Error(`Expected ${test.expectedRecords} records in page 1, got ${pagination.recordsInCurrentPage}`);
                }

                console.log(`     ✅ ${test.description}: ${pagination.totalPages} pages, ${pagination.recordsInCurrentPage} records in page 1`);
                testResults.passed++;
                
            } catch (error) {
                console.log(`     ❌ Failed: ${error.message}`);
                testResults.failed++;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Test Results Summary
        console.log();
        console.log('📊 CONFIGURABLE PAGE SIZE TEST RESULTS:');
        console.log('=======================================');
        console.log(`📋 Page Size Tests: ${testResults.pageSizeTests} executed`);
        console.log(`🔒 Validation Tests: ${testResults.validationTests} executed`);
        console.log(`🔄 Navigation Tests: ${testResults.navigationTests} executed`);
        console.log(`⚠️  Edge Case Tests: ${testResults.edgeCaseTests} executed`);
        console.log();
        console.log(`✅ Passed: ${testResults.passed}`);
        console.log(`❌ Failed: ${testResults.failed}`);
        console.log(`📊 Total Tests: ${testResults.passed + testResults.failed}`);
        console.log(`🎯 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
        
        console.log();
        if (testResults.failed === 0) {
            console.log('🏆 ALL CONFIGURABLE PAGE SIZE TESTS PASSED!');
            console.log('✅ Page size configurability is working perfectly!');
            console.log('✅ Validation is properly enforcing limits (10-1000)');
            console.log('✅ Pagination calculations are accurate for all page sizes');
            console.log('✅ Page navigation works correctly with different page sizes');
            console.log('✅ Edge cases are handled properly');
        } else {
            console.log('🐛 SOME TESTS FAILED!');
            console.log('❌ Please review the failed test cases above');
        }

        return {
            success: testResults.failed === 0,
            totalTests: testResults.passed + testResults.failed,
            passed: testResults.passed,
            failed: testResults.failed,
            details: testResults
        };

    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the configurable page size test
if (require.main === module) {
    testConfigurablePageSize().then((result) => {
        if (result.success) {
            console.log('\n✨ Configurable page size test completed successfully!');
            process.exit(0);
        } else {
            console.log('\n💥 Configurable page size test failed!');
            process.exit(1);
        }
    }).catch(error => {
        console.error('\n💥 Test crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { testConfigurablePageSize };

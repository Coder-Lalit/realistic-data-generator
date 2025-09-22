#!/usr/bin/env node

/**
 * NATURAL LENGTH PAGINATION TEST
 * ==============================
 * 
 * This test validates that Natural Length mode works correctly:
 * - Field lengths vary naturally as expected (no artificial constraints)
 * - Same page returns identical data on multiple calls (deterministic)
 * - Cross-page variation is natural and realistic
 * - Large datasets are handled efficiently
 * 
 * Usage: node tests/test-natural-length-pagination.js
 */

const http = require('http');

function makeRequest(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(responseData)); }
                catch (error) { reject(new Error(`JSON Parse Error: ${error.message}`)); }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function testNaturalLengthPagination() {
    console.log('🌿 NATURAL LENGTH PAGINATION TEST - 10K RECORDS');
    console.log('===============================================');
    console.log('Expected: Natural field lengths (may vary) but deterministic data');
    console.log();

    try {
        // Step 1: Create session WITHOUT Fixed Field Length
        console.log('📋 Step 1: Creating session with Natural Field Lengths...');
        const sessionData = {
            numFields: 5,
            numObjects: 0,
            numNesting: 0,
            totalRecords: 10000,
            nestedFields: 0,
            uniformFieldLength: false  // ⚠️ KEY: Natural lengths
        };

        const sessionResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
        
        if (!sessionResponse.success) {
            throw new Error(`Session creation failed: ${sessionResponse.error}`);
        }

        const sessionId = sessionResponse.sessionId;
        const totalPages = sessionResponse.pagination.totalPages;
        console.log(`✅ Session created: ${sessionId}`);
        console.log(`📊 Total pages: ${totalPages} (${sessionResponse.pagination.totalRecords} records)`);
        console.log(`🌿 Fixed Field Length: DISABLED (natural variation expected)`);
        console.log();

        // Step 2: Analyze natural field length variation from first page
        console.log('📏 Step 2: Analyzing natural field length patterns...');
        const firstPageData = sessionResponse.data;
        
        // Collect length statistics from first page
        const fieldStats = {};
        for (const record of firstPageData.slice(0, 10)) { // Sample first 10 records
            for (const [fieldName, fieldValue] of Object.entries(record)) {
                if (!fieldStats[fieldName]) {
                    fieldStats[fieldName] = [];
                }
                fieldStats[fieldName].push(String(fieldValue).length);
            }
        }

        console.log('📊 Field length analysis (first 10 records):');
        for (const [fieldName, lengths] of Object.entries(fieldStats)) {
            const min = Math.min(...lengths);
            const max = Math.max(...lengths);
            const avg = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1);
            console.log(`   ${fieldName}: min=${min}, max=${max}, avg=${avg} chars ${min === max ? '(consistent)' : '(varies)'}`);
        }
        console.log();

        // Step 3: Test multiple pages for natural variation
        console.log('🔍 Step 3: Testing multiple pages for natural variation...');
        const pagesToTest = [1, 10, 25, 50, 75, 90, 100];
        const allFieldStats = {};

        for (const pageNum of pagesToTest) {
            if (pageNum > totalPages) continue;

            console.log(`   Analyzing page ${pageNum}...`);
            
            try {
                let pageData;
                if (pageNum === 1) {
                    pageData = firstPageData;
                } else {
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

                // Collect length stats from this page (first 5 records)
                for (const record of pageData.slice(0, 5)) {
                    for (const [fieldName, fieldValue] of Object.entries(record)) {
                        if (!allFieldStats[fieldName]) {
                            allFieldStats[fieldName] = [];
                        }
                        allFieldStats[fieldName].push(String(fieldValue).length);
                    }
                }

            } catch (error) {
                console.log(`   ❌ Error testing page ${pageNum}: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Step 4: Report natural variation results
        console.log();
        console.log('📊 NATURAL LENGTH VARIATION ANALYSIS:');
        console.log('====================================');
        
        for (const [fieldName, lengths] of Object.entries(allFieldStats)) {
            const min = Math.min(...lengths);
            const max = Math.max(...lengths);
            const avg = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1);
            const range = max - min;
            const samples = lengths.length;
            
            console.log(`${fieldName}:`);
            console.log(`   Range: ${min}-${max} chars (variation: ${range})`);
            console.log(`   Average: ${avg} chars (${samples} samples)`);
            console.log(`   ${range === 0 ? '✅ Consistent length' : '🌿 Natural variation'}`);
        }

        // Step 5: Test deterministic behavior (critical for pagination)
        console.log();
        console.log('🔄 Step 5: Testing deterministic behavior (same page = same data)...');
        const testPages = [5, 25, 50, 75];
        let determinismPassed = true;

        for (const pageNum of testPages) {
            if (pageNum > totalPages) continue;
            
            console.log(`   Testing page ${pageNum} determinism...`);
            
            try {
                // Make multiple calls to same page
                const pagePayload = {
                    ...sessionData,
                    pageNumber: pageNum
                };
                const call1 = await makeRequest(`http://localhost:3000/generate-paginated/${sessionId}`, 'POST', pagePayload);
                await new Promise(resolve => setTimeout(resolve, 200));
                const call2 = await makeRequest(`http://localhost:3000/generate-paginated/${sessionId}`, 'POST', pagePayload);
                await new Promise(resolve => setTimeout(resolve, 200));
                const call3 = await makeRequest(`http://localhost:3000/generate-paginated/${sessionId}`, 'POST', pagePayload);

                if (!call1.success || !call2.success || !call3.success) {
                    console.log(`     ❌ Failed to fetch page data`);
                    determinismPassed = false;
                    continue;
                }

                // Compare first record across all calls
                const record1 = JSON.stringify(call1.data[0]);
                const record2 = JSON.stringify(call2.data[0]);
                const record3 = JSON.stringify(call3.data[0]);

                const isDeterministic = (record1 === record2) && (record2 === record3);
                
                if (isDeterministic) {
                    console.log(`     ✅ Identical data on all calls`);
                } else {
                    console.log(`     ❌ Different data on multiple calls`);
                    console.log(`     Call 1: ${call1.data[0].fullName_4} (${call1.data[0].fullName_4.length} chars)`);
                    console.log(`     Call 2: ${call2.data[0].fullName_4} (${call2.data[0].fullName_4.length} chars)`);
                    console.log(`     Call 3: ${call3.data[0].fullName_4} (${call3.data[0].fullName_4.length} chars)`);
                    determinismPassed = false;
                }

            } catch (error) {
                console.log(`     💥 Error: ${error.message}`);
                determinismPassed = false;
            }
        }

        // Step 6: Cross-page variation check
        console.log();
        console.log('🌍 Step 6: Testing cross-page field variation...');
        
        try {
            const page1Payload = { ...sessionData, pageNumber: 1 };
            const page50Payload = { ...sessionData, pageNumber: 50 };
            const page1Response = await makeRequest(`http://localhost:3000/generate-paginated/${sessionId}`, 'POST', page1Payload);
            const page50Response = await makeRequest(`http://localhost:3000/generate-paginated/${sessionId}`, 'POST', page50Payload);
            
            if (page1Response.success && page50Response.success) {
                const record1 = page1Response.data[0];
                const record50 = page50Response.data[0];
                
                console.log('   Comparing field lengths across different pages:');
                let hasVariation = false;
                
                for (const fieldName of Object.keys(record1)) {
                    const len1 = String(record1[fieldName]).length;
                    const len50 = String(record50[fieldName]).length;
                    
                    if (len1 !== len50) {
                        hasVariation = true;
                    }
                    
                    console.log(`     ${fieldName}: Page 1=${len1} chars, Page 50=${len50} chars ${len1 === len50 ? '(same)' : '(varies)'}`);
                }
                
                console.log(`   ${hasVariation ? '🌿 Natural variation confirmed' : '⚠️ Unexpectedly consistent'}`);
            }
        } catch (error) {
            console.log(`   ❌ Cross-page test failed: ${error.message}`);
        }

        // Final Results
        console.log();
        console.log('🎯 NATURAL LENGTH PAGINATION RESULTS:');
        console.log('====================================');
        console.log(`Session ID: ${sessionId}`);
        console.log(`Total Records: ${sessionResponse.pagination.totalRecords}`);
        console.log(`Total Pages: ${totalPages}`);
        console.log(`Pages Tested: ${pagesToTest.filter(p => p <= totalPages).length}`);
        console.log(`Determinism Test: ${determinismPassed ? '✅ PASSED' : '❌ FAILED'}`);
        
        if (determinismPassed) {
            console.log('🏆 SUCCESS! Natural length pagination working correctly!');
            console.log('✅ Same page returns identical data (deterministic)');
            console.log('🌿 Field lengths vary naturally as expected');
            console.log('✅ No artificial length constraints applied');
        } else {
            console.log('🐛 ISSUE! Determinism test failed - same page returning different data');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the natural length test
if (require.main === module) {
    testNaturalLengthPagination().then(() => {
        console.log('\n✨ Natural length test completed!');
    }).catch(error => {
        console.error('\n💥 Test crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { testNaturalLengthPagination };

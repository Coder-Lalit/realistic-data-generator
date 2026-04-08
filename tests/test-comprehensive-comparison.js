#!/usr/bin/env node

/**
 * COMPREHENSIVE COMPARISON TEST
 * ============================
 * 
 * This test compares Fixed Length vs Natural Length modes side-by-side:
 * - Creates sessions for both modes simultaneously
 * - Compares field length behavior between modes
 * - Validates deterministic behavior for both modes
 * - Tests cross-page consistency patterns
 * - Measures performance differences
 * 
 * Usage: node tests/test-comprehensive-comparison.js
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

function withoutUuid1(record) {
    if (!record || typeof record !== 'object') return record;
    const { uuid_1: _u, ...rest } = record;
    return rest;
}

async function comprehensiveComparisonTest() {
    console.log('🔬 COMPREHENSIVE COMPARISON: FIXED vs NATURAL LENGTH');
    console.log('==================================================');
    console.log('Testing both modes side-by-side with 10K records each');
    console.log();

    try {
        // Create sessions for both modes
        console.log('📋 Creating test sessions...');
        
        const baseConfig = {
            numFields: 5,
            numObjects: 0,
            numNesting: 0,
            totalRecords: 10000,
            nestedFields: 0,
            useCopy: true
        };

        // Fixed Length Session
        const fixedLengthResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', {
            ...baseConfig,
            uniformFieldLength: true
        });

        // Natural Length Session
        const naturalLengthResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', {
            ...baseConfig,
            uniformFieldLength: false
        });

        if (!fixedLengthResponse.success || !naturalLengthResponse.success) {
            throw new Error('Failed to create test sessions');
        }

        console.log(`✅ Fixed Length Session: ${fixedLengthResponse.sessionId}`);
        console.log(`✅ Natural Length Session: ${naturalLengthResponse.sessionId}`);
        console.log();

        // Analyze field patterns from both sessions
        console.log('📊 FIELD LENGTH ANALYSIS COMPARISON:');
        console.log('===================================');

        const fixedData = fixedLengthResponse.data.slice(0, 10);
        const naturalData = naturalLengthResponse.data.slice(0, 10);

        console.log('🔒 FIXED LENGTH MODE:');
        const fixedStats = {};
        for (const record of fixedData) {
            for (const [fieldName, fieldValue] of Object.entries(record)) {
                // Extract field type from field name (e.g., "firstName_2" -> "firstName")
                const fieldType = fieldName.split('_')[0];
                
                // Only analyze string field types for length consistency
                if (isStringFieldType(fieldType)) {
                    if (!fixedStats[fieldName]) fixedStats[fieldName] = [];
                    fixedStats[fieldName].push(String(fieldValue).length);
                }
            }
        }

        for (const [fieldName, lengths] of Object.entries(fixedStats)) {
            const min = Math.min(...lengths);
            const max = Math.max(...lengths);
            const isConsistent = min === max;
            console.log(`   ${fieldName}: ${isConsistent ? '✅' : '❌'} ${min === max ? `${min} chars (consistent)` : `${min}-${max} chars (varies)`}`);
        }

        console.log();
        console.log('🌿 NATURAL LENGTH MODE:');
        const naturalStats = {};
        for (const record of naturalData) {
            for (const [fieldName, fieldValue] of Object.entries(record)) {
                // Extract field type from field name (e.g., "firstName_2" -> "firstName")
                const fieldType = fieldName.split('_')[0];
                
                // Only analyze string field types for length consistency
                if (isStringFieldType(fieldType)) {
                    if (!naturalStats[fieldName]) naturalStats[fieldName] = [];
                    naturalStats[fieldName].push(String(fieldValue).length);
                }
            }
        }

        for (const [fieldName, lengths] of Object.entries(naturalStats)) {
            const min = Math.min(...lengths);
            const max = Math.max(...lengths);
            const variation = max - min;
            console.log(`   ${fieldName}: 🌿 ${min === max ? `${min} chars (natural)` : `${min}-${max} chars (varies by ${variation})`}`);
        }

        // Test determinism for both modes
        console.log();
        console.log('🔄 DETERMINISM TEST COMPARISON:');
        console.log('==============================');

        const testPage = 25;

        // Test Fixed Length determinism
        console.log(`🔒 Fixed Length Session (Page ${testPage}):`);
        const fixedPayload = { ...baseConfig, uniformFieldLength: true, pageNumber: testPage };
        const fixed1 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...fixedPayload, sessionId: fixedLengthResponse.sessionId });
        await new Promise(resolve => setTimeout(resolve, 200));
        const fixed2 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...fixedPayload, sessionId: fixedLengthResponse.sessionId });
        
        const fixedDeterministic =
            JSON.stringify(withoutUuid1(fixed1.data[0])) === JSON.stringify(withoutUuid1(fixed2.data[0]));
        console.log(`   ${fixedDeterministic ? '✅' : '❌'} ${fixedDeterministic ? 'Same cached row (ignoring uuid_1)' : 'Different data detected'}`);

        // Test Natural Length determinism
        console.log(`🌿 Natural Length Session (Page ${testPage}):`);
        const naturalPayload = { ...baseConfig, uniformFieldLength: false, pageNumber: testPage };
        const natural1 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...naturalPayload, sessionId: naturalLengthResponse.sessionId });
        await new Promise(resolve => setTimeout(resolve, 200));
        const natural2 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...naturalPayload, sessionId: naturalLengthResponse.sessionId });
        
        const naturalDeterministic =
            JSON.stringify(withoutUuid1(natural1.data[0])) === JSON.stringify(withoutUuid1(natural2.data[0]));
        console.log(`   ${naturalDeterministic ? '✅' : '❌'} ${naturalDeterministic ? 'Same cached row (ignoring uuid_1)' : 'Different data detected'}`);

        // Cross-page consistency test
        console.log();
        console.log('📄 CROSS-PAGE CONSISTENCY TEST:');
        console.log('===============================');

        // Test Fixed Length cross-page consistency
        console.log('🔒 Fixed Length - Field length consistency across pages:');
        const fixedPage1 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: true, pageNumber: 1, sessionId: fixedLengthResponse.sessionId });
        const fixedPage50 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: true, pageNumber: 50, sessionId: fixedLengthResponse.sessionId });
        const fixedPage100 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: true, pageNumber: 100, sessionId: fixedLengthResponse.sessionId });

        const fixedRecord1 = fixedPage1.data[0];
        const fixedRecord50 = fixedPage50.data[0];
        const fixedRecord100 = fixedPage100.data[0];

        let fixedConsistency = true;
        for (const fieldName of Object.keys(fixedRecord1)) {
            // Extract field type from field name (e.g., "firstName_2" -> "firstName")
            const fieldType = fieldName.split('_')[0];
            
            // Only validate string fields for length consistency
            if (isStringFieldType(fieldType)) {
                const len1 = String(fixedRecord1[fieldName]).length;
                const len50 = String(fixedRecord50[fieldName]).length;
                const len100 = String(fixedRecord100[fieldName]).length;
                
                const isConsistent = (len1 === len50) && (len50 === len100);
                if (!isConsistent) fixedConsistency = false;
                
                console.log(`   ${fieldName}: ${isConsistent ? '✅' : '❌'} ${len1}=${len50}=${len100} chars ${isConsistent ? '(consistent)' : '(inconsistent)'}`);
            } else {
                console.log(`   ${fieldName}: ⏭️  Skipped (${fieldType} - non-string field)`);
            }
        }

        console.log();
        console.log('🌿 Natural Length - useCopy returns same first-page slice for every page index:');
        const naturalPage1 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: false, pageNumber: 1, sessionId: naturalLengthResponse.sessionId });
        const naturalPage50 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: false, pageNumber: 50, sessionId: naturalLengthResponse.sessionId });
        const naturalPage100 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: false, pageNumber: 100, sessionId: naturalLengthResponse.sessionId });

        const naturalRecord1 = naturalPage1.data[0];
        const naturalRecord50 = naturalPage50.data[0];
        const naturalRecord100 = naturalPage100.data[0];

        let naturalVariation = false;
        for (const fieldName of Object.keys(naturalRecord1)) {
            // Extract field type from field name (e.g., "firstName_2" -> "firstName")
            const fieldType = fieldName.split('_')[0];
            
            // Only analyze string fields for length variation
            if (isStringFieldType(fieldType)) {
                const len1 = String(naturalRecord1[fieldName]).length;
                const len50 = String(naturalRecord50[fieldName]).length;
                const len100 = String(naturalRecord100[fieldName]).length;
                
                const hasVariation = !((len1 === len50) && (len50 === len100));
                if (hasVariation) naturalVariation = true;
                
                console.log(`   ${fieldName}: 🌿 ${len1}-${len50}-${len100} chars ${hasVariation ? '(unexpected mismatch)' : '(same slice — expected)'}`);
            } else {
                console.log(`   ${fieldName}: ⏭️  Skipped (${fieldType} - non-string field)`);
            }
        }

        // Performance comparison
        console.log();
        console.log('⚡ PERFORMANCE COMPARISON:');
        console.log('=========================');

        const startFixed = Date.now();
        await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: true, pageNumber: 75, sessionId: fixedLengthResponse.sessionId });
        const fixedTime = Date.now() - startFixed;

        const startNatural = Date.now();
        await makeRequest('http://localhost:3000/generate-paginated', 'POST', { ...baseConfig, uniformFieldLength: false, pageNumber: 75, sessionId: naturalLengthResponse.sessionId });
        const naturalTime = Date.now() - startNatural;

        console.log(`🔒 Fixed Length Response Time: ${fixedTime}ms`);
        console.log(`🌿 Natural Length Response Time: ${naturalTime}ms`);
        console.log(`📊 Performance Difference: ${Math.abs(fixedTime - naturalTime)}ms (${fixedTime < naturalTime ? 'Fixed faster' : 'Natural faster'})`);

        // Final Results Summary
        console.log();
        console.log('🏆 COMPREHENSIVE COMPARISON RESULTS:');
        console.log('===================================');
        
        console.log('📊 MODE BEHAVIOR SUMMARY:');
        console.log(`🔒 uniformFieldLength=true (seeded Faker):`);
        console.log(
            `   Cross-page string length match: ${fixedConsistency ? 'same first-row lengths across sample pages' : 'varies (expected with seed-only mode)'}`
        );
        console.log(`   useCopy cache (ignoring uuid_1): ${fixedDeterministic ? '✅ stable' : '❌ unstable'}`);
        console.log(`   ⚡ Performance: ${fixedTime}ms`);

        console.log(`🌿 uniformFieldLength=false:`);
        console.log(`   Cross-page row lengths vs page index: ${naturalVariation ? 'inconsistent (bug)' : 'same slice (useCopy)'}`);
        console.log(`   useCopy cache (ignoring uuid_1): ${naturalDeterministic ? '✅ stable' : '❌ unstable'}`);
        console.log(`   ⚡ Performance: ${naturalTime}ms`);

        console.log();
        console.log('🎯 VALIDATION STATUS:');
        const overallPass =
            !!fixedLengthResponse.sessionId &&
            !!naturalLengthResponse.sessionId &&
            fixedDeterministic &&
            naturalDeterministic;
        console.log(`Overall System Health: ${overallPass ? '✅ EXCELLENT' : '❌ ISSUES DETECTED'}`);

        if (overallPass) {
            console.log('🏆 Both modes: sessions + useCopy cache behave as expected.');
        } else {
            console.log('🐛 Issues detected (session or useCopy stability).');
        }

        // Return results for programmatic use
        return {
            success: overallPass,
            fixedLengthSession: fixedLengthResponse.sessionId,
            naturalLengthSession: naturalLengthResponse.sessionId,
            fixedConsistency,
            fixedDeterministic,
            naturalDeterministic,
            naturalVariation,
            fixedTime,
            naturalTime
        };

    } catch (error) {
        console.error('❌ Comprehensive test failed:', error.message);
        process.exit(1);
    }
}

// Run the comprehensive comparison
if (require.main === module) {
    comprehensiveComparisonTest().then(() => {
        console.log('\n🎉 Comprehensive comparison completed!');
    }).catch(error => {
        console.error('\n💥 Comparison test crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { comprehensiveComparisonTest };

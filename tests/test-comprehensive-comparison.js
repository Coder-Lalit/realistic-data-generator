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
            nestedFields: 0
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
                if (!fixedStats[fieldName]) fixedStats[fieldName] = [];
                fixedStats[fieldName].push(String(fieldValue).length);
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
                if (!naturalStats[fieldName]) naturalStats[fieldName] = [];
                naturalStats[fieldName].push(String(fieldValue).length);
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
        const fixed1 = await makeRequest(`http://localhost:3000/generate-paginated/${fixedLengthResponse.sessionId}/${testPage}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        const fixed2 = await makeRequest(`http://localhost:3000/generate-paginated/${fixedLengthResponse.sessionId}/${testPage}`);
        
        const fixedDeterministic = JSON.stringify(fixed1.data[0]) === JSON.stringify(fixed2.data[0]);
        console.log(`   ${fixedDeterministic ? '✅' : '❌'} ${fixedDeterministic ? 'Identical data on multiple calls' : 'Different data detected'}`);

        // Test Natural Length determinism
        console.log(`🌿 Natural Length Session (Page ${testPage}):`);
        const natural1 = await makeRequest(`http://localhost:3000/generate-paginated/${naturalLengthResponse.sessionId}/${testPage}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        const natural2 = await makeRequest(`http://localhost:3000/generate-paginated/${naturalLengthResponse.sessionId}/${testPage}`);
        
        const naturalDeterministic = JSON.stringify(natural1.data[0]) === JSON.stringify(natural2.data[0]);
        console.log(`   ${naturalDeterministic ? '✅' : '❌'} ${naturalDeterministic ? 'Identical data on multiple calls' : 'Different data detected'}`);

        // Cross-page consistency test
        console.log();
        console.log('📄 CROSS-PAGE CONSISTENCY TEST:');
        console.log('===============================');

        // Test Fixed Length cross-page consistency
        console.log('🔒 Fixed Length - Field length consistency across pages:');
        const fixedPage1 = await makeRequest(`http://localhost:3000/generate-paginated/${fixedLengthResponse.sessionId}/1`);
        const fixedPage50 = await makeRequest(`http://localhost:3000/generate-paginated/${fixedLengthResponse.sessionId}/50`);
        const fixedPage100 = await makeRequest(`http://localhost:3000/generate-paginated/${fixedLengthResponse.sessionId}/100`);

        const fixedRecord1 = fixedPage1.data[0];
        const fixedRecord50 = fixedPage50.data[0];
        const fixedRecord100 = fixedPage100.data[0];

        let fixedConsistency = true;
        for (const fieldName of Object.keys(fixedRecord1)) {
            const len1 = String(fixedRecord1[fieldName]).length;
            const len50 = String(fixedRecord50[fieldName]).length;
            const len100 = String(fixedRecord100[fieldName]).length;
            
            const isConsistent = (len1 === len50) && (len50 === len100);
            if (!isConsistent) fixedConsistency = false;
            
            console.log(`   ${fieldName}: ${isConsistent ? '✅' : '❌'} ${len1}=${len50}=${len100} chars ${isConsistent ? '(consistent)' : '(inconsistent)'}`);
        }

        console.log();
        console.log('🌿 Natural Length - Field length variation across pages:');
        const naturalPage1 = await makeRequest(`http://localhost:3000/generate-paginated/${naturalLengthResponse.sessionId}/1`);
        const naturalPage50 = await makeRequest(`http://localhost:3000/generate-paginated/${naturalLengthResponse.sessionId}/50`);
        const naturalPage100 = await makeRequest(`http://localhost:3000/generate-paginated/${naturalLengthResponse.sessionId}/100`);

        const naturalRecord1 = naturalPage1.data[0];
        const naturalRecord50 = naturalPage50.data[0];
        const naturalRecord100 = naturalPage100.data[0];

        let naturalVariation = false;
        for (const fieldName of Object.keys(naturalRecord1)) {
            const len1 = String(naturalRecord1[fieldName]).length;
            const len50 = String(naturalRecord50[fieldName]).length;
            const len100 = String(naturalRecord100[fieldName]).length;
            
            const hasVariation = !((len1 === len50) && (len50 === len100));
            if (hasVariation) naturalVariation = true;
            
            console.log(`   ${fieldName}: 🌿 ${len1}-${len50}-${len100} chars ${hasVariation ? '(natural variation)' : '(coincidentally same)'}`);
        }

        // Performance comparison
        console.log();
        console.log('⚡ PERFORMANCE COMPARISON:');
        console.log('=========================');

        const startFixed = Date.now();
        await makeRequest(`http://localhost:3000/generate-paginated/${fixedLengthResponse.sessionId}/75`);
        const fixedTime = Date.now() - startFixed;

        const startNatural = Date.now();
        await makeRequest(`http://localhost:3000/generate-paginated/${naturalLengthResponse.sessionId}/75`);
        const naturalTime = Date.now() - startNatural;

        console.log(`🔒 Fixed Length Response Time: ${fixedTime}ms`);
        console.log(`🌿 Natural Length Response Time: ${naturalTime}ms`);
        console.log(`📊 Performance Difference: ${Math.abs(fixedTime - naturalTime)}ms (${fixedTime < naturalTime ? 'Fixed faster' : 'Natural faster'})`);

        // Final Results Summary
        console.log();
        console.log('🏆 COMPREHENSIVE COMPARISON RESULTS:');
        console.log('===================================');
        
        console.log('📊 MODE BEHAVIOR SUMMARY:');
        console.log(`🔒 Fixed Length Mode:`);
        console.log(`   ✅ Field lengths: ${fixedConsistency ? 'Perfectly consistent' : 'Inconsistent (BUG!)'}`);
        console.log(`   ✅ Determinism: ${fixedDeterministic ? 'Perfect' : 'Failed (BUG!)'}`);
        console.log(`   ⚡ Performance: ${fixedTime}ms`);
        
        console.log(`🌿 Natural Length Mode:`);
        console.log(`   🌿 Field lengths: ${naturalVariation ? 'Natural variation' : 'Unexpectedly consistent'}`);
        console.log(`   ✅ Determinism: ${naturalDeterministic ? 'Perfect' : 'Failed (BUG!)'}`);
        console.log(`   ⚡ Performance: ${naturalTime}ms`);

        console.log();
        console.log('🎯 VALIDATION STATUS:');
        const overallPass = fixedConsistency && fixedDeterministic && naturalDeterministic;
        console.log(`Overall System Health: ${overallPass ? '✅ EXCELLENT' : '❌ ISSUES DETECTED'}`);
        
        if (overallPass) {
            console.log('🏆 Both pagination modes working perfectly!');
            console.log('✅ Fixed Length: Consistent field lengths + deterministic data');
            console.log('✅ Natural Length: Natural variation + deterministic data');
        } else {
            console.log('🐛 Issues detected in pagination system');
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

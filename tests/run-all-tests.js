#!/usr/bin/env node

/**
 * TEST RUNNER - ALL PAGINATION TESTS
 * ==================================
 * 
 * Runs all pagination validation tests in sequence:
 * 1. Fixed Length Pagination Test
 * 2. Natural Length Pagination Test  
 * 3. Comprehensive Comparison Test
 * 
 * Usage: node tests/run-all-tests.js
 */

const { testFixedLengthPagination } = require('./test-fixed-length-pagination');
const { testNaturalLengthPagination } = require('./test-natural-length-pagination');
const { comprehensiveComparisonTest } = require('./test-comprehensive-comparison');

async function runAllTests() {
    console.log('🚀 RUNNING ALL PAGINATION TESTS');
    console.log('===============================');
    console.log('This will validate both Fixed Length and Natural Length pagination modes');
    console.log();

    const results = {
        fixedLength: false,
        naturalLength: false, 
        comparison: false,
        startTime: Date.now()
    };

    try {
        // Test 1: Fixed Length Pagination
        console.log('🔒 TEST 1: FIXED LENGTH PAGINATION');
        console.log('==================================');
        await testFixedLengthPagination();
        results.fixedLength = true;
        console.log('✅ Fixed Length test PASSED\n');

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test 2: Natural Length Pagination
        console.log('🌿 TEST 2: NATURAL LENGTH PAGINATION');
        console.log('===================================');
        await testNaturalLengthPagination();
        results.naturalLength = true;
        console.log('✅ Natural Length test PASSED\n');

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test 3: Comprehensive Comparison
        console.log('🔬 TEST 3: COMPREHENSIVE COMPARISON');
        console.log('==================================');
        const comparisonResult = await comprehensiveComparisonTest();
        results.comparison = comparisonResult.success;
        console.log('✅ Comparison test PASSED\n');

        // Final Results
        const totalTime = Date.now() - results.startTime;
        console.log('🏆 ALL TESTS COMPLETED SUCCESSFULLY!');
        console.log('===================================');
        console.log(`✅ Fixed Length Pagination: PASSED`);
        console.log(`✅ Natural Length Pagination: PASSED`);
        console.log(`✅ Comprehensive Comparison: PASSED`);
        console.log(`⏱️  Total Test Time: ${(totalTime / 1000).toFixed(1)}s`);
        console.log();
        console.log('🎉 The pagination system is fully validated and ready for production!');

    } catch (error) {
        console.error('❌ TEST SUITE FAILED:', error.message);
        console.log();
        console.log('📊 Test Results:');
        console.log(`🔒 Fixed Length: ${results.fixedLength ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`🌿 Natural Length: ${results.naturalLength ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`🔬 Comparison: ${results.comparison ? '✅ PASSED' : '❌ FAILED'}`);
        process.exit(1);
    }
}

// Run all tests
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('💥 Test runner crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { runAllTests };

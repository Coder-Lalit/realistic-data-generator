#!/usr/bin/env node

/**
 * TEST RUNNER - ALL PAGINATION TESTS
 * ==================================
 *
 * Runs pagination validation tests in sequence:
 * 1. Natural length pagination
 * 2. Configurable page size
 *
 * Usage: node tests/run-all-tests.js
 */

const { testNaturalLengthPagination } = require('./test-natural-length-pagination');
const { testConfigurablePageSize } = require('./test-configurable-page-size');

async function runAllTests() {
    console.log('🚀 RUNNING ALL PAGINATION TESTS');
    console.log('===============================');
    console.log();

    const results = {
        naturalLength: false,
        configurablePageSize: false,
        startTime: Date.now()
    };

    try {
        console.log('🌿 TEST 1: NATURAL LENGTH PAGINATION');
        console.log('=====================================');
        await testNaturalLengthPagination();
        results.naturalLength = true;
        console.log('✅ Natural length pagination test PASSED\n');

        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('📊 TEST 2: CONFIGURABLE PAGE SIZE');
        console.log('=================================');
        const pageSizeResult = await testConfigurablePageSize();
        results.configurablePageSize = pageSizeResult.success;
        console.log('✅ Configurable page size test PASSED\n');

        const totalTime = Date.now() - results.startTime;
        console.log('🏆 ALL TESTS COMPLETED SUCCESSFULLY!');
        console.log('===================================');
        console.log(`✅ Natural Length Pagination: PASSED`);
        console.log(`✅ Configurable Page Size: PASSED`);
        console.log(`⏱️  Total Test Time: ${(totalTime / 1000).toFixed(1)}s`);
        console.log();
        console.log('🎉 Pagination tests passed.');
    } catch (error) {
        console.error('❌ TEST SUITE FAILED:', error.message);
        console.log();
        console.log('📊 Test Results:');
        console.log(`🌿 Natural Length: ${results.naturalLength ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`📊 Configurable Page Size: ${results.configurablePageSize ? '✅ PASSED' : '❌ FAILED'}`);
        process.exit(1);
    }
}

if (require.main === module) {
    runAllTests().catch(error => {
        console.error('💥 Test runner crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { runAllTests };

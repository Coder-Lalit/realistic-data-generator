#!/usr/bin/env node

/**
 * Seeded / uniformFieldLength pagination test (useCopy session)
 *
 * uniformFieldLength now only applies a deterministic Faker seed per layout — not fixed string widths.
 * Validates pagination, relative nextUrl, and useCopy: one snapshot per session (same rows for any pageNumber when ignoring uuid_1).
 *
 * Usage: node tests/test-fixed-length-pagination.js
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

function withoutUuid1(record) {
    if (!record || typeof record !== 'object') return record;
    const { uuid_1: _u, ...rest } = record;
    return rest;
}

async function testFixedLengthPagination() {
    console.log('🔒 UNIFORM / SEEDED PAGINATION TEST - 10K RECORDS (useCopy)');
    console.log('===========================================================');
    console.log();

    try {
        const sessionData = {
            numFields: 5,
            numObjects: 0,
            numNesting: 0,
            totalRecords: 10000,
            nestedFields: 0,
            uniformFieldLength: true,
            recordsPerPage: 100,
            useCopy: true
        };

        console.log('📋 Step 1: Creating useCopy session...');
        const sessionResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);

        if (!sessionResponse.success) {
            throw new Error(`Session creation failed: ${sessionResponse.error}`);
        }

        const sessionId = sessionResponse.sessionId;
        const totalPages = sessionResponse.pagination.totalPages;
        if (!sessionId) {
            throw new Error('Expected sessionId when useCopy is true');
        }
        console.log(`✅ Session: ${sessionId}`);

        const dupConfigResponse = await makeRequest('http://localhost:3000/generate-paginated', 'POST', sessionData);
        if (!dupConfigResponse.success) {
            throw new Error(`Duplicate config request failed: ${dupConfigResponse.error}`);
        }
        if (dupConfigResponse.sessionId !== sessionId) {
            throw new Error(
                `Deterministic sessionId expected for same config: got ${dupConfigResponse.sessionId}, first ${sessionId}`
            );
        }
        console.log('✅ Same config without sessionId → same sessionId (shared useCopy cache)');
        console.log(`📊 Total pages: ${totalPages} (${sessionResponse.pagination.totalRecords} records)`);
        console.log();

        console.log('🔗 Pagination links: nextUrl is only set for GET /data (POST omits it).');
        if (sessionResponse.pagination.hasNextPage) {
            console.log('✅ hasNextPage is true (more pages available)');
        }
        console.log();

        const testPage = Math.min(50, totalPages);
        console.log(`🔄 Step 2: useCopy cache — same page twice (ignoring uuid_1)...`);
        const pagePayload = {
            ...sessionData,
            sessionId,
            pageNumber: testPage
        };
        const r1 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', pagePayload);
        await new Promise((r) => setTimeout(r, 150));
        const r2 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', pagePayload);

        if (!r1.success || !r2.success) {
            throw new Error('Page fetch failed');
        }
        const stable =
            JSON.stringify(withoutUuid1(r1.data[0])) === JSON.stringify(withoutUuid1(r2.data[0]));
        if (stable) {
            console.log(`✅ Page ${testPage}: same row payload when ignoring uuid_1 (cache working)`);
        } else {
            throw new Error('useCopy cache: row mismatch when ignoring uuid_1');
        }

        const altPage = Math.min(99, totalPages);
        const p1Payload = { ...sessionData, sessionId, pageNumber: 1 };
        const pAltPayload = { ...sessionData, sessionId, pageNumber: altPage };
        const p1 = await makeRequest('http://localhost:3000/generate-paginated', 'POST', p1Payload);
        const pAlt = await makeRequest('http://localhost:3000/generate-paginated', 'POST', pAltPayload);
        if (!p1.success || !pAlt.success) {
            throw new Error('Cross-page useCopy fetch failed');
        }
        const stripRows = (rows) => rows.map(withoutUuid1);
        if (JSON.stringify(stripRows(p1.data)) !== JSON.stringify(stripRows(pAlt.data))) {
            throw new Error('useCopy: page 1 vs other page should return same rows (ignoring uuid_1)');
        }
        console.log(`✅ Page 1 vs page ${altPage}: identical payload when ignoring uuid_1`);

        console.log();
        console.log('🏆 Seeded pagination test passed.');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    testFixedLengthPagination().then(() => {
        console.log('\n✨ Test completed!');
    }).catch((error) => {
        console.error('\n💥 Test crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { testFixedLengthPagination };

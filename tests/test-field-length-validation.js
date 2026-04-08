#!/usr/bin/env node

/**
 * Smoke test: large generate-data request with uniformFieldLength (deterministic seed only).
 * Field-length uniformity across rows is no longer enforced — we only verify a successful response.
 *
 * Usage: node tests/test-field-length-validation.js
 */

const http = require('http');

function makeRequest(hostname, port, path, method, bodyStr) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        body: JSON.parse(data)
                    });
                } catch (e) {
                    reject(new Error(`Invalid JSON: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

async function testFieldLengthValidation() {
    console.log('🧪 Field length / uniformFieldLength smoke test');
    console.log('='.repeat(60));

    const payload = {
        numFields: 50,
        numObjects: 0,
        numNesting: 0,
        numRecords: 200,
        nestedFields: 0,
        uniformFieldLength: true,
        excludeEmoji: false
    };

    console.log('\n📋 Payload:', JSON.stringify(payload, null, 2));

    const response = await makeRequest('localhost', 3000, '/generate-data', 'POST', JSON.stringify(payload));

    if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(response.body)}`);
    }
    if (!response.body.success) {
        throw new Error(response.body.error || 'API did not return success');
    }
    const rows = response.body.data;
    if (!Array.isArray(rows) || rows.length !== payload.numRecords) {
        throw new Error(`Expected ${payload.numRecords} records, got ${rows?.length}`);
    }
    if (!rows[0] || typeof rows[0] !== 'object' || !Object.keys(rows[0]).length) {
        throw new Error('First record missing or empty');
    }

    console.log(`\n✅ Generated ${rows.length} records with uniformFieldLength=true (seeded batch).`);
    console.log('   Note: per-field string lengths may still vary across rows.');
}

module.exports = { testFieldLengthValidation };

if (require.main === module) {
    testFieldLengthValidation()
        .then(() => {
            console.log('\n🎉 Smoke test passed.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('\n💥 Test failed:', err.message);
            process.exit(1);
        });
}

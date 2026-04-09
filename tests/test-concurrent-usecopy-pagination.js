#!/usr/bin/env node

/**
 * Load test: N concurrent "users" each walk GET /data useCopy pagination until HTTP 400.
 *
 * First request uses the full query string; then follows pagination.nextUrl (relative).
 * On the last page nextUrl is null — requests page totalPages+1 with the same sessionId to trigger 400.
 *
 * Env:
 *   TEST_BASE_URL       default http://localhost:3000
 *   CONCURRENT_USERS    default 25
 *   USE_COPY_LOCK_WAIT  max 503 retries per request (default 30)
 *   TEST_NUM_RECORDS        optional — override numRecords for a shorter run (e.g. 500 → 5 pages)
 *   CONCURRENT_PROGRESS_PAGES  log every N OK pages per user (default 50; set 0 to disable)
 *
 * Usage: server must be running — npm run test:concurrent
 * Note: default numRecords=100000 → 1000 pages per user (heavy). Use TEST_NUM_RECORDS for smoke tests.
 *       Lines appear as each user starts/finishes; long runs no longer look “stuck” before Promise.all completes.
 */

const http = require('http');
const https = require('https');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const CONCURRENT_USERS = Math.max(1, parseInt(process.env.CONCURRENT_USERS || '25', 10) || 25);
const MAX_503_RETRIES = Math.max(1, parseInt(process.env.USE_COPY_LOCK_WAIT || '30', 10) || 30);
const _progRaw = process.env.CONCURRENT_PROGRESS_PAGES;
const PROGRESS_EVERY_PAGES =
    _progRaw === undefined || _progRaw === '' ? 50 : Math.max(0, parseInt(_progRaw, 10) || 0);

const NUM_RECORDS = process.env.TEST_NUM_RECORDS
    ? String(Math.max(1, parseInt(process.env.TEST_NUM_RECORDS, 10) || 100000))
    : '100000';

const INITIAL_PATH = `/data?numFields=52&numObjects=0&numNesting=0&nestedFields=0&enablePagination=true&recordsPerPage=100&excludeEmoji=true&numRecords=${encodeURIComponent(
    NUM_RECORDS
)}&useCopy=true`;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function httpGet(urlString) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlString);
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;
        const port = u.port ? parseInt(u.port, 10) : isHttps ? 443 : 80;
        const options = {
            hostname: u.hostname,
            port,
            path: u.pathname + u.search,
            method: 'GET',
            headers: { Accept: 'application/json' }
        };

        const req = lib.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({ status: res.statusCode, body });
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => {
            req.destroy(new Error('socket timeout'));
        });
        req.end();
    });
}

async function getWithRetry(url) {
    let last;
    for (let attempt = 0; attempt < MAX_503_RETRIES; attempt++) {
        last = await httpGet(url);
        if (last.status !== 503) {
            return last;
        }
        await sleep(80 + attempt * 40);
    }
    return last;
}

function parseJsonSafe(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * One user: walk pages until a 400 (invalid page).
 */
async function simulateUser(userId) {
    const started = Date.now();
    let url = new URL(INITIAL_PATH, BASE).href;
    let requests = 0;
    let pagesOk = 0;
    let lastStatus = null;
    let lastBodySnippet = '';

    while (true) {
        requests++;
        const res = await getWithRetry(url);
        lastStatus = res.status;

        if (res.status === 400) {
            lastBodySnippet = res.body.slice(0, 200);
            break;
        }

        if (res.status !== 200) {
            lastBodySnippet = res.body.slice(0, 200);
            throw new Error(`User ${userId}: unexpected HTTP ${res.status} at request #${requests}: ${lastBodySnippet}`);
        }

        const json = parseJsonSafe(res.body);
        if (!json || json.success !== true) {
            throw new Error(`User ${userId}: expected success JSON at request #${requests}`);
        }

        pagesOk++;

        if (PROGRESS_EVERY_PAGES > 0 && pagesOk % PROGRESS_EVERY_PAGES === 0) {
            const elapsed = Date.now() - started;
            console.log(
                `  [User ${userId}] ${pagesOk} pages OK | ${requests} HTTP requests | ${elapsed}ms elapsed`
            );
        }

        const nextRel = json.pagination && json.pagination.nextUrl;
        const sessionId = json.sessionId;
        const totalPages = json.pagination && json.pagination.totalPages;

        if (nextRel) {
            url = new URL(nextRel, BASE).href;
            continue;
        }

        if (!sessionId || !Number.isFinite(totalPages) || totalPages < 1) {
            throw new Error(`User ${userId}: missing sessionId or totalPages on last page`);
        }

        url = new URL(`/data?sessionId=${encodeURIComponent(sessionId)}&pageNumber=${totalPages + 1}`, BASE).href;
    }

    const ms = Date.now() - started;
    return { userId, requests, pagesOk, ms, lastStatus, lastBodySnippet };
}

async function main() {
    console.log('Concurrent useCopy pagination walk (until HTTP 400)');
    console.log('====================================================');
    console.log(`BASE: ${BASE}`);
    console.log(`Users: ${CONCURRENT_USERS}`);
    console.log(`numRecords: ${NUM_RECORDS}`);
    console.log(`Initial: ${INITIAL_PATH}`);
    console.log(
        `Progress: "→ User N started" immediately; ${
            PROGRESS_EVERY_PAGES > 0
                ? `then every ${PROGRESS_EVERY_PAGES} OK pages per user; `
                : 'no per-page lines (CONCURRENT_PROGRESS_PAGES=0); '
        }"✅ User N" when that user finishes (others may still be running).`
    );
    console.log();

    const t0 = Date.now();
    const results = await Promise.all(
        Array.from({ length: CONCURRENT_USERS }, (_, i) => {
            const id = i + 1;
            console.log(`→ User ${id} started`);
            return simulateUser(id)
                .then((r) => {
                    const secs = (r.ms / 1000).toFixed(2);
                    console.log(
                        `✅ User ${id}: total time ${r.ms}ms (${secs}s) | ${r.requests} HTTP calls | ${r.pagesOk} OK pages | 400: ${r.lastBodySnippet.replace(/\s+/g, ' ').trim()}`
                    );
                    return r;
                })
                .catch((err) => {
                    console.log(`❌ User ${id}: ${err.message}`);
                    return { userId: id, error: err.message };
                });
        })
    );
    const totalMs = Date.now() - t0;

    const failures = results.filter((r) => r.error);
    const ok = results.filter((r) => !r.error);

    console.log();
    if (failures.length) {
        console.log(`Failed: ${failures.length}/${CONCURRENT_USERS}`);
        process.exit(1);
    }

    const totalRequests = ok.reduce((s, r) => s + r.requests, 0);
    const maxUserMs = Math.max(...ok.map((r) => r.ms));
    const minUserMs = Math.min(...ok.map((r) => r.ms));
    const avgUserMs = ok.reduce((s, r) => s + r.ms, 0) / ok.length;
    console.log(`All ${CONCURRENT_USERS} users finished with HTTP 400 after last page.`);
    console.log(`Wall time (parallel): ${totalMs}ms (${(totalMs / 1000).toFixed(2)}s)`);
    console.log(`Sum of requests: ${totalRequests} (avg ${(totalRequests / CONCURRENT_USERS).toFixed(1)} per user)`);
    console.log(`Per-user total time — min: ${minUserMs}ms | max: ${maxUserMs}ms | avg: ${avgUserMs.toFixed(0)}ms`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

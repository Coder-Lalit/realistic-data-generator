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
 *   CONCURRENT_OUTPUT     set 0/false to skip writing files (default: save responses)
 *   CONCURRENT_OUT_DIR    root folder for runs (default: <project>/outPut)
 *
 * Usage: server must be running — npm run test:concurrent
 * Responses: outPut/<run-timestamp>/meta.json and user-<id>/<NNNNN>-<status>.json per HTTP response.
 * Note: default numRecords=100000 → 1000 pages per user (heavy). Use TEST_NUM_RECORDS for smoke tests.
 *       Lines appear as each user starts/finishes; long runs no longer look “stuck” before Promise.all completes.
 */

const fs = require('fs').promises;
const http = require('http');
const https = require('https');
const path = require('path');

const SAVE_OUTPUT = !['0', 'false'].includes(String(process.env.CONCURRENT_OUTPUT || '').toLowerCase());
const OUT_ROOT = process.env.CONCURRENT_OUT_DIR || path.join(__dirname, '..', 'outPut');

const BASE = process.env.TEST_BASE_URL || 'https://realistic-data-generator-g6j8.onrender.com';
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

const MAX_BODY_RAW_CHARS = Math.max(1000, parseInt(process.env.CONCURRENT_MAX_BODY_CHARS || '500000', 10) || 500000);

async function saveHttpResponse(runDir, userId, reqIndex, status, url, body) {
    if (!runDir) return;
    const dir = path.join(runDir, `user-${userId}`);
    await fs.mkdir(dir, { recursive: true });
    const name = `${String(reqIndex).padStart(5, '0')}-${status}.json`;
    const file = path.join(dir, name);
    const parsed = parseJsonSafe(body);
    const payload = {
        status,
        url,
        savedAt: new Date().toISOString(),
        body: parsed !== null ? parsed : undefined,
        bodyRaw: parsed === null ? String(body).slice(0, MAX_BODY_RAW_CHARS) : undefined
    };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * One user: walk pages until a 400 (invalid page).
 */
async function simulateUser(userId, runDir) {
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

        await saveHttpResponse(runDir, userId, requests, res.status, url, res.body);

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

    let runDir = null;
    if (SAVE_OUTPUT) {
        const runId = new Date().toISOString().replace(/[:.]/g, '-');
        runDir = path.join(OUT_ROOT, runId);
        await fs.mkdir(runDir, { recursive: true });
        await fs.writeFile(
            path.join(runDir, 'meta.json'),
            JSON.stringify(
                {
                    startedAt: new Date().toISOString(),
                    base: BASE,
                    concurrentUsers: CONCURRENT_USERS,
                    numRecords: NUM_RECORDS,
                    initialPath: INITIAL_PATH,
                    outRoot: OUT_ROOT,
                    runId
                },
                null,
                2
            ),
            'utf8'
        );
        console.log(`Saving responses under: ${runDir}`);
        console.log();
    }

    const t0 = Date.now();
    const results = await Promise.all(
        Array.from({ length: CONCURRENT_USERS }, (_, i) => {
            const id = i + 1;
            console.log(`→ User ${id} started`);
            return simulateUser(id, runDir)
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
    }

    const totalRequests = ok.reduce((s, r) => s + r.requests, 0);
    const maxUserMs = ok.length ? Math.max(...ok.map((r) => r.ms)) : 0;
    const minUserMs = ok.length ? Math.min(...ok.map((r) => r.ms)) : 0;
    const avgUserMs = ok.length ? ok.reduce((s, r) => s + r.ms, 0) / ok.length : 0;
    if (!failures.length) {
        console.log(`All ${CONCURRENT_USERS} users finished with HTTP 400 after last page.`);
        console.log(`Wall time (parallel): ${totalMs}ms (${(totalMs / 1000).toFixed(2)}s)`);
        console.log(`Sum of requests: ${totalRequests} (avg ${(totalRequests / CONCURRENT_USERS).toFixed(1)} per user)`);
        console.log(`Per-user total time — min: ${minUserMs}ms | max: ${maxUserMs}ms | avg: ${avgUserMs.toFixed(0)}ms`);
    }

    if (runDir) {
        await fs.writeFile(
            path.join(runDir, 'summary.json'),
            JSON.stringify(
                {
                    finishedAt: new Date().toISOString(),
                    wallMs: totalMs,
                    concurrentUsers: CONCURRENT_USERS,
                    failedUsers: failures.length,
                    totalRequests,
                    perUserOk: ok.map((r) => ({
                        userId: r.userId,
                        requests: r.requests,
                        pagesOk: r.pagesOk,
                        ms: r.ms
                    })),
                    errors: failures.map((r) => ({ userId: r.userId, error: r.error }))
                },
                null,
                2
            ),
            'utf8'
        );
        console.log();
        console.log(`Wrote summary: ${path.join(runDir, 'summary.json')}`);
    }

    if (failures.length) {
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

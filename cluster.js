#!/usr/bin/env node

/**
 * Multi-worker entry: one primary forks N Node processes sharing the same PORT (OS distributes connections).
 * Safe with useCopy when REDIS_URL is set (shared template + lock). Without Redis, useCopy stays per-worker only.
 *
 * Env:
 *   WEB_CONCURRENCY  number of workers (default: CPU count, min 1, max 32)
 *   CLUSTER_WORKERS  alias for WEB_CONCURRENCY
 *
 * With REDIS_URL: each worker holds one Redis connection — plan maxclients (and any other apps on the same URL)
 * must allow at least (workers × instances). If you see ERR max number of clients reached, lower WEB_CONCURRENCY
 * or raise the Redis tier / maxclients.
 *
 * Run: npm run start:cluster   (or node cluster.js)
 */

require('dotenv').config();

const cluster = require('cluster');
const os = require('os');

const raw = process.env.WEB_CONCURRENCY || process.env.CLUSTER_WORKERS || String(os.cpus().length);
const parsed = parseInt(raw, 10);
const numWorkers = Math.min(32, Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : os.cpus().length));

if (cluster.isPrimary) {
    console.log(
        `[cluster] primary pid=${process.pid} forking ${numWorkers} worker(s) (WEB_CONCURRENCY=${process.env.WEB_CONCURRENCY ?? 'default'})`
    );
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
        console.log(
            `[cluster] worker pid=${worker.process.pid} exited code=${code} signal=${signal || 'none'} — spawning replacement`
        );
        cluster.fork();
    });
} else {
    require('./app.js');
}

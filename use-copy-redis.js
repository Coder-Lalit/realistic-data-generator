/**
 * Shared useCopy row template in Redis (one JSON row per config fingerprint).
 * SET NX lock + poll so parallel misses wait for the first generator instead of failing.
 */

const { createClient } = require('redis');

const PREFIX = 'dg:usecopy:';

let client = null;
let connecting = null;
let connectFailed = false;

function redisUrl() {
    return process.env.REDIS_URL || process.env.REDIS_TLS_URL || '';
}

function isConfigured() {
    return Boolean(redisUrl());
}

function templateKey(cacheKey) {
    return `${PREFIX}t:${cacheKey}`;
}

function configKey(cacheKey) {
    return `${PREFIX}c:${cacheKey}`;
}

function lockKey(cacheKey) {
    return `${PREFIX}l:${cacheKey}`;
}

function ttlSeconds() {
    const n = parseInt(process.env.USE_COPY_REDIS_TTL_SEC || '600', 10);
    return Number.isFinite(n) && n > 0 ? n : 600;
}

function lockSeconds() {
    const n = parseInt(process.env.USE_COPY_LOCK_SEC || '45', 10);
    return Number.isFinite(n) && n >= 5 ? Math.min(n, 120) : 45;
}

function lockWaitMs() {
    const n = parseInt(process.env.USE_COPY_LOCK_WAIT_MS || '20000', 10);
    return Number.isFinite(n) && n >= 500 ? Math.min(n, 120000) : 20000;
}

function pollMs() {
    const n = parseInt(process.env.USE_COPY_LOCK_POLL_MS || '50', 10);
    return Number.isFinite(n) && n >= 10 ? Math.min(n, 500) : 50;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function redisErrorMessage(err) {
    return err && err.message ? String(err.message) : '';
}

/** Command / connect errors that should map to redis_unavailable (not crash the request). */
function isRedisTransientOrCapacityError(err) {
    const msg = redisErrorMessage(err);
    return (
        msg.includes('max number of clients') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Socket closed') ||
        msg.includes('LOADING') ||
        msg.includes('READONLY')
    );
}

/** Sliding TTL: extend template + config keys by full window (e.g. next 10 min from this hit). */
async function refreshPairTtl(c, cacheKey) {
    const ttl = ttlSeconds();
    const tKey = templateKey(cacheKey);
    const cKey = configKey(cacheKey);
    await Promise.all([c.expire(tKey, ttl).catch(() => {}), c.expire(cKey, ttl).catch(() => {})]);
}

async function getClient() {
    if (connectFailed || !isConfigured()) {
        return null;
    }
    if (client && client.isOpen) {
        return client;
    }
    if (!connecting) {
        client = createClient({ url: redisUrl() });
        client.on('error', (err) => {
            console.error('[use-copy-redis]', err.message);
        });
        connecting = client
            .connect()
            .then(() => client)
            .catch((err) => {
                connecting = null;
                client = null;
                const msg = redisErrorMessage(err);
                console.error('[use-copy-redis] connect failed:', msg);
                // Capacity / transient: do not latch connectFailed so a later request can retry.
                if (isRedisTransientOrCapacityError(err)) {
                    return null;
                }
                connectFailed = true;
                return null;
            });
    }
    const c = await connecting;
    return c && c.isOpen ? c : null;
}

async function isReady() {
    const c = await getClient();
    return Boolean(c);
}

async function getConfig(cacheKey) {
    const c = await getClient();
    if (!c) return null;
    let raw;
    try {
        raw = await c.get(configKey(cacheKey));
    } catch (err) {
        console.error('[use-copy-redis] getConfig:', redisErrorMessage(err));
        return null;
    }
    if (!raw) return null;
    try {
        const cfg = JSON.parse(raw);
        await refreshPairTtl(c, cacheKey);
        return cfg;
    } catch {
        return null;
    }
}

async function hasConfig(cacheKey) {
    const cfg = await getConfig(cacheKey);
    return cfg != null;
}

/**
 * @param {object} sessionConfig
 * @param {string} cacheKey e.g. ucopy_abcd1234
 * @param {() => object} generateOneRow sync, returns one data row object
 * @returns {Promise<{ hit: boolean, row: object } | { hit: boolean, row: null, error: string }>}
 */
async function getOrCreateTemplateRow(sessionConfig, cacheKey, generateOneRow) {
    const c = await getClient();
    if (!c) {
        return { hit: false, row: null, error: 'redis_unavailable' };
    }

    const tKey = templateKey(cacheKey);
    const cKey = configKey(cacheKey);
    const lKey = lockKey(cacheKey);
    const ttl = ttlSeconds();
    const lockTtl = lockSeconds();
    const maxWait = lockWaitMs();
    const step = pollMs();

    try {
        const existing = await c.get(tKey);
        if (existing) {
            try {
                const row = JSON.parse(existing);
                await refreshPairTtl(c, cacheKey);
                return { hit: true, row };
            } catch {
                await c.del(tKey).catch(() => {});
            }
        }

        const acquired = await c.set(lKey, '1', { EX: lockTtl, NX: true });

        if (acquired === 'OK') {
            try {
                const again = await c.get(tKey);
                if (again) {
                    const row = JSON.parse(again);
                    await refreshPairTtl(c, cacheKey);
                    return { hit: true, row };
                }
                const row = generateOneRow();
                const payload = JSON.stringify(row);
                await c.set(tKey, payload, { EX: ttl });
                await c.set(cKey, JSON.stringify(sessionConfig), { EX: ttl });
                return { hit: false, row };
            } catch (e) {
                await c.del(tKey).catch(() => {});
                if (isRedisTransientOrCapacityError(e)) {
                    console.error('[use-copy-redis] getOrCreateTemplateRow:', redisErrorMessage(e));
                    return { hit: false, row: null, error: 'redis_unavailable' };
                }
                throw e;
            } finally {
                await c.del(lKey).catch(() => {});
            }
        }

        const deadline = Date.now() + maxWait;
        while (Date.now() < deadline) {
            const raw = await c.get(tKey);
            if (raw) {
                try {
                    const row = JSON.parse(raw);
                    await refreshPairTtl(c, cacheKey);
                    return { hit: true, row };
                } catch {
                    await sleep(step);
                    continue;
                }
            }
            await sleep(step);
        }

        const finalCheck = await c.get(tKey);
        if (finalCheck) {
            try {
                const row = JSON.parse(finalCheck);
                await refreshPairTtl(c, cacheKey);
                return { hit: true, row };
            } catch {
                /* fallthrough */
            }
        }

        return { hit: false, row: null, error: 'lock_wait_timeout' };
    } catch (err) {
        console.error('[use-copy-redis] getOrCreateTemplateRow:', redisErrorMessage(err));
        return { hit: false, row: null, error: 'redis_unavailable' };
    }
}

module.exports = {
    isConfigured,
    isReady,
    getClient,
    getConfig,
    hasConfig,
    getOrCreateTemplateRow
};

'use strict';

const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const mongoose = require('mongoose');
const GeneratedData = require('./generatedDataModel');

const QUEUE_NAME = 'data-generation';
const JOB_DATA_KEY_PREFIX = 'jobdata:';

let queueConnection;
let queueInstance;
let readRedis;

function createRedisConnection() {
    return new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null
    });
}

function getQueueConnection() {
    if (!process.env.REDIS_URL) return null;
    if (!queueConnection) {
        queueConnection = createRedisConnection();
    }
    return queueConnection;
}

function getReadRedis() {
    if (!process.env.REDIS_URL) return null;
    if (!readRedis) {
        readRedis = createRedisConnection();
    }
    return readRedis;
}

function isQueueEnabled() {
    return Boolean(process.env.REDIS_URL && String(process.env.REDIS_URL).trim());
}

function getQueue() {
    if (!isQueueEnabled()) return null;
    if (!queueInstance) {
        queueInstance = new Queue(QUEUE_NAME, { connection: getQueueConnection() });
    }
    return queueInstance;
}

async function addGenerateDataJob(jobPayload) {
    const q = getQueue();
    if (!q) {
        const err = new Error('REDIS_URL is not set');
        err.code = 'QUEUE_DISABLED';
        throw err;
    }
    const attempts = Math.max(1, parseInt(process.env.JOB_ATTEMPTS || '2', 10) || 2);
    // Small Redis (e.g. 30MB free tier): keep history tiny — job payloads are small; big JSON must use Mongo, not jobdata:* keys.
    const completeCount = Math.max(0, parseInt(process.env.JOB_QUEUE_COMPLETE_MAX_COUNT || '50', 10) || 50);
    const completeAgeSec = Math.max(0, parseInt(process.env.JOB_QUEUE_COMPLETE_MAX_AGE_SEC || '600', 10) || 600);
    const failCount = Math.max(0, parseInt(process.env.JOB_QUEUE_FAIL_MAX_COUNT || '30', 10) || 30);
    const failAgeSec = Math.max(0, parseInt(process.env.JOB_QUEUE_FAIL_MAX_AGE_SEC || '3600', 10) || 3600);
    return q.add('generate', jobPayload, {
        attempts,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: completeAgeSec, count: completeCount },
        removeOnFail: { age: failAgeSec, count: failCount }
    });
}

async function getJobById(jobId) {
    const q = getQueue();
    if (!q) return null;
    return q.getJob(jobId);
}

async function loadJobPayload(job) {
    const rv = job.returnvalue;
    if (!rv || typeof rv !== 'object') {
        return { data: null, meta: rv };
    }
    if (rv.storage === 'mongo') {
        if (!mongoose.connection.readyState) {
            return { data: null, meta: rv, loadError: 'MongoDB not connected on API server' };
        }
        const doc = await GeneratedData.findOne({ sessionId: rv.sessionId }).lean();
        return { data: doc ? doc.data : null, meta: rv };
    }
    if (rv.storage === 'redis') {
        const r = getReadRedis();
        if (!r) {
            return { data: null, meta: rv, loadError: 'Redis not configured' };
        }
        const raw = await r.get(`${JOB_DATA_KEY_PREFIX}${job.id}`);
        if (!raw) {
            return { data: null, meta: rv };
        }
        try {
            const parsed = JSON.parse(raw);
            return { data: parsed.data, meta: rv };
        } catch (e) {
            return { data: null, meta: rv, loadError: e.message };
        }
    }
    return { data: null, meta: rv };
}

async function buildJobStatusResponse(jobId) {
    const job = await getJobById(jobId);
    if (!job) return null;

    const state = await job.getState();
    const out = {
        jobId: String(job.id),
        state,
        progress: job.progress,
        attemptsMade: job.attemptsMade
    };

    if (state === 'completed') {
        const { data, meta, loadError } = await loadJobPayload(job);
        out.success = true;
        out.result = meta;
        out.data = data;
        if (loadError) out.loadError = loadError;
    } else if (state === 'failed') {
        out.success = false;
        out.error = job.failedReason;
    } else {
        out.success = true;
    }

    return out;
}

module.exports = {
    QUEUE_NAME,
    JOB_DATA_KEY_PREFIX,
    isQueueEnabled,
    getQueue,
    addGenerateDataJob,
    getJobById,
    buildJobStatusResponse
};

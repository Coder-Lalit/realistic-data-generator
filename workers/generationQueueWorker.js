#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const mongoose = require('mongoose');
const { generateRealisticData } = require('../lib/dataGenerator');
const GeneratedData = require('../lib/generatedDataModel');
const { QUEUE_NAME, JOB_DATA_KEY_PREFIX } = require('../lib/jobQueue');

const REDIS_MAX_JOB_RESULT_BYTES = Math.max(
    1024,
    parseInt(process.env.REDIS_MAX_JOB_RESULT_BYTES || String(8 * 1024 * 1024), 10) || 8 * 1024 * 1024
);
const JOB_RESULT_TTL_SEC = Math.max(60, parseInt(process.env.JOB_RESULT_TTL_SEC || '86400', 10) || 86400);

if (!process.env.REDIS_URL) {
    console.error('generationQueueWorker: REDIS_URL is required');
    process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

let storeRedis;
function getStoreRedis() {
    if (!storeRedis) {
        storeRedis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    }
    return storeRedis;
}

async function saveJobOutput(job, data, requestParams) {
    const sessionId = `job_${job.id}`;

    if (mongoose.connection.readyState === 1) {
        await GeneratedData.create({
            sessionId,
            requestParams: { ...requestParams, jobId: String(job.id), queuedJob: true },
            data
        });
        return { sessionId, recordCount: data.length, storage: 'mongo' };
    }

    const r = getStoreRedis();
    const payload = JSON.stringify({ data });
    const bytes = Buffer.byteLength(payload, 'utf8');
    if (bytes > REDIS_MAX_JOB_RESULT_BYTES) {
        throw new Error(
            `Generated JSON is ${bytes} bytes (max ${REDIS_MAX_JOB_RESULT_BYTES} for Redis). Set MONGODB_URI so job results are stored in MongoDB.`
        );
    }
    await r.setex(`${JOB_DATA_KEY_PREFIX}${job.id}`, JOB_RESULT_TTL_SEC, payload);
    return { sessionId, recordCount: data.length, storage: 'redis' };
}

async function start() {
    if (process.env.MONGODB_URI) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('generationQueueWorker: MongoDB connected');
    } else {
        console.log('generationQueueWorker: MONGODB_URI not set — job results will use Redis (size limited)');
    }

    const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const {
                numFields,
                numObjects,
                numNesting,
                numRecords,
                nestedFields,
                excludeEmoji,
                storeIt
            } = job.data;

            const data = generateRealisticData(
                numFields,
                numObjects,
                numNesting,
                numRecords,
                nestedFields,
                excludeEmoji === true
            );

            const requestParams = {
                numFields,
                numObjects,
                numNesting,
                numRecords,
                nestedFields,
                storeIt,
                excludeEmoji
            };

            return saveJobOutput(job, data, requestParams);
        },
        { connection }
    );

    worker.on('completed', (job) => {
        console.log(`generationQueueWorker: completed job ${job.id}`);
    });

    worker.on('failed', (job, err) => {
        console.error(`generationQueueWorker: failed job ${job?.id}`, err?.message || err);
    });

    console.log(`generationQueueWorker: listening on queue "${QUEUE_NAME}"`);
}

start().catch((err) => {
    console.error('generationQueueWorker: fatal', err);
    process.exit(1);
});

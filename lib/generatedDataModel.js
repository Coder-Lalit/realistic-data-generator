const mongoose = require('mongoose');

const GeneratedDataSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    requestParams: {
        numFields: Number,
        numObjects: Number,
        numNesting: Number,
        numRecords: Number,
        nestedFields: Number,
        totalRecords: Number,
        recordsPerPage: Number,
        storeIt: Boolean,
        excludeEmoji: Boolean,
        jobId: String,
        queuedJob: Boolean
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 24 * 60 * 60
    }
});

module.exports = mongoose.models.GeneratedData || mongoose.model('GeneratedData', GeneratedDataSchema);

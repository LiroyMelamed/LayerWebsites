'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const visual = require('./visual');
visual.extractPdfPages(Buffer.from(workerData.pdf)).then(pages => {
    const value = workerData.model ? visual.buildAuthoringMap(workerData.model, pages) : pages;
    parentPort.postMessage({ ok: true, value });
}).catch(
    error => parentPort.postMessage({ ok: false, code: /^WORD_AUTHORING_[A-Z_]+$/.test(error.code || '') ? error.code : 'WORD_AUTHORING_EXTRACTION_FAILED' }));

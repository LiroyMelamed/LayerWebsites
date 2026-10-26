'use strict';
// Only the production Worker/admission boundary is simulated. No PDF parser,
// converter, HTTP socket, database or remote process is started by these cases.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const { wordRouteError } = require('../routes/signingWordRoutes');

function fixture(t) {
    const workers = []; let constructorFailure = false;
    class Worker extends EventEmitter {
        constructor(filename, options) {
            super();
            if (constructorFailure) { constructorFailure = false; throw new Error('simulated structured clone failure'); }
            assert.ok(filename.endsWith('/pdfWorker.cjs'));
            assert.deepEqual(options.resourceLimits, { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 });
            this.terminated = false; this.cleanup = Promise.resolve(); workers.push(this);
        }
        async terminate() { this.terminated = true; await this.cleanup; return 1; }
    }
    const id = require.resolve('../lib/wordTemplates/visual');
    const originalModule = require.cache[id]; const load = Module._load;
    delete require.cache[id];
    try {
        Module._load = function(request, parent, isMain) {
            return request === 'node:worker_threads' ? { Worker } : load.call(this, request, parent, isMain);
        };
        const visual = require(id);
        t.after(() => { delete require.cache[id]; if (originalModule) require.cache[id] = originalModule; });
        return { visual, workers, failConstructor() { constructorFailure = true; } };
    } finally { Module._load = load; }
}
const bytes = Buffer.from('%PDF-synthetic-admission-boundary');
const rejectCode = code => error => { assert.equal(error.code, code); return true; };
const succeed = (f, value = 'mapped') => { f.workers.at(-1).emit('message', { ok: true, value }); };

test('one mapping worker per process rejects concurrent extraction and retains admission through cleanup', async t => {
    const f = fixture(t);
    const first = f.visual.buildAuthoringMapBounded({ version: 1 }, bytes);
    await assert.rejects(f.visual.extractPdfPagesBounded(bytes), error => {
        assert.equal(error.code, 'WORD_AUTHORING_BUSY');
        assert.equal(wordRouteError(error).httpStatus, 503); return true;
    });
    assert.equal(f.workers.length, 1);
    let finishCleanup;
    f.workers[0].cleanup = new Promise(resolve => { finishCleanup = resolve; });
    succeed(f);
    await Promise.resolve();
    await assert.rejects(f.visual.buildAuthoringMapBounded({}, bytes), rejectCode('WORD_AUTHORING_BUSY'));
    assert.equal(f.workers[0].terminated, true);
    finishCleanup(); assert.equal(await first, 'mapped');
    const next = f.visual.extractPdfPagesBounded(bytes); succeed(f, ['page']); assert.deepEqual(await next, ['page']);
    assert.equal(f.workers.length, 2);
});

test('worker reported error, runtime error and constructor failure each release admission after cleanup', async t => {
    const f = fixture(t);
    for (const kind of ['reported', 'runtime', 'constructor']) {
        if (kind === 'constructor') f.failConstructor();
        const pending = f.visual.buildAuthoringMapBounded({}, bytes);
        if (kind === 'reported') f.workers.at(-1).emit('message', { ok: false, code: 'WORD_AUTHORING_INVALID_MODEL' });
        if (kind === 'runtime') f.workers.at(-1).emit('error', new Error('simulated runtime error'));
        await assert.rejects(pending, rejectCode(kind === 'reported' ? 'WORD_AUTHORING_INVALID_MODEL' : 'WORD_AUTHORING_EXTRACTION_FAILED'));
        const next = f.visual.buildAuthoringMapBounded({}, bytes); succeed(f); assert.equal(await next, 'mapped');
    }
    assert.ok(f.workers.every(worker => worker.terminated));
});

test('30-second worker deadline terminates the owned worker and then releases admission', async t => {
    const f = fixture(t);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const pending = f.visual.buildAuthoringMapBounded({}, bytes);
    const rejected = assert.rejects(pending, rejectCode('WORD_AUTHORING_EXTRACTION_TIMEOUT'));
    t.mock.timers.tick(29999);
    await assert.rejects(f.visual.buildAuthoringMapBounded({}, bytes), rejectCode('WORD_AUTHORING_BUSY'));
    t.mock.timers.tick(1); await rejected;
    assert.equal(f.workers[0].terminated, true);
    const next = f.visual.buildAuthoringMapBounded({}, bytes); succeed(f); assert.equal(await next, 'mapped');
});

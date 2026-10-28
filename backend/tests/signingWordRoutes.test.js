'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createRouter = require('../routes/signingWordRoutes');
const { WordTemplateError } = require('../lib/wordTemplates/errors');

function harness({ authorize, result, failure } = {}) {
    const routes = []; const calls = [];
    const scope = { contextId: 'context-from-auth', userId: 7, send: true };
    const storage = {}; const pool = {}; const convert = () => {};
    const service = Object.fromEntries(['list', 'importSource', 'load', 'save', 'archive', 'preview', 'previewInfo', 'previewPdf'].map(name => [name,
        async (...args) => { calls.push({ name, args }); if (failure) throw failure; return result || { id: 'private', bytes: Buffer.from('%PDF-fixture') }; }]));
    createRouter({ pool, service, storage, convertDocxToPdf: convert,
        actorScope: async (db, req, action) => { assert.equal(db, pool); assert.equal(action, 'upload'); if (authorize === false) throw new Error('denied'); return scope; },
        Router: () => Object.fromEntries(['get', 'post', 'put'].map(method => [method, (path, action) => routes.push({ method, path, action })])) });
    async function invoke(method, path, body = {}, header = 'request-key') {
        const headers = {}; let response; let error; let status = 200;
        const req = { body, params: { id: 'private-id' }, get: name => name === 'Idempotency-Key' ? header : undefined };
        const res = { set: values => { Object.assign(headers, values); return res; }, status: code => { status = code; return res; },
            json: value => { response = value; return res; }, send: value => { response = value; return res; } };
        await routes.find(route => route.method === method && route.path === path).action(req, res, value => { error = value; });
        return { response, error, headers, status };
    }
    return { routes, calls, scope, pool, storage, convert, invoke };
}

test('every Word route resolves signing.upload scope before service access and disables caching', async () => {
    for (const [method, path, name] of [['get', '/', 'list'], ['post', '/', 'importSource'], ['get', '/:id', 'load'],
        ['put', '/:id', 'save'], ['post', '/:id/archive', 'archive'], ['post', '/:id/previews', 'preview'],
        ['get', '/previews/:id', 'previewInfo'], ['get', '/previews/:id/pdf', 'previewPdf']]) {
        const h = harness(); const body = { contextId: 'forged', createdBy: 88, userId: 99 };
        const result = await h.invoke(method, path, body);
        assert.equal(result.error, undefined); assert.equal(h.calls[0].name, name);
        assert.equal(h.calls[0].args[1], h.scope); assert.equal(result.headers['Cache-Control'], 'private, no-store');
        assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    }
});
test('failed authorization never reaches storage or the materialization service', async () => {
    const h = harness({ authorize: false }); const result = await h.invoke('post', '/');
    assert.equal(result.error.message, 'denied'); assert.equal(h.calls.length, 0);
});
test('the HTTP idempotency header overrides any forged body key', async () => {
    const h = harness(); const result = await h.invoke('post', '/:id/previews', { idempotencyKey: 'body', expectedVersion: 4 });
    assert.equal(result.status, 201); const call = h.calls[0];
    assert.equal(call.args[3].idempotencyKey, 'request-key'); assert.equal(call.args[3].expectedVersion, 4);
    assert.equal(call.args[4].storage, h.storage); assert.equal(call.args[4].convertDocxToPdf, h.convert);
});
test('protected PDF response uses fixed safe disposition rather than customer names or public URLs', async () => {
    const bytes = Buffer.from('%PDF-fixture'); const h = harness({ result: { bytes, name: 'private/name\r\nHeader' } });
    const result = await h.invoke('get', '/previews/:id/pdf');
    assert.equal(result.response, bytes); assert.equal(result.headers['Content-Type'], 'application/pdf');
    assert.equal(result.headers['Content-Disposition'], 'inline; filename="document.pdf"');
});
test('converter operational failures have accurate safe HTTP status and no source/process details', async () => {
    for (const [code, status] of [['WORD_CONVERSION_NOT_CONFIGURED', 503], ['WORD_CONVERSION_BUSY', 503],
        ['WORD_CONVERSION_TIMEOUT', 504], ['WORD_CONVERSION_FAILED', 500], ['WORD_CONVERSION_INVALID_DOCX', 400], ['INVALID_SELECTION_RANGE', 422]]) {
        const failure = new WordTemplateError(code); failure.details = { text: 'private-fixture', path: '/private/location' };
        const result = await harness({ failure }).invoke('post', '/:id/previews');
        assert.equal(result.error.errorCode, code); assert.equal(result.error.httpStatus, status);
        assert.equal(result.error.extras.messageKey, 'signingWord.requestFailed');
        assert.equal(result.error.meta, undefined); assert.ok(!JSON.stringify(result.error).includes('private-fixture'));
    }
});

test('private upload reads reject oversized, truncated or growing objects before import', async () => {
    const Module = require('node:module');
    const originalLoad = Module._load;
    class HeadObjectCommand { constructor(input) { this.input = input; } }
    class GetObjectCommand { constructor(input) { this.input = input; } }
    let size; let chunks; let reads; let destroyed;
    const r2 = { send: async command => {
        assert.equal(command.input.Bucket, 'test-private');
        assert.equal(command.input.Key, 'private/upload');
        if (command instanceof HeadObjectCommand) return { ContentLength: size };
        reads += 1;
        const body = { async *[Symbol.asyncIterator]() { yield* chunks; }, destroy() { destroyed = true; } };
        return { Body: body };
    } };
    let storage;
    try {
        Module._load = function (request, parent, isMain) {
            if (request === '@aws-sdk/client-s3') return { HeadObjectCommand, GetObjectCommand };
            if (request === '../utils/r2') return { r2, BUCKET: 'test-private' };
            if (request === '../services/signingV2/runtime') return { objectStorage: () => ({}) };
            return originalLoad.call(this, request, parent, isMain);
        };
        storage = createRouter.createWordStorage();
    } finally { Module._load = originalLoad; }
    size = 21; reads = 0;
    await assert.rejects(storage.readUpload('private/upload', 20), error => error.httpStatus === 413);
    assert.equal(reads, 0);
    size = 4; chunks = [Buffer.from('ab')];
    await assert.rejects(storage.readUpload('private/upload', 20), error => error.errorCode === 'WORD_SOURCE_CHANGED');
    size = 2; chunks = [Buffer.from('abc')]; destroyed = false;
    await assert.rejects(storage.readUpload('private/upload', 20), error => error.httpStatus === 413);
    assert.equal(destroyed, true);
    size = 4; chunks = [Buffer.from('ab'), Buffer.from('cd')];
    assert.equal((await storage.readUpload('private/upload', 20)).toString(), 'abcd');
});

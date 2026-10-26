'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createRouter = require('../routes/signingWordRoutes');
const { WordTemplateError } = require('../lib/wordTemplates/errors');

function harness({ authorize, result, failure, bridgeAsFunction = false } = {}) {
    const routes = []; const calls = [];
    const scope = { contextId: 'context-from-auth', userId: 7, send: true };
    const storage = {}; const pool = {}; const convert = () => {};
    const service = Object.fromEntries(['list', 'importSource', 'load', 'save', 'archive', 'preview', 'previewInfo', 'previewPdf',
        'authoringRender', 'authoringInfo', 'authoringPdf', 'authoringSelection'].map(name => [name,
        async (...args) => { calls.push({ name, args }); if (failure) throw failure; return result || { id: 'private', bytes: Buffer.from('%PDF-fixture') }; }]));
    service.fieldCatalog = () => { calls.push({ name: 'fieldCatalog', args: [] }); return { fields: [] }; };
    const createDraft = async (...args) => { calls.push({ name: 'createDraft', args }); if (failure) throw failure; return result || { version: { id: 'native-version' }, source: {}, origin: {} }; };
    createRouter({ pool, service, storage, convertDocxToPdf: convert, signingBridge: bridgeAsFunction ? createDraft : { createDraft },
        actorScope: async (db, req, action) => { assert.equal(db, pool); assert.equal(action, 'upload'); if (authorize === false) throw new Error('denied'); return scope; },
        Router: () => Object.fromEntries(['get', 'post', 'put'].map(method => [method, (path, action) => routes.push({ method, path, action })])) });
    async function invoke(method, path, body = {}, header = 'request-key') {
        const headers = {}; let response; let error; let status = 200;
        const req = { body, params: { id: 'private-id', renderId: 'private-render-id' }, get: name => name === 'Idempotency-Key' ? header : undefined };
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
        ['get', '/previews/:id', 'previewInfo'], ['get', '/previews/:id/pdf', 'previewPdf'],
        ['get', '/authoring-renders/:id', 'authoringInfo'], ['get', '/authoring-renders/:id/pdf', 'authoringPdf'],
        ['post', '/:id/authoring-renders', 'authoringRender'], ['post', '/:id/authoring-renders/:renderId/selections', 'authoringSelection'],
        ['post', '/previews/:id/native-draft', 'createDraft']]) {
        const h = harness(); const body = { contextId: 'forged', createdBy: 88, userId: 99 };
        const result = await h.invoke(method, path, body);
        assert.equal(result.error, undefined); assert.equal(h.calls[0].name, name);
        assert.equal(h.calls[0].args[1], h.scope); assert.equal(result.headers['Cache-Control'], 'private, no-store');
        assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    }
});
test('failed authorization never reaches storage or the materialization service', async () => {
    for (const route of harness().routes) {
        const h = harness({ authorize: false }); const result = await h.invoke(route.method, route.path);
        assert.equal(result.error.message, 'denied'); assert.equal(h.calls.length, 0);
    }
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
    const source = await h.invoke('get', '/authoring-renders/:id/pdf');
    assert.equal(source.response, bytes); assert.equal(source.headers['Content-Type'], 'application/pdf');
    assert.equal(source.headers['Content-Disposition'], 'inline; filename="word-source.pdf"');
});
test('converter operational failures have accurate safe HTTP status and no source/process details', async () => {
    for (const [code, status] of [['WORD_CONVERSION_NOT_CONFIGURED', 503], ['WORD_CONVERSION_BUSY', 503],
        ['WORD_CONVERSION_TIMEOUT', 504], ['WORD_CONVERSION_FAILED', 500], ['WORD_CONVERSION_INVALID_DOCX', 400], ['INVALID_SELECTION_RANGE', 422],
        ['WORD_AUTHORING_EXTRACTION_TIMEOUT', 504], ['WORD_AUTHORING_EXTRACTION_FAILED', 500]]) {
        const failure = new WordTemplateError(code); failure.details = { text: 'private-fixture', path: '/private/location' };
        const result = await harness({ failure }).invoke('post', '/:id/previews');
        assert.equal(result.error.errorCode, code); assert.equal(result.error.httpStatus, status);
        assert.equal(result.error.extras.messageKey, 'signingWord.requestFailed');
        assert.equal(result.error.meta, undefined); assert.ok(!JSON.stringify(result.error).includes('private-fixture'));
    }
});

test('authoring routes keep exact private source/render/body bindings and fixed route precedence', async () => {
    const h = harness();
    const body = { expectedVersion: 3, sourceHash: 'a'.repeat(64), mapHash: 'b'.repeat(64), selector: { kind: 'insert', start: { itemId: 'p1_i4', offset: 5 }, affinity: 'before' } };
    const created = await h.invoke('post', '/:id/authoring-renders', body);
    assert.equal(created.status, 201); assert.equal(created.response.authoring.id, 'private');
    assert.deepEqual(h.calls.at(-1).args, [h.pool, h.scope, 'private-id', body, { storage: h.storage, convertDocxToPdf: h.convert }]);
    const selected = await h.invoke('post', '/:id/authoring-renders/:renderId/selections', body);
    assert.equal(selected.response.selection.id, 'private');
    assert.deepEqual(h.calls.at(-1).args, [h.pool, h.scope, 'private-id', 'private-render-id', body, { storage: h.storage }]);
    const catalog = await h.invoke('get', '/catalog'); assert.deepEqual(catalog.response, { catalog: { fields: [] } });
    const index = value => h.routes.findIndex(route => route.method === 'get' && route.path === value);
    assert.ok(index('/catalog') < index('/:id')); assert.ok(index('/authoring-renders/:id') < index('/:id'));
    assert.ok(index('/previews/:id') < index('/:id'));
});

test('native draft bridge is injectable without provider imports and header overrides a forged body key', async () => {
    for (const bridgeAsFunction of [false, true]) {
        const h = harness({ bridgeAsFunction });
        const result = await h.invoke('post', '/previews/:id/native-draft', { expectedPdfHash: 'c'.repeat(64), locale: 'he', idempotencyKey: 'forged' }, 'actual-header');
        assert.equal(result.status, 201); assert.equal(result.response.version.id, 'native-version');
        assert.deepEqual(h.calls[0].args, [h.pool, h.scope, 'private-id',
            { expectedPdfHash: 'c'.repeat(64), locale: 'he', idempotencyKey: 'actual-header' }, { storage: h.storage }]);
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

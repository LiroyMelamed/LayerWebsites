'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateSigners } = require('../utils/signatureDetection');

// Execute just the actual route handler. Storage, transport and document parsing
// are bounded fixture functions; loading the application/.env/DB is unnecessary.
function handler(overrides = {}) {
    const file = fs.readFileSync(path.resolve(__dirname, '../controllers/signingFileController.js'), 'utf8');
    const start = file.indexOf('exports.detectSignatureSpots = async');
    const end = file.indexOf('// ─── Delete a signing file', start);
    let reads = 0;
    const exports = {};
    const bindings = {
        exports, console: { log() {}, error() {} }, validateSigners,
        isSigningDebugEnabled: () => false,
        fail: (_next, code, status) => ({ code, status }),
        MAX_SIGNING_PDF_BYTES: 1024, SIGNING_PDF_OP_TIMEOUT_MS: 500,
        headR2Object: async () => { reads++; return { ContentLength: 5 }; },
        GetObjectCommand: class {}, BUCKET: 'fixture-only',
        r2: { send: async () => ({ Body: {} }) },
        withTimeout: promise => promise, streamToBuffer: async () => Buffer.from('fixture'),
        detectSignatureSpotsDetailed: async () => ({ spots: [], warnings: [{ code: 'NO_TEXT_LAYER', pages: [1] }], noTextPages: [1], pagesChecked: 1 }),
        ...overrides,
    };
    vm.compileFunction(file.slice(start, end), Object.keys(bindings))(...Object.values(bindings));
    return { run: exports.detectSignatureSpots, reads: () => reads };
}
function request(body) { return { body, user: { UserId: 7 } }; }

test('malformed signer payload rejected before any object storage read', async () => {
    const h = handler();
    assert.deepEqual(await h.run(request({ fileKey: 'users/7/file.pdf', signers: {} }), {}, () => {}), { code: 'INVALID_SIGNERS', status: 422 });
    assert.equal(h.reads(), 0);
});
test('route retains caller storage ownership protection', async () => {
    const h = handler();
    assert.deepEqual(await h.run(request({ fileKey: 'users/99/file.pdf' }), {}, () => {}), { code: 'FORBIDDEN', status: 403 });
    assert.equal(h.reads(), 0);
});
test('route returns detailed scan/assignment diagnostics and correct empty signer count', async () => {
    const h = handler(); let result;
    await h.run(request({ fileKey: 'users/7/file.pdf' }), { json: value => { result = value; } }, () => {});
    assert.equal(result.signerCount, 0);
    assert.deepEqual(result.noTextPages, [1]);
    assert.deepEqual(result.warnings[0], { code: 'NO_TEXT_LAYER', pages: [1] });
    assert.equal(result.pagesChecked, 1);
});
for (const code of ['PDF_PAGE_FAILED', 'DETECTION_LIMIT', 'INVALID_PDF']) {
    test(`route fails clearly for ${code}, without partial spots`, async () => {
        const h = handler({ detectSignatureSpotsDetailed: async () => { throw Object.assign(new Error('fixture failure'), { code }); } });
        assert.deepEqual(await h.run(request({ fileKey: 'users/7/file.pdf' }), {}, () => {}), { code: 'SIGNATURE_DETECTION_FAILED', status: 422 });
    });
}

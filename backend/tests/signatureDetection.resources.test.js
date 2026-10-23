'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function controlledDetector(pdfjsFixture) {
    const filename = path.resolve(__dirname, '../utils/signatureDetection.js');
    const source = fs.readFileSync(filename, 'utf8').replace("const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');", 'const pdfjs = pdfjsFixture;');
    const module = { exports: {} };
    vm.compileFunction(source, ['require', 'module', 'exports', 'Buffer', 'pdfjsFixture'])(createRequire(filename), module, module.exports, Buffer, pdfjsFixture);
    return module.exports.detectSignatureSpotsDetailed;
}
test('a later page failure rejects the whole scan and cleans page/document resources', async () => {
    let pageCleaned = 0, documentDestroyed = 0;
    const page = { view: [0, 0, 600, 800], rotate: 0, getTextContent: async () => ({ items: [] }), cleanup: () => { pageCleaned++; } };
    const pdf = { numPages: 2, getPage: async n => { if (n === 2) throw new Error('damaged page'); return page; }, destroy: async () => { documentDestroyed++; } };
    const detect = controlledDetector({ getDocument: () => ({ promise: Promise.resolve(pdf) }) });
    await assert.rejects(detect(Buffer.from('fixture')), { code: 'PDF_PAGE_FAILED' });
    assert.equal(pageCleaned, 1);
    assert.equal(documentDestroyed, 1);
});
test('document loading failure destroys the loading task and returns a clear invalid-PDF error', async () => {
    let destroyed = 0;
    const detect = controlledDetector({ getDocument: () => ({ promise: Promise.reject(new Error('corrupt PDF')), destroy: async () => { destroyed++; } }) });
    await assert.rejects(detect(Buffer.from('fixture')), { code: 'INVALID_PDF' });
    assert.equal(destroyed, 1);
});
test('too many pages stops before inspection and destroys the document', async () => {
    let destroyed = 0;
    const detect = controlledDetector({ getDocument: () => ({ promise: Promise.resolve({ numPages: 201, destroy: async () => { destroyed++; } }) }) });
    await assert.rejects(detect(Buffer.from('fixture')), { code: 'DETECTION_LIMIT' });
    assert.equal(destroyed, 1);
});

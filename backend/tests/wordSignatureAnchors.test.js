'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { remapAnchor, locateAnchor } = require('../lib/wordTemplates/signatureAnchors');
const hash = text => createHash('sha256').update(text).digest('hex');
const originalText = 'שם ____ חתימה כאן';
const model = text => ({ version: 1, sourceHash: hash(text), parts: [{ name: 'word/document.xml', paragraphs: [{ id: 'p0',
    text, textHash: hash(text), editable: true, selectionRanges: [{ start: 0, end: text.length, editable: true }] }] }] });
const original = model(originalText);
const anchor = { sourceHash: original.sourceHash, part: 'word/document.xml', paragraphId: 'p0', paragraphHash: hash(originalText),
    start: 8, end: 17, selectedTextHash: hash(originalText.slice(8,17)) };
const placement = { offsetX: 0, offsetY: 24, width: 100, height: 40 };
const mapFor = (filled, current, pageNum = 2) => ({ sourceHash: filled.sourceHash, paragraphs: [{ ...filled.parts[0].paragraphs[0], part: 'word/document.xml' }],
    pages: [{ pageNum, width: 600, height: 800, rotation: 0, viewportTransform: [1,0,0,-1,0,800], items: [{ id: 'signature',
        text: 'חתימה כאן', width: 100, height: 12, transform: [12,0,0,12,50,500], segments: [{ part: current.part, paragraphId: current.paragraphId,
            sourceStart: current.start, sourceEnd: current.end, itemStart: 0, itemEnd: 9 }] }] }] });
test('long text changes remap signature anchors to the new rendered page, never the original coordinates', () => {
    const replacement = 'שם מלא ארוך במיוחד '.repeat(20);
    const filled = model('שם '+replacement+' חתימה כאן');
    const current = remapAnchor(original, filled, anchor, [{ part: anchor.part, paragraphId: 'p0', start: 3, end: 7, field: 'manual.name' }], { 'manual.name': replacement });
    assert.equal(current.start, 8 + replacement.length - 4);
    const rect = locateAnchor(mapFor(filled,current,3),current,placement);
    assert.equal(rect.pageNum,3); assert.equal(rect.width,100);
    assert.ok(rect.y > 400 && rect.y < 450);
});
test('overlapping edits, missing or duplicated PDF matches and out-of-page positions require correction', () => {
    assert.throws(() => remapAnchor(original,original,anchor,[{ part: anchor.part, paragraphId:'p0',start:8,end:17,field:'manual.changed' }],{}), { code:'WORD_SIGNATURE_ANCHOR_CHANGED' });
    const map = mapFor(original,anchor);
    const missing = structuredClone(map); missing.pages[0].items = [];
    assert.throws(() => locateAnchor(missing,anchor,placement), { code:'WORD_SIGNATURE_ANCHOR_UNRESOLVED' });
    const duplicate = structuredClone(map); duplicate.pages[0].items.push(structuredClone(duplicate.pages[0].items[0]));
    assert.throws(() => locateAnchor(duplicate,anchor,placement), { code:'WORD_SIGNATURE_ANCHOR_UNRESOLVED' });
    assert.throws(() => locateAnchor(map,anchor,{...placement,offsetY:5000}), { code:'WORD_SIGNATURE_ANCHOR_OUTSIDE_PAGE' });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const AdmZip = require('adm-zip');
const { importDocx, createBinding } = require('../lib/wordTemplates');
const { reviseText } = require('../lib/wordTemplates/reviseText');
const make = text => {
    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
    zip.addFile('_rels/.rels', Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
    zip.addFile('word/document.xml', Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`));
    zip.addFile('word/styles.xml', Buffer.from('<styles>unchanged</styles>'));
    return zip.toBuffer();
};
const binding = (model, start, end, extra = {}) => createBinding(model, { id: 'selected', field: 'manual.test', fieldLabel: 'בדיקה',
    part: 'word/document.xml', paragraphId: 'p0', start, end, ...extra });
test('scoped edits retain ZIP entries and run formatting; unchanged, stale or insertion-only edits fail closed', () => {
    const bytes = make('שם ____ מספר 00123 סוף'); const model = importDocx(bytes);
    const anchor = binding(model, 3, 7);
    const result = reviseText(bytes, { sourceHash: model.sourceHash, anchor, replacement: 'ערבית العربية ו־123' });
    assert.equal(result.model.parts[0].paragraphs[0].text, 'שם ערבית العربية ו־123 מספר 00123 סוף');
    const zip = new AdmZip(result.buffer), original = new AdmZip(bytes);
    for (const entry of original.getEntries().filter(e => e.entryName !== 'word/document.xml')) assert.deepEqual(zip.readFile(entry.entryName), original.readFile(entry.entryName));
    assert.match(zip.readAsText('word/document.xml'), /<w:rPr><w:b\/><\/w:rPr>/);
    assert.equal(importDocx(bytes).sourceHash, model.sourceHash);
    assert.throws(() => reviseText(bytes, { sourceHash: model.sourceHash, anchor, replacement: '____' }), { code: 'WORD_TEXT_UNCHANGED' });
    assert.throws(() => reviseText(bytes, { sourceHash: '0'.repeat(64), anchor, replacement: 'x' }), { code: 'STALE_DOCX_SOURCE' });
    assert.throws(() => reviseText(bytes, { sourceHash: model.sourceHash, anchor: { ...anchor, selectedTextHash: '0'.repeat(64) }, replacement: 'x' }), { code: 'STALE_OR_INVALID_BINDING' });
    assert.throws(() => reviseText(bytes, { sourceHash: model.sourceHash, anchor: { ...anchor, kind: 'insert' }, replacement: 'x' }), { code: 'UNSUPPORTED_SELECTION' });
});
test('a deleted range invalidates intersecting bindings, shifts following ones, and keeps preceding anchors', () => {
    const bytes = make('AAAA BBBB CCCC'); const model = importDocx(bytes);
    const bindings = [binding(model, 0, 4, { id: 'before' }), binding(model, 5, 9, { id: 'inside' }), binding(model, 10, 14, { id: 'after' })];
    const result = reviseText(bytes, { sourceHash: model.sourceHash, anchor: bindings[1], replacement: '', bindings });
    assert.deepEqual(result.invalidatedBindingIds, ['inside']);
    assert.deepEqual(result.bindings.map(b => [b.id, b.start, b.end]), [['before',0,4], ['after',6,10]]);
});
test('supplied rental source supports long scoped revision without changing other paragraphs or ZIP assets', {
    skip: !process.env.WORD_RENTAL_QA_FILE,
}, () => {
    const bytes = fs.readFileSync(process.env.WORD_RENTAL_QA_FILE);
    const { normalizePassiveLinks } = require('../lib/wordTemplates/passiveLinks');
    const normalized = normalizePassiveLinks(bytes); const model = importDocx(normalized);
    const part = model.parts.find(item => item.name === 'word/document.xml');
    const paragraph = part.paragraphs.find(p => p.editable && p.text.includes('8868'));
    assert.ok(paragraph, 'test rental must contain the supplied plot selection');
    const start = paragraph.text.indexOf('8868');
    const anchor = binding(model, start, start + 4, { paragraphId: paragraph.id });
    const result = reviseText(normalized, { sourceHash: model.sourceHash, anchor, replacement: '12345 תיאור בדיקה ארוך '.repeat(20) });
    let untouched = 0;
    for (const originalPart of model.parts) for (const p of originalPart.paragraphs) {
        if (originalPart.name === part.name && p.id === paragraph.id) continue;
        const actual = result.model.parts.find(item => item.name === originalPart.name).paragraphs.find(item => item.id === p.id);
        assert.equal(actual.text, p.text); untouched += 1;
    }
    assert.ok(untouched > 100);
    const before = new AdmZip(normalized), after = new AdmZip(result.buffer);
    for (const entry of before.getEntries().filter(e => e.entryName !== part.name)) assert.deepEqual(after.readFile(entry.entryName), before.readFile(entry.entryName));
});

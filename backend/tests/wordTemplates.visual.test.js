'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const core = require('../lib/wordTemplates');
const visual = require('../lib/wordTemplates/visual');
const { clientDocumentValues } = require('../lib/wordTemplates/clientValues');
const { catalog } = require('../lib/wordTemplates/catalog');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paragraph = text => `<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escape(text)}</w:t></w:r></w:p>`;
function fixture(body, extra = {}) {
    const zip = new AdmZip();
    const files = { '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`, 'docProps/core.xml': '<metadata>unchanged</metadata>', ...extra };
    for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text));
    return zip.toBuffer();
}
function pages(texts) {
    return [{ pageNum: 1, width: 600, height: 800, rotation: 0, userUnit: 1, viewBox: [0, 0, 600, 800], viewportTransform: [1, 0, 0, -1, 0, 800],
        items: texts.map((text, i) => ({ id: `p1_i${i}`, text, dir: 'rtl', transform: [12, 0, 0, 12, 50, 700 - i * 15], width: text.length * 6, height: 12, hasEOL: true })) }];
}
const point = (itemId, offset) => ({ itemId, offset });
const code = expected => error => { assert.equal(error.code || error.errorCode, expected); return true; };

test('general ordinary Hebrew source derives separate repeated-name anchors without prepared targets', () => {
    const text = 'שם הצדדים דנה כהן מול דנה כהן והמשך';
    const source = fixture(paragraph(text));
    const model = core.importDocx(source), map = visual.buildAuthoringMap(model, pages([text]));
    const starts = [...text.matchAll(/דנה כהן/gu)].map(m => m.index);
    const selections = starts.map(start => visual.resolveSelection(map, { kind: 'range', start: point('p1_i0', start), end: point('p1_i0', start + 7) }));
    assert.notEqual(selections[0].anchor.start, selections[1].anchor.start);
    assert.equal(selections[0].anchor.selectedTextHash, selections[1].anchor.selectedTextHash);
    const bindings = selections.map((s, i) => core.createBinding(model, { ...s.anchor, id: `binding${i}`, field: i ? 'role.other.fullName' : 'client.fullName' }));
    const result = core.materializeDocx(source, { sourceHash: model.sourceHash, bindings, values: { 'client.fullName': 'ראשון', 'role.other.fullName': 'שני' } });
    assert.equal(core.importDocx(result.buffer).parts[0].paragraphs[0].text, 'שם הצדדים ראשון מול שני והמשך');
    assert.equal(core.importDocx(source).parts[0].paragraphs[0].text, text);
});

test('forward and backward multi-item selection resolve the same contiguous source range', () => {
    const model = core.importDocx(fixture(paragraph('שם מלא דנה כהן בהמשך')));
    const map = visual.buildAuthoringMap(model, pages(['שם מלא ', 'דנה ', 'כהן בהמשך']));
    const forward = visual.resolveSelection(map, { kind: 'range', start: point('p1_i1', 0), end: point('p1_i2', 3) });
    const backward = visual.resolveSelection(map, { kind: 'range', start: point('p1_i2', 3), end: point('p1_i1', 0) });
    assert.deepEqual(backward.anchor, forward.anchor);
    assert.equal(forward.selectedText, 'דנה כהן');
});

test('table text is independently mappable, duplicate full paragraphs remain explicitly unsupported', () => {
    const source = fixture(`<w:tbl><w:tr><w:tc>${paragraph('שם לקוח דנה')}</w:tc><w:tc>${paragraph('שם בעלים אורי')}</w:tc></w:tr></w:tbl>${paragraph('אותו טקסט')}${paragraph('אותו טקסט')}`);
    const map = visual.buildAuthoringMap(core.importDocx(source), pages(['שם לקוח דנה', 'שם בעלים אורי', 'אותו טקסט', 'אותו טקסט']));
    assert.equal(visual.resolveSelection(map, { kind: 'range', start: point('p1_i0', 8), end: point('p1_i0', 11) }).selectedText, 'דנה');
    assert.equal(map.diagnostics.filter(d => d.reason === 'WORD_AUTHORING_AMBIGUOUS_TEXT').length, 2);
    assert.throws(() => visual.resolveSelection(map, { kind: 'range', start: point('p1_i2', 0), end: point('p1_i2', 4) }), code('WORD_AUTHORING_UNMAPPED_SELECTION'));
});

test('same compact text with different source whitespace is not assigned by guessing', () => {
    const map = visual.buildAuthoringMap(core.importDocx(fixture(paragraph('New York') + paragraph('NewYork'))), pages(['New York', 'NewYork']));
    assert.equal(map.pages[0].items.every(item => item.segments.length === 0), true);
    assert.equal(map.diagnostics.every(item => item.reason === 'WORD_AUTHORING_AMBIGUOUS_TEXT'), true);
});

test('long flowing body text can align across repeated known header/footer stories without making them editable', () => {
    const source = fixture(paragraph('תחילת משפט ארוך מאד והמשך משפט שממשיך לעמוד הבא'), {
        'word/header1.xml': `<w:hdr xmlns:w="${W}">${paragraph('כותרת משרד ייחודית')}</w:hdr>`,
        'word/footer1.xml': `<w:ftr xmlns:w="${W}">${paragraph('תחתית מסמך ייחודית')}</w:ftr>`,
    });
    const map = visual.buildAuthoringMap(core.importDocx(source), pages(['כותרת משרד ייחודית', 'תחילת משפט ארוך מאד ', 'תחתית מסמך ייחודית',
        'כותרת משרד ייחודית', 'והמשך משפט שממשיך לעמוד הבא', 'תחתית מסמך ייחודית']));
    assert.equal(map.pages[0].items[1].segments.length > 0, true);
    assert.equal(map.pages[0].items[4].segments.length > 0, true);
    assert.equal(map.diagnostics.filter(d => d.part !== 'word/document.xml').every(d => d.reason === 'WORD_AUTHORING_AMBIGUOUS_TEXT'), true);
});

test('fields/content controls are read-only and cross-paragraph selectors reject clearly', () => {
    const source = fixture(`<w:sdt>${paragraph('טקסט מוגן')}</w:sdt>${paragraph('פסקה ראשונה')}${paragraph('פסקה שנייה')}`);
    const map = visual.buildAuthoringMap(core.importDocx(source), pages(['טקסט מוגן', 'פסקה ראשונה', 'פסקה שנייה']));
    assert.throws(() => visual.resolveSelection(map, { kind: 'range', start: point('p1_i0', 0), end: point('p1_i0', 4) }), code('WORD_AUTHORING_UNMAPPED_SELECTION'));
    assert.throws(() => visual.resolveSelection(map, { kind: 'range', start: point('p1_i1', 0), end: point('p1_i2', 4) }), code('WORD_AUTHORING_CROSS_PARAGRAPH_SELECTION'));
});

test('mapped existing-text caret inserts actual DOCX content, preserving text and run properties', () => {
    const source = fixture(paragraph('שם: סוף'));
    const model = core.importDocx(source), map = visual.buildAuthoringMap(model, pages(['שם: סוף']));
    const selection = visual.resolveSelection(map, { kind: 'insert', start: point('p1_i0', 3), affinity: 'before' });
    const binding = core.createBinding(model, { ...selection.anchor, id: 'inserted', field: 'client.fullName' });
    const result = core.materializeDocx(source, { sourceHash: model.sourceHash, bindings: [binding], values: { 'client.fullName': ' דנה <כהן>' } });
    assert.equal(core.importDocx(result.buffer).parts[0].paragraphs[0].text, 'שם: דנה <כהן> סוף');
    const before = new AdmZip(source), after = new AdmZip(result.buffer);
    assert.deepEqual(after.readFile('docProps/core.xml'), before.readFile('docProps/core.xml'));
    assert.match(after.readAsText('word/document.xml'), /<w:rPr><w:b\/><\/w:rPr>/u);
    assert.equal(result.requiresFreshSigningGeometry, true);
});

test('true empty paragraphs/arbitrary blank locations and split surrogate insertions reject', () => {
    const model = core.importDocx(fixture(paragraph('') + paragraph('א😀ב')));
    assert.throws(() => core.createBinding(model, { id: 'empty', kind: 'insert', affinity: 'after', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 0, end: 0 }), code('INVALID_INSERTION_ANCHOR'));
    assert.throws(() => core.createBinding(model, { id: 'split', kind: 'insert', affinity: 'before', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p1', start: 2, end: 2 }), code('INVALID_INSERTION_ANCHOR'));
    const map = visual.buildAuthoringMap(model, pages(['א😀ב']));
    assert.throws(() => visual.resolveSelection(map, { kind: 'insert', start: { itemId: 'not-a-source-location', offset: 0 }, affinity: 'after' }), code('WORD_AUTHORING_INVALID_SELECTION'));
});

test('insertions at the same point or inside a replacement are rejected rather than reordered', () => {
    const source = fixture(paragraph('שם דנה כהן'));
    const model = core.importDocx(source);
    const first = core.createBinding(model, { id: 'one', kind: 'insert', affinity: 'before', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 4, end: 4 });
    const second = { ...first, id: 'two', field: 'client.companyName' };
    assert.throws(() => core.materializeDocx(source, { sourceHash: model.sourceHash, bindings: [first, second], values: { 'client.fullName': 'א', 'client.companyName': 'ב' } }), code('OVERLAPPING_BINDINGS'));
});

test('expanded catalog distinguishes manual names, stored enum codes and final signing phases', () => {
    const result = catalog([{ key: 'other', label: 'צד נוסף' }]);
    for (const key of ['client.firstName', 'client.lastName', 'office.name', 'case.address']) assert.equal(result.fields.find(f => f.key === key).resolver, 'manual');
    assert.equal(result.fields.find(f => f.key === 'client.identityType').type, 'code');
    assert.equal(result.fields.find(f => f.key === 'case.courtNumber').resolver, 'case');
    assert.equal(result.signingPhases.every(phase => !phase.available && phase.reason === 'FINAL_PDF_SIGNING_EDITOR'), true);
});

test('expanded formatter does not fabricate default profile enums, split names or country facts', () => {
    const missing = clientDocumentValues({ name: 'שם שלא מפצלים', client_profile: null }, { includeExtended: true });
    for (const key of ['client.partyType', 'client.identityType', 'client.identityCountry', 'client.companyRegistrationType', 'client.companyRegistrationCountry']) assert.equal(missing[key], '');
    assert.equal(Object.hasOwn(missing, 'client.firstName'), false);
    const person = clientDocumentValues({ client_profile: { identity: { number: '000123' }, organization: { registrationNumber: '000456' } } }, { includeExtended: true });
    assert.equal(person['client.identityNumber'], '000123'); assert.equal(person['client.companyNumber'], ''); assert.equal(person['client.identityType'], '');
    const org = clientDocumentValues({ dateofbirth: '2000-02-29', client_profile: { partyType: 'organization', organization: { registrationType: 'nonprofit', registrationCountry: 'IL' }, address: { line1: 'רחוב', postalCode: '00042' } } }, { includeExtended: true });
    assert.equal(org['client.birthDate'], '2000-02-29'); assert.equal(org['client.companyRegistrationType'], 'nonprofit'); assert.equal(org['client.address.postalCode'], '00042');
    assert.equal(clientDocumentValues({ dateofbirth: '2001-02-29' }, { includeExtended: true })['client.birthDate'], '');
});

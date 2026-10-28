import { itemTuple, selectorForAnchor, selectorForTextItem, selectorFromDom, sha256Bytes, tagVerifiedTextLayer, validateAuthoring, verifyPageItems, verifyPdfBlob } from './wordAuthoringSelection';

const { TextEncoder } = require('util');
const hash = value => require('crypto').createHash('sha256').update(value).digest('hex');
const source = { id: 'source-a', version: 3, sourceHash: 'a'.repeat(64), bindingsHash: 'b'.repeat(64) };
const item = (id, start) => ({ id, text: 'דנה ישראלי', dir: 'rtl', transform: [11, 0, 0, 11, 120, 700], width: 80, height: 11, hasEOL: true,
    segments: [{ itemStart: 0, itemEnd: 10, part: 'word/document.xml', paragraphId: 'p0', sourceStart: start, sourceEnd: start + 10, paragraphHash: 'c'.repeat(64) }] });
const model = () => ({ schemaVersion: 2, mapVersion: 1, offsetUnit: 'utf16', renderId: 'render-a', sourceId: source.id,
    sourceVersion: 3, renderSourceVersion: 3, sourceHash: source.sourceHash, bindingsHash: source.bindingsHash,
    pdfHash: 'd'.repeat(64), mapHash: 'e'.repeat(64), geometryTolerance: 0.01,
    textContentOptions: { disableNormalization: false, includeMarkedContent: false },
    pages: [{ pageNum: 1, width: 600, height: 800, rotation: 0, userUnit: 1, viewBox: [0, 0, 600, 800], viewportTransform: [1, 0, 0, -1, 0, 800],
        textContentHash: 'f'.repeat(64), items: [item('p1-i0', 0), item('p1-i1', 11)] }] });
function dom(data = model()) {
    const host = document.createElement('div'); const layer = document.createElement('div'); layer.className = 'textLayer'; host.append(layer);
    data.pages[0].items.forEach(value => {
        if (value.text) { const span = document.createElement('span'); span.setAttribute('role', 'presentation'); span.textContent = value.text; layer.append(span); }
        if (value.hasEOL) { const br = document.createElement('br'); br.setAttribute('role', 'presentation'); layer.append(br); }
    });
    document.body.append(host); tagVerifiedTextLayer(host, data.pages[0]);
    return { host, spans: Array.from(layer.querySelectorAll('span')) };
}
function selection(start, from, end = start, to = from) {
    const range = document.createRange(); range.setStart(start.firstChild, from); range.setEnd(end.firstChild, to);
    return { rangeCount: 1, getRangeAt: () => range };
}
beforeEach(() => Object.defineProperty(globalThis, 'crypto', { configurable: true, value: require('crypto').webcrypto }));
afterEach(() => { document.body.innerHTML = ''; });

test('render provenance binds exact source version, hashes, options and globally distinct item identities', () => {
    expect(validateAuthoring(model(), source).renderId).toBe('render-a');
    for (const change of [{ sourceVersion: 2 }, { sourceHash: '0'.repeat(64) }, { bindingsHash: '0'.repeat(64) },
        { offsetUnit: 'codepoints' }, { geometryTolerance: 0.1 }, { textContentOptions: { disableNormalization: true, includeMarkedContent: false } }])
        expect(() => validateAuthoring({ ...model(), ...change }, source)).toThrow();
    const duplicate = model(); duplicate.pages[0].items[1].id = duplicate.pages[0].items[0].id;
    expect(() => validateAuthoring(duplicate, source)).toThrow();
});

test('exact strings, occurrence order, direction and line endings cannot use numeric tolerance', () => {
    const page = model().pages[0]; const actual = page.items.map(({ text, ...rest }) => ({ ...rest, str: text }));
    expect(verifyPageItems(page, { items: actual }, 0.01)).toHaveLength(2);
    for (const change of [{ str: 'דנה  ישראלי' }, { dir: 'ltr' }, { hasEOL: false }, { width: 81 }])
        expect(() => verifyPageItems(page, { items: [{ ...actual[0], ...change }, actual[1]] }, 0.01)).toThrow();
    expect(() => verifyPageItems(page, { items: actual.slice(1) }, 0.01)).toThrow();
    expect(verifyPageItems(page, { items: [{ ...actual[0], width: 80.009 }, actual[1]] }, 0.01)).toHaveLength(2);
    expect(() => verifyPageItems(page, { items: [{ ...actual[0], width: 80.02 }, actual[1]] }, 0.01)).toThrow();
});

test('the exact tuple digest and authenticated PDF bytes are independently checked', async () => {
    const data = model(); const tupleBytes = new TextEncoder().encode(JSON.stringify(data.pages[0].items.map(itemTuple)));
    expect(await sha256Bytes(tupleBytes)).toBe(hash(tupleBytes));
    const blob = new Blob(['%PDF-source'], { type: 'application/pdf' });
    await expect(verifyPdfBlob(blob, hash('%PDF-source'))).resolves.toBe(blob);
    await expect(verifyPdfBlob(blob, hash('%PDF-different'))).rejects.toThrow();
    await expect(verifyPdfBlob(new Blob(['%PDF-source'], { type: 'text/html' }), hash('%PDF-source'))).rejects.toThrow();
});

test('repeated Hebrew occurrences use independent verified item IDs and UTF16 offsets; br is never an item', () => {
    const data = model(); const { host, spans } = dom(data);
    expect(selectorFromDom(host, selection(spans[1], 0, spans[1], 10), data)).toEqual({ kind: 'range', start: { itemId: 'p1-i1', offset: 0 }, end: { itemId: 'p1-i1', offset: 10 } });
    expect(selectorFromDom(host, selection(spans[0], 2, spans[1], 5), data)).toEqual({ kind: 'range', start: { itemId: 'p1-i0', offset: 2 }, end: { itemId: 'p1-i1', offset: 5 } });
    expect(host.querySelectorAll('br[data-word-item]')).toHaveLength(0);
});

test('backward RTL selection and wrapped spans use normalized Range endpoints instead of focus/anchor direction', () => {
    const data = model(); const { host, spans } = dom(data);
    const backward = { ...selection(spans[0], 3, spans[1], 7), anchorNode: spans[1].firstChild, anchorOffset: 7,
        focusNode: spans[0].firstChild, focusOffset: 3 };
    expect(selectorFromDom(host, backward, data).start).toEqual({ itemId: 'p1-i0', offset: 3 });
    expect(selectorFromDom(host, backward, data).end).toEqual({ itemId: 'p1-i1', offset: 7 });
});

test('insertion selects an explicit text boundary and affinity, never a PDF coordinate', () => {
    const data = model(); const { host, spans } = dom(data);
    expect(selectorFromDom(host, selection(spans[0], 2, spans[1], 8), data, 'insert', 'after')).toEqual({ kind: 'insert', start: { itemId: 'p1-i1', offset: 8 }, affinity: 'before' });
    expect(selectorFromDom(host, selection(spans[0], 2), data, 'insert', 'before')).toEqual({ kind: 'insert', start: { itemId: 'p1-i0', offset: 2 }, affinity: 'before' });
    expect(() => selectorFromDom(host, selection(spans[0], 2), data)).toThrow();
});

test.each(['before', 'after'])('an interior caret preserves its explicitly requested %s affinity in DOM and fallback', affinity => {
    const data = model(); const { host, spans } = dom(data);
    const expected = { kind: 'insert', start: { itemId: 'p1-i0', offset: 4 }, affinity };
    expect(selectorFromDom(host, selection(spans[0], 4), data, 'insert', affinity)).toEqual(expected);
    expect(selectorForTextItem(data, 'p1-i0', 4, 4, 'insert', affinity)).toEqual(expected);
});

test('collapsed caret normalization never guesses across unmapped gaps, ambiguous/atomic mappings or readonly text', () => {
    const check = (data, offset, affinity) => {
        const { host, spans } = dom(data);
        expect(() => selectorFromDom(host, selection(spans[0], offset), data, 'insert', affinity)).toThrow();
        expect(() => selectorForTextItem(data, 'p1-i0', offset, offset, 'insert', affinity)).toThrow();
    };
    const gap = model(); const segment = gap.pages[0].items[0].segments[0];
    gap.pages[0].items[0].segments = [{ ...segment, itemEnd: 3, sourceEnd: 3 }, { ...segment, itemStart: 7, sourceStart: 7 }];
    check(gap, 3, 'after'); check(gap, 7, 'before'); check(gap, 5, 'after');
    const ambiguous = model(); ambiguous.pages[0].items[0].segments.push({ ...ambiguous.pages[0].items[0].segments[0] });
    check(ambiguous, 10, 'after'); check(ambiguous, 4, 'before');
    const atomic = model(); atomic.pages[0].items[0].segments[0].sourceEnd = 11;
    check(atomic, 10, 'after');
    const readonly = model(); readonly.pages[0].items[0].readOnlyReason = 'unsupported'; check(readonly, 10, 'after');
    const unmapped = model(); unmapped.pages[0].items[0].segments = []; check(unmapped, 10, 'after');
    const empty = model(); empty.pages[0].items[0].text = ''; empty.pages[0].items[0].segments = [];
    expect(() => selectorForTextItem(empty, 'p1-i0', 0, 0, 'insert', 'after')).toThrow();
    const astral = model(); astral.pages[0].items[0].text = 'א😀ב'; astral.pages[0].items[0].segments[0].itemEnd = 4;
    check(astral, 2, 'after');
});

test('unknown, changed, unverified, readonly and surrogate-splitting selections fail closed', () => {
    const data = model(); const { host, spans } = dom(data);
    spans[0].textContent = 'Changed'; expect(() => selectorFromDom(host, selection(spans[0], 0, spans[0], 2), data)).toThrow();
    expect(() => selectorFromDom(document.createElement('div'), selection(spans[1], 0, spans[1], 2), data)).toThrow();
    delete spans[1].parentElement.dataset.wordVerified; expect(() => selectorFromDom(host, selection(spans[1], 0, spans[1], 2), data)).toThrow();
    const astral = model(); astral.pages[0].items[0].text = 'א😀ב'; astral.pages[0].items[0].segments[0].itemEnd = 4;
    const other = dom(astral); expect(() => selectorFromDom(other.host, selection(other.spans[0], 2, other.spans[0], 3), astral)).toThrow();
});

test('DOM tagging validates actual span text/count and excludes unmapped items', () => {
    const data = model(); data.pages[0].items[1].segments = [];
    const { host, spans } = dom(data); expect(spans[1]).not.toHaveAttribute('data-word-item');
    spans[0].textContent = 'different'; expect(() => tagVerifiedTextLayer(host, data.pages[0])).toThrow();
});

test('legacy canonical ranges upgrade only through a unique exact source segment', () => {
    const data = model(); const anchor = { part: 'word/document.xml', paragraphId: 'p0', start: 11, end: 21 };
    expect(selectorForAnchor(data, anchor)).toEqual({ kind: 'range', start: { itemId: 'p1-i1', offset: 0 }, end: { itemId: 'p1-i1', offset: 10 } });
    data.pages[0].items.push(item('duplicate-layout', 11)); expect(() => selectorForAnchor(data, anchor)).toThrow();
});

test.each([
    ['before', { itemId: 'p1-i0', offset: 10 }],
    ['after', { itemId: 'p1-i1', offset: 0 }],
])('a saved %s insertion reconstructs the correct side of a shared item boundary', (affinity, expected) => {
    const data = model(); data.pages[0].items[1].segments[0].sourceStart = 10; data.pages[0].items[1].segments[0].sourceEnd = 20;
    const savedCanonicalBinding = { kind: 'insert', affinity, part: 'word/document.xml', paragraphId: 'p0', start: 10, end: 10 };
    expect(selectorForAnchor(data, savedCanonicalBinding)).toEqual({ kind: 'insert', start: expected, affinity });
    // Range reconstruction keeps its existing left-start/right-end semantics.
    expect(selectorForAnchor(data, { part: savedCanonicalBinding.part, paragraphId: 'p0', start: 0, end: 20 })).toEqual({ kind: 'range',
        start: { itemId: 'p1-i0', offset: 0 }, end: { itemId: 'p1-i1', offset: 10 } });
});

test('supported paragraph-edge insertion affinities survive canonical save/reopen; unsupported outer sides fail closed', () => {
    const data = model(); data.pages[0].items[1].segments[0].sourceStart = 10; data.pages[0].items[1].segments[0].sourceEnd = 20;
    const anchor = { kind: 'insert', part: 'word/document.xml', paragraphId: 'p0' };
    expect(selectorForAnchor(data, { ...anchor, affinity: 'after', start: 0, end: 0 })).toEqual({ kind: 'insert', start: { itemId: 'p1-i0', offset: 0 }, affinity: 'after' });
    expect(selectorForAnchor(data, { ...anchor, affinity: 'before', start: 20, end: 20 })).toEqual({ kind: 'insert', start: { itemId: 'p1-i1', offset: 10 }, affinity: 'before' });
    expect(() => selectorForAnchor(data, { ...anchor, affinity: 'before', start: 0, end: 0 })).toThrow();
    expect(() => selectorForAnchor(data, { ...anchor, affinity: 'after', start: 20, end: 20 })).toThrow();
});

test.each([
    ['before', 'range at start', 0, 4, 0, 'after'],
    ['after', 'range at end', 60, 64, 64, 'before'],
    ['before', 'collapsed caret at start', 0, 0, 0, 'after'],
    ['after', 'collapsed caret at end', 64, 64, 64, 'before'],
])('UI %s a real %s survives actual backend resolution, DOCX fill and canonical reopen', (side, _description, from, to, offset, affinity) => {
    // Real production backend modules are read-only imports. No PDF worker,
    // converter, DB, storage, provider or application server is started.
    const core = require('../../../../../backend/lib/wordTemplates');
    const visual = require('../../../../../backend/lib/wordTemplates/visual');
    const { writeZip, readZip } = require('../../../../../backend/lib/wordTemplates/zip');
    const text = `HEAD${'x'.repeat(56)}FORM`;
    const contents = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    };
    const docx = writeZip(new Map(Object.entries(contents).map(([name, value]) => [name, { name, data: Buffer.from(value), changed: true }])));
    const imported = core.importDocx(docx);
    const page = model().pages[0];
    const data = visual.buildAuthoringMap(imported, [{ ...page, items: [{ ...page.items[0], id: 'p1_i0', text, width: 384 }] }]);
    const { host, spans } = dom(data);
    const selector = selectorFromDom(host, selection(spans[0], from, spans[0], to), data, 'insert', side);
    const fallback = selectorForTextItem(data, 'p1_i0', from, to, 'insert', side);
    expect(selector).toEqual({ kind: 'insert', start: { itemId: 'p1_i0', offset }, affinity });
    expect(fallback).toEqual(selector);
    const resolved = visual.resolveSelection(data, selector);
    expect(resolved).toMatchObject({ kind: 'insert', selectedText: '', anchor: { kind: 'insert', start: offset, end: offset, affinity } });
    const savedBinding = JSON.parse(JSON.stringify({ ...resolved.anchor, id: 'edge', field: 'client.firstName' }));
    const reopenedSelector = selectorForAnchor(data, savedBinding);
    expect(reopenedSelector).toEqual(selector);
    expect(visual.resolveSelection(data, reopenedSelector).anchor).toEqual(resolved.anchor);
    const filled = core.materializeDocx(docx, { sourceHash: imported.sourceHash, bindings: [savedBinding], values: { 'client.firstName': 'SYNTHETIC_EDGE' } });
    expect(core.importDocx(filled.buffer).parts[0].paragraphs[0].text).toBe(side === 'before' ? `SYNTHETIC_EDGE${text}` : `${text}SYNTHETIC_EDGE`);
    expect(readZip(filled.buffer).get('word/document.xml').data.toString()).toContain('<w:b/>');
    expect(() => selectorForTextItem(data, 'p1_i0', offset, offset, 'range')).toThrow();
    expect(selectorForTextItem(data, 'p1_i0', offset, offset, 'insert', affinity)).toEqual(selector);
    expect(() => visual.resolveSelection(data, { ...selector, affinity: side })).toThrow();
});

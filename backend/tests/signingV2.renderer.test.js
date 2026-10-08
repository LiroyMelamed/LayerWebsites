const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, degrees, rgb } = require('pdf-lib');
const { createDataRenderer } = require('../lib/signingV2/dataRenderer');
const { bytesHash } = require('../lib/signingV2/canonical');
const { SourceCache } = require('../lib/signingV2/sourceCache');

test('source cache shares only immutable verified source bytes and never mutable personal data', async () => {
    const cache = new SourceCache({ maxBytes: 16 });
    const bytes = Buffer.from('synthetic');
    const artifact = { id: 'source', bytes: bytes.length, content_sha256: bytesHash(bytes), object_key: 'qa/source' };
    let loads = 0;
    const load = async () => { loads += 1; return bytes; };
    const [first, second] = await Promise.all([cache.get('office1', artifact, load), cache.get('office1', artifact, load)]);
    first[0] = 0;
    assert.equal(second.toString(), 'synthetic'); assert.equal(loads, 1);
    await cache.get('office2', artifact, load); assert.equal(loads, 2);
    await assert.rejects(cache.get('office1', { ...artifact, content_sha256: 'x'.repeat(64) }, load), { errorCode: 'SOURCE_CHANGED' });
});

test('real Chromium text shaping/overflow and PDF geometry across Hebrew, Arabic, English and rotated crop boxes', { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const renderer = await createDataRenderer();
    t.after(() => renderer.close());
    const pdf = await PDFDocument.create();
    for (const angle of [0, 90, 180, 270]) {
        const page = pdf.addPage([595, 842]); page.setCropBox(20, 30, 550, 750); page.setRotation(degrees(angle));
        page.drawText(`SYNTHETIC SOURCE ${angle}`, { x: 60, y: 700, size: 12 });
        page.drawRectangle({ x: 70, y: 500, width: 170, height: 50, borderColor: rgb(0.1, 0.2, 0.4), borderWidth: 1 });
    }
    const sourceBytes = Buffer.from(await pdf.save()), expectedSourceHash = bytesHash(sourceBytes);
    const fields = [];
    for (let pageNum = 1; pageNum <= 4; pageNum += 1) {
        fields.push({ id: `he${pageNum}`, type: 'data', pageNum, x: 60, y: 170, width: 640, height: 70, fontSize: 24, overflow: 'block', align: 'start', value: 'שלום עולם - חבילת בדיקה 00123' });
        fields.push({ id: `ar${pageNum}`, type: 'data', pageNum, x: 60, y: 270, width: 640, height: 70, fontSize: 24, overflow: 'block', align: 'start', value: 'مرحبا بالعالم - حزمة اختبار 00456' });
        fields.push({ id: `en${pageNum}`, type: 'data', pageNum, x: 60, y: 370, width: 640, height: 70, fontSize: 24, overflow: 'block', align: 'start', value: 'Synthetic person A - 000789' });
    }
    const prepared = await renderer.render({ sourceBytes, expectedSourceHash, fields, locale: 'he' });
    const reopened = await PDFDocument.load(prepared.bytes);
    assert.equal(reopened.getPageCount(), 4);
    reopened.getPages().forEach((page, index) => {
        assert.deepEqual(page.getCropBox(), pdf.getPage(index).getCropBox());
        assert.deepEqual(page.getMediaBox(), pdf.getPage(index).getMediaBox());
        assert.equal(page.getRotation().angle, pdf.getPage(index).getRotation().angle);
    });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const standardFontDataUrl = `${path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts')}/`;
    const loaded = await pdfjs.getDocument({ data: new Uint8Array(prepared.bytes), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
    const extracted = [];
    const positions = [];
    for (let index = 1; index <= 4; index += 1) {
        const page = await loaded.getPage(index), items = (await page.getTextContent()).items;
        const text = items.map(item => item.str).join(' ');
        const first = items.find(item => item.str === 'S' || item.str.startsWith('Synthetic'));
        assert.ok(first);
        const viewport = page.getViewport({ scale: 1 });
        const [x, y] = viewport.convertToViewportPoint(first.transform[4], first.transform[5]);
        const expectedX = 60 * viewport.width / 800;
        assert.ok(Math.abs(x - expectedX) < 0.01, `page ${index} text anchor deviated by ${x - expectedX}pt`);
        positions.push({ page: index, x, y, expectedX, deviationPt: Math.abs(x - expectedX),
            normalizedFontHeight: first.height * 800 / viewport.width });
        extracted.push(text);
        assert.ok(!text.includes('\u0000'), 'embedded fonts retain Unicode text mappings');
        const arabicLetters = value => value.normalize('NFKC').replace(/[^\u0621-\u064a]/g, '').split('').sort().join('');
        assert.equal(arabicLetters(text), arabicLetters('مرحبا بالعالم - حزمة اختبار'));
        assert.match(text, /000789/); assert.match(text, /00123/); assert.match(text, /00456/);
        assert.match(text, /[\u0600-\u06ff]/); assert.match(text, /[\u0590-\u05ff]/);
        assert.match(text, /SYNTHETIC SOURCE/);
    }
    await loaded.destroy();
    await assert.rejects(renderer.render({ sourceBytes, expectedSourceHash,
        fields: [{ ...fields[0], width: 20, value: 'A long business clause must never become ellipsis' }], locale: 'en' }), { errorCode: 'TEXT_OVERFLOW' });
    const second = await renderer.render({ sourceBytes, expectedSourceHash, fields: [{ ...fields[2], value: 'Synthetic person B 009999' }], locale: 'en' });
    const secondPdf = await pdfjs.getDocument({ data: new Uint8Array(second.bytes), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
    const secondText = (await (await secondPdf.getPage(1)).getTextContent()).items.map(item => item.str).join(' ');
    assert.match(secondText, /009999/); assert.doesNotMatch(secondText, /000789|00123|00456/);
    await secondPdf.destroy();
    if (process.env.V2_QA_OUTPUT_DIR) {
        const directory = path.resolve(process.env.V2_QA_OUTPUT_DIR);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'source.pdf'), sourceBytes);
        await fs.writeFile(path.join(directory, 'multilingual-prepared.pdf'), prepared.bytes);
        await fs.writeFile(path.join(directory, 'second-person.pdf'), second.bytes);
        await fs.writeFile(path.join(directory, 'render-proof.json'), JSON.stringify({ sourceHash: expectedSourceHash,
            preparedHash: prepared.contentHash, rendererHash: prepared.rendererHash, secondHash: second.contentHash,
            geometry: prepared.geometry, extracted, positions, sourcePreserved: true, overflowBlocked: true, personalDataSeparated: true }, null, 2));
    }
});

test('reused font resources never retain another document value, page size or page count across40 successive PDFs',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const renderer = await createDataRenderer(); t.after(() => renderer.close());
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const standardFontDataUrl = `${path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts')}/`;
    const sources = [];
    for (const [width, height, pages] of [[595,842,1], [420,595,2]]) {
        const pdf = await PDFDocument.create();
        for (let n = 0; n < pages; n += 1) pdf.addPage([width,height]);
        const bytes = Buffer.from(await pdf.save()); sources.push({ bytes, hash: bytesHash(bytes), pages, width, height });
    }
    let previous = null;
    for (let index = 0; index < 40; index += 1) {
        const source = sources[index % 2], value = `CURRENT-${String(index).padStart(4,'0')}-ONLY`;
        const fields = [{ id: 'name', type: 'data', pageNum: source.pages, x: 30, y: 50, width: 640, height: 60, fontSize: 18, overflow: 'block', value }];
        const result = await renderer.render({ sourceBytes: source.bytes, expectedSourceHash: source.hash, fields, locale: ['he','ar','en'][index % 3] });
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(result.bytes), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
        assert.equal(pdf.numPages, source.pages);
        let text = '';
        for (let n = 1; n <= source.pages; n += 1) {
            const page = await pdf.getPage(n), viewport = page.getViewport({scale:1});
            assert.equal(viewport.width, source.width); assert.equal(viewport.height, source.height);
            text += (await page.getTextContent()).items.map(item => item.str).join('');
        }
        assert.ok(text.includes(value)); if (previous) assert.ok(!text.includes(previous));
        if (index === 20) await assert.rejects(renderer.render({ sourceBytes: source.bytes, expectedSourceHash: source.hash,
            fields: [{...fields[0], width:1}], locale:'en' }), { errorCode: 'TEXT_OVERFLOW' });
        previous = value; await pdf.destroy();
    }
});

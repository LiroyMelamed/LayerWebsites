'use strict';
// Explicit, local opt-in only. New multilingual flowing pagination scenarios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../lib/wordTemplates');
const { convertDocxToPdf } = require('../lib/wordTemplates/converter');
const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(ROOT, 'outputs/workflow-improvements-20261023/pdf-qa');
const EXECUTABLE = '/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function inspectPdf(bytes) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, stopAtErrors: true });
    const doc = await loading.promise;
    const pages = [];
    try {
        for (let number = 1; number <= doc.numPages; number += 1) {
            const page = await doc.getPage(number);
            const view = page.view;
            const items = (await page.getTextContent()).items.filter(x => typeof x.str === 'string');
            pages.push({ number, view, text: items.map(x => x.str).join('\n'),
                items: items.map(x => ({ text: x.str, x: x.transform[4], y: x.transform[5], width: x.width, height: x.height, direction: x.dir })) });
            page.cleanup();
        }
    } finally { await doc.destroy(); }
    return pages;
}
for (const language of ['he', 'ar', 'en']) test(`actual ${language} flowing Word preserves long values, table/header/footer and fresh geometry`, {
    skip: process.env.WORD_MULTILINGUAL_ACTUAL !== '1', timeout: 150000,
}, async t => {
    const run = process.env.WORD_MULTILINGUAL_RUN;
    assert.match(run || '', /^multilingual[0-9]+$/u);
    const runOut = path.join(OUT, run);
    await fs.mkdir(runOut, { recursive: true });
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `word-${language}-flow-`));
    t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
    const source = await fs.readFile(path.join(OUT, `${language}-flow-source.docx`));
    const fixture = JSON.parse(await fs.readFile(path.join(OUT, `${language}-values.json`), 'utf8'));
    const model = core.importDocx(source);
    const bindings = Object.entries(fixture.markers).map(([field, marker], index) => {
        const candidates = model.parts.flatMap(part => part.paragraphs.filter(p => p.text.includes(marker)).map(p => ({ part: part.name, paragraph: p })));
        assert.equal(candidates.length, 1, `${field} has one exact anchor`);
        const { part, paragraph } = candidates[0];
        assert.equal(paragraph.editable, true);
        const start = paragraph.text.indexOf(marker);
        return core.createBinding(model, { id: `b${index}`, part, paragraphId: paragraph.id, start, end: start + marker.length, field });
    });
    assert.equal(bindings.filter(b => b.part.startsWith('word/header')).length, 1);
    assert.equal(bindings.filter(b => b.part.startsWith('word/footer')).length, 1);
    const noIdentity = { ...fixture.values }; delete noIdentity['client.identityNumber'];
    assert.throws(() => core.materializeDocx(source, { sourceHash: model.sourceHash, bindings, values: noIdentity }), e => e.code === 'MISSING_REQUIRED_VALUE');
    const filled = core.materializeDocx(source, { sourceHash: model.sourceHash, bindings, values: fixture.values });
    assert.equal(filled.requiresPdfConversion, true);
    assert.equal(filled.requiresFreshSigningGeometry, true);
    assert.equal(filled.sourceHash, hash(source));
    assert.equal(filled.outputHash, hash(filled.buffer));
    const filledModel = core.importDocx(filled.buffer);
    const text = filledModel.parts.flatMap(part => part.paragraphs.map(p => p.text)).join('\n');
    for (const value of Object.values(fixture.values)) assert.ok(text.includes(value), 'full exact source value retained including leading zeros');
    for (const marker of Object.values(fixture.markers)) assert.ok(!text.includes(marker));
    assert.equal(hash(source), model.sourceHash, 'original source bytes remain unchanged');
    const timings = {};
    let started = performance.now();
    const originalPdf = await convertDocxToPdf(source, { executablePath: EXECUTABLE, tempRoot, timeoutMs: 60000, maxPages: 20 });
    timings.sourceMs = performance.now() - started;
    started = performance.now();
    const finalPdf = await convertDocxToPdf(filled.buffer, { executablePath: EXECUTABLE, tempRoot, timeoutMs: 60000, maxPages: 20 });
    timings.finalMs = performance.now() - started;
    assert.ok(finalPdf.pageCount > 1, 'real flowing multiple pages');
    assert.ok(finalPdf.pageCount >= originalPdf.pageCount, 'long text may expand pagination');
    assert.equal(finalPdf.requiresFreshSigningGeometry, true);
    assert.equal(finalPdf.sourceHash, filled.outputHash);
    assert.equal(finalPdf.outputHash, hash(finalPdf.buffer));
    assert.deepEqual(await fs.readdir(tempRoot), [], 'all converter temp jobs removed');
    // Retain produced artifacts even if a subsequent text/layout assertion fails.
    await fs.writeFile(path.join(runOut, `${language}-source.pdf`), originalPdf.buffer);
    await fs.writeFile(path.join(runOut, `${language}-final.pdf`), finalPdf.buffer);
    await fs.writeFile(path.join(runOut, `${language}-filled.docx`), filled.buffer);
    const pages = await inspectPdf(finalPdf.buffer);
    await fs.writeFile(path.join(runOut, `${language}-text-items.json`), JSON.stringify(pages, null, 2) + '\n');
    const allText = pages.map(p => p.text).join('\n');
    await fs.writeFile(path.join(runOut, `${language}-text.txt`), allText);
    const report = { language, bindings: bindings.length, boundParts: [...new Set(bindings.map(x => x.part))], sourceHash: model.sourceHash,
        filledHash: filled.outputHash, sourcePdfHash: originalPdf.outputHash, finalPdfHash: finalPdf.outputHash,
        sourcePages: originalPdf.pageCount, finalPages: finalPdf.pageCount, freshGeometryRequired: finalPdf.requiresFreshSigningGeometry,
        valuesHash: hash(Buffer.from(JSON.stringify(fixture.values))), timingsDiagnosticOnly: timings,
        limitations: 'Synthetic local core + actual bounded explicitly configured LibreOffice; PDF.js text and page geometry only, visual review separate. No browser, signing application, customer corpus, office fonts/production or performance readiness claim.' };
    await fs.writeFile(path.join(runOut, `${language}-artifact.json`), JSON.stringify(report, null, 2) + '\n');
    assert.equal(pages.length, finalPdf.pageCount);
    for (const exact of ['001234567', '005123456', '000042/2026', fixture.endSentinel]) assert.ok(allText.includes(exact), `PDF retains ${exact}`);
    const script = language === 'he' ? /[\u05d0-\u05ea]/u : language === 'ar' ? /[\u0620-\u064a]/u : /[A-Za-z]/u;
    for (const page of pages) {
        assert.ok(script.test(page.text), `page ${page.number} has ${language} text`);
        assert.ok(page.text.includes('000042/2026'), `bound footer exists on page ${page.number}`);
        for (const item of page.items.filter(x => x.text.trim())) {
            assert.ok(!item.text.includes('\ufffd') && !item.text.includes('\u25a1'), 'no replacement/tofu glyph text');
            assert.ok(item.x >= page.view[0] - 2 && item.x + item.width <= page.view[2] + 2, `horizontal bounds page ${page.number}: ${JSON.stringify(item)}`);
            assert.ok(item.y >= page.view[1] - 2 && item.y <= page.view[3] + 2, `vertical bounds page ${page.number}`);
        }
    }
});

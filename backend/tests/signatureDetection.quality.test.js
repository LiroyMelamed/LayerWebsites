'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { detectSignatureSpotsDetailed, assignSignersToSpots, validateSigners } = require('../utils/signatureDetection');
const { pageGeometryFromPdfLibPage, pdfBoxToVisualBox } = require('../lib/signingGeometry');

async function fixture(draw, { rotation = 0, crop = false, arabic = false } = {}) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const latin = await doc.embedFont(StandardFonts.Helvetica);
    const fontName = arabic ? 'NotoSansArabic-Regular.ttf' : 'NotoSansHebrew-Regular.ttf';
    const rtl = await doc.embedFont(fs.readFileSync(path.resolve(__dirname, '../assets/fonts', fontName)), { subset: false });
    const page = doc.addPage([600, 800]);
    page.setRotation(degrees(rotation));
    if (crop) page.setCropBox(20, 30, 560, 740);
    const text = (str, x, y, size = 12) => page.drawText(str, { x, y, size, font: /[^\x00-\x7f]/u.test(str) ? rtl : latin });
    const line = (x, y, width = 130) => page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 1 });
    await draw({ doc, page, text, line, latin });
    return { buffer: Buffer.from(await doc.save()), page };
}

for (const [label, arabic] of [['חתימת השוכר', false], ['Tenant signature', false], ['توقيع المستأجر', true]]) {
    test(`explicit multilingual signature cue finds vector baseline: ${label}`, async () => {
        const { buffer } = await fixture(({ text, line }) => { text(label, 180, 230); line(160, 200); }, { arabic });
        const result = await detectSignatureSpotsDetailed(buffer);
        assert.equal(result.spots.length, 1);
        assert.equal(result.spots[0].pdfAnchorY, 200);
        assert.equal(result.spots[0].source, 'vector-underline');
        assert.equal(result.spots[0].assignmentStatus, 'unassigned');
        assert.equal(Object.hasOwn(result.spots[0], 'signerIndex'), false);
        assert.equal(Object.hasOwn(result.spots[0], 'signerUserId'), false);
        assert.equal(result.pagesChecked, 1);
        assert.ok(result.warnings.some(w => w.code === 'REVIEW_REQUIRED'));
    });
}
for (const dy of [-22, 0, 22]) {
    test(`text underline with signature label at vertical offset ${dy}`, async () => {
        const { buffer } = await fixture(({ text }) => { text('Signature', dy === 0 ? 60 : 180, 200 + dy); text('____________________', 160, 200); });
        const { spots } = await detectSignatureSpotsDetailed(buffer);
        assert.equal(spots.length, 1);
        assert.equal(spots[0].pdfAnchorY, 200);
    });
}
test('Word combined label and underline text retains underline-local geometry', async () => {
    const { buffer } = await fixture(({ text }) => text('Signature: ____________________', 120, 200));
    const { spots } = await detectSignatureSpotsDetailed(buffer);
    assert.equal(spots.length, 1);
    assert.ok(spots[0].pdfAnchorX > 200, 'anchor belongs to the underline, not the beginning of the whole text item');
});
test('fragmented underscore characters merge into one signature baseline', async () => {
    const { buffer } = await fixture(({ text }) => {
        text('Signature', 60, 200);
        for (let i = 0; i < 16; i++) text('_', 160 + i * 6.7, 200);
    });
    const { spots } = await detectSignatureSpotsDetailed(buffer);
    assert.equal(spots.length, 1);
    assert.ok(Math.abs(spots[0].pdfAnchorX - 213) < 5);
});
test('name/date/ID/company blanks and distant signature paragraphs are not signatures', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        for (const [label, y] of [['Name', 200], ['Date', 300], ['ID number', 400], ['שם מלא', 500], ['תאריך', 600]]) {
            text(label, 60, y); line(160, y);
        }
        text('Signature', 60, 740); // not local to any blank
    });
    assert.equal((await detectSignatureSpotsDetailed(buffer)).spots.length, 0);
});
test('signature and date on one baseline do not produce a date signature', async () => {
    const { buffer } = await fixture(({ text, line }) => { text('Signature', 40, 200); line(110, 200); text('Date', 350, 200); line(390, 200); });
    const { spots } = await detectSignatureSpotsDetailed(buffer);
    assert.equal(spots.length, 1);
    assert.equal(spots[0].pdfAnchorX, 175);
});
test('two columns retain signer names by local full name, not rightmost row anchor', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        text('Signature', 70, 244); text('John Smith', 70, 224); line(50, 200);
        text('Signature', 380, 244); text('Jane Smith', 380, 224); line(360, 200);
    });
    const { spots } = await detectSignatureSpotsDetailed(buffer, [{ name: 'Jane Smith', userId: 20 }, { name: 'John Smith', userId: 10 }]);
    assert.equal(spots.length, 2);
    assert.deepEqual(spots.map(s => [s.signerName, s.signerUserId, s.assignmentStatus]), [['John Smith', 10, 'matched'], ['Jane Smith', 20, 'matched']]);
});
test('unknown and ambiguous labels remain unassigned, even with one selected signer', async () => {
    const { buffer } = await fixture(({ text, line }) => { text('Signature', 100, 230); line(80, 200); });
    const { spots } = await detectSignatureSpotsDetailed(buffer, [{ name: 'John Smith', userId: 10 }]);
    assert.equal(spots.length, 1);
    assert.equal(spots[0].assignmentStatus, 'unassigned');
    assert.equal(Object.hasOwn(spots[0], 'signerIndex'), false);
    const named = await fixture(({ text, line }) => { text('Signature', 100, 244); text('John Smith', 100, 224); line(80, 200); });
    const ambiguous = await detectSignatureSpotsDetailed(named.buffer, [{ name: 'John Smith', userId: 10 }, { name: 'John Smith', userId: 20 }]);
    assert.equal(ambiguous.spots[0].assignmentStatus, 'unassigned');
});
test('a first-name substring and a remote same-baseline full name are not assignments', () => {
    const spot = { pageNum: 1, x: 100, y: 100, width: 120, pdfX: 100, pdfWidth: 120, pdfAnchorY: 200 };
    const items = [{ pageNum: 1, str: 'John', x: 100, y: 220, width: 25, height: 12 }, { pageNum: 1, str: 'John Smith', x: 450, y: 200, width: 70, height: 12 }];
    assert.equal(assignSignersToSpots([spot], ['John Smith'], items)[0].assignmentStatus, 'unassigned');
});
test('split adjacent full-name fragments match without joining separate columns', () => {
    const spot = { pageNum: 1, pdfX: 100, pdfWidth: 120, pdfAnchorY: 200 };
    const items = [{ pageNum: 1, str: 'Jo', x: 110, y: 220, width: 11, height: 12 }, { pageNum: 1, str: 'hn', x: 121, y: 220, width: 11, height: 12 }, { pageNum: 1, str: 'Smith', x: 136, y: 220, width: 35, height: 12 }];
    const assigned = assignSignersToSpots([spot], ['John Smith'], items)[0];
    assert.equal(assigned.assignmentStatus, 'matched');
    assert.equal(assigned.signerIndex, 0);
});
for (const rotation of [0, 90, 180, 270]) for (const crop of [false, true]) {
    test(`detected PDF line uses canonical visual geometry: rotation=${rotation}, crop=${crop}`, async () => {
        const { buffer, page } = await fixture(({ text, line }) => { text('Signature', 180, 230); line(160, 200, 130); }, { rotation, crop });
        const { spots } = await detectSignatureSpotsDetailed(buffer);
        assert.equal(spots.length, 1);
        const expected = pdfBoxToVisualBox(pageGeometryFromPdfLibPage(page), { x: 160, y: 200, width: 130, height: 25 });
        for (const key of ['x', 'y', 'width', 'height']) assert.equal(spots[0][key], Math.round(expected[key]), key);
    });
}
test('textless scan/blank pages are reported, not presented as successful OCR', async () => {
    const { buffer } = await fixture(({ doc, text, line }) => { text('Signature', 180, 220); line(160, 200); doc.addPage([600, 800]); });
    const result = await detectSignatureSpotsDetailed(buffer);
    assert.equal(result.pagesChecked, 2);
    assert.deepEqual(result.noTextPages, [2]);
    assert.deepEqual(result.warnings.find(w => w.code === 'NO_TEXT_LAYER').pages, [2]);
});
test('invalid signer payloads fail before PDF parsing; no arbitrary assignment fallback', async () => {
    for (const value of [{ name: 'John' }, new Array(201).fill('John'), [{}], [{ name: 'John', userId: {} }], [{ name: 'x'.repeat(201) }]]) {
        assert.throws(() => validateSigners(value), { code: 'INVALID_SIGNERS' });
    }
    await assert.rejects(detectSignatureSpotsDetailed(Buffer.from('not a PDF'), [{}]), { code: 'INVALID_SIGNERS' });
    assert.equal(assignSignersToSpots([{ pageNum: 1 }], ['John Smith'])[0].assignmentStatus, 'unassigned');
});
test('malformed PDF fails clearly instead of emitting an empty partial success', async () => {
    await assert.rejects(detectSignatureSpotsDetailed(Buffer.from('not a PDF')));
});

test('signature negations and confirmation sentences do not propose a signature blank', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        for (const [label, y] of [['No signature required', 200], ['ללא חתימה', 300], ['By my signature I confirm receipt', 400]]) {
            text(label, 80, y + 20); line(70, y);
        }
    });
    assert.equal((await detectSignatureSpotsDetailed(buffer)).spots.length, 0);
});
for (const [name, arabic] of [['יוסי כהן', false], ['أحمد حسن', true]]) {
    test(`local full name assignment works in extracted RTL text: ${name}`, async () => {
        const { buffer } = await fixture(({ text, line }) => { text(arabic ? 'التوقيع' : 'חתימה', 180, 245); text(name, 180, 225); line(160, 200); }, { arabic });
        const { spots } = await detectSignatureSpotsDetailed(buffer, [{ name, userId: 10 }]);
        assert.equal(spots.length, 1);
        assert.equal(spots[0].signerName, name);
        assert.equal(spots[0].assignmentStatus, 'matched');
    });
}
test('vector signature baseline inside a translated/scaled embedded PDF form retains PDF coordinates', async () => {
    const source = await fixture(({ text, line }) => { text('Signature', 40, 200); line(160, 200); });
    const doc = await PDFDocument.create();
    const embedded = await doc.embedPdf(source.buffer);
    const page = doc.addPage([600, 800]);
    page.drawPage(embedded[0], { x: 40, y: 50, xScale: 0.5, yScale: 0.5 });
    const { spots } = await detectSignatureSpotsDetailed(Buffer.from(await doc.save()));
    assert.equal(spots.length, 1);
    assert.equal(spots[0].pdfAnchorY, 150);
    assert.equal(spots[0].pdfAnchorX, 152.5);
});
test('vector rectangle/table border is not assumed to be a signing baseline', async () => {
    const { buffer } = await fixture(({ text, page }) => {
        const { rgb } = require('pdf-lib');
        text('Signature', 180, 220);
        page.drawRectangle({ x: 160, y: 150, width: 130, height: 50, borderWidth: 1, borderColor: rgb(0, 0, 0), color: undefined });
    });
    assert.equal((await detectSignatureSpotsDetailed(buffer)).spots.length, 0);
});

test('side-by-side signers with the same first name match only the local full name', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        text('Signature', 70, 244); text('John Smith', 70, 224); line(50, 200);
        text('Signature', 380, 244); text('John Jones', 380, 224); line(360, 200);
    });
    const { spots } = await detectSignatureSpotsDetailed(buffer, [{ name: 'John Jones', userId: 20 }, { name: 'John Smith', userId: 10 }]);
    assert.deepEqual(spots.map(s => [s.signerName, s.signerUserId]), [['John Smith', 10], ['John Jones', 20]]);
});


function boxesOverlap(a, b) {
    return Math.min(a.pdfX + a.pdfWidth, b.pdfX + b.pdfWidth) > Math.max(a.pdfX, b.pdfX)
        && Math.min(a.pdfY + a.pdfHeight, b.pdfY + b.pdfHeight) > Math.max(a.pdfY, b.pdfY);
}
for (const rotation of [0, 90, 180, 270]) {
    test(`crowded same-column signature rows keep their own baseline and do not overlap: rotation=${rotation}`, async () => {
        const baselines = [200, 224.7, 249.4];
        const { buffer, page } = await fixture(({ text, line }) => {
            for (const y of baselines) { text('Signature', 35, y); line(120, y); }
        }, { rotation, crop: true });
        const { spots } = await detectSignatureSpotsDetailed(buffer);
        assert.equal(spots.length, 3);
        const sorted = spots.slice().sort((a, b) => a.pdfY - b.pdfY);
        assert.deepEqual(sorted.map(s => s.pdfAnchorY), baselines);
        for (let i = 0; i < sorted.length - 1; i++) {
            assert.ok(!boxesOverlap(sorted[i], sorted[i + 1]), 'proposals must not occupy neighboring signing rows');
            assert.ok(sorted[i].pdfY + sorted[i].pdfHeight <= sorted[i + 1].pdfY - 3.9, 'leave a visible gap before the next row');
        }
        assert.equal(sorted.at(-1).pdfHeight, 50, 'isolated top row keeps the incumbent height');
        for (const spot of spots) {
            assert.equal(spot.pdfY, spot.pdfAnchorY, 'PDF bottom remains on its detected underline');
            assert.ok(spot.pdfHeight >= 16);
            assert.equal(spot.assignmentStatus, 'unassigned');
            const expected = pdfBoxToVisualBox(pageGeometryFromPdfLibPage(page), { x: spot.pdfX, y: spot.pdfY, width: spot.pdfWidth, height: spot.pdfHeight });
            for (const key of ['x', 'y', 'width', 'height']) assert.equal(spot[key], Math.round(expected[key]), key);
        }
    });
}
test('crowded rows in separate columns do not shrink unrelated signature areas', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        text('Signature', 30, 200); line(110, 200);
        text('Signature', 350, 224.7); line(430, 224.7);
    });
    const { spots } = await detectSignatureSpotsDetailed(buffer);
    assert.equal(spots.length, 2);
    assert.ok(spots.every(spot => spot.pdfHeight === 50));
});
test('crowded space below printed text constrains height without covering the text', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        text('Signature', 30, 200); line(110, 200);
        text('Printed clause above the line', 120, 240, 20);
    });
    const { spots } = await detectSignatureSpotsDetailed(buffer);
    assert.equal(spots.length, 1);
    assert.ok(spots[0].pdfHeight >= 16 && spots[0].pdfHeight <= 33, 'allow the printed baseline, descender and gap');
    assert.equal(spots[0].pdfAnchorY, 200);
});
test('crowded signature rows with less than the minimum space omit the unsafe row and report it', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        for (const y of [200, 212]) { text('Signature', 30, y); line(110, y); }
    });
    const result = await detectSignatureSpotsDetailed(buffer);
    assert.equal(result.spots.length, 1);
    assert.equal(result.spots[0].pdfAnchorY, 212);
    assert.equal(result.crampedSignatureCount, 1);
    assert.deepEqual(result.warnings.find(w => w.code === 'INSUFFICIENT_SIGNATURE_SPACE'), { code: 'INSUFFICIENT_SIGNATURE_SPACE', count: 1 });
});
test('crowded printed text reports unsafe signature space rather than no signature cues', async () => {
    const { buffer } = await fixture(({ text, line }) => {
        text('Signature', 30, 200); line(110, 200);
        text('Printed text', 120, 215);
    });
    const result = await detectSignatureSpotsDetailed(buffer);
    assert.equal(result.spots.length, 0);
    assert.equal(result.crampedSignatureCount, 1);
    assert.ok(result.warnings.some(w => w.code === 'INSUFFICIENT_SIGNATURE_SPACE' && w.count === 1));
    assert.ok(!result.warnings.some(w => w.code === 'NO_SIGNATURE_CUES'));
});

test('crowded explicit signature caption above the line is reported when it leaves no safe minimum area', async () => {
    const { buffer } = await fixture(({ text, line }) => { text('Signature', 180, 220); line(160, 200); });
    const result = await detectSignatureSpotsDetailed(buffer);
    assert.equal(result.spots.length, 0);
    assert.equal(result.crampedSignatureCount, 1);
    assert.ok(result.warnings.some(w => w.code === 'INSUFFICIENT_SIGNATURE_SPACE'));
    assert.ok(!result.warnings.some(w => w.code === 'NO_SIGNATURE_CUES'));
});

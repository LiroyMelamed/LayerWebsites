'use strict';

/**
 * End-to-end check that auto-detection emits spots in the canonical visual
 * space, with placement derived from the detected underline rather than from
 * tuned offsets.
 *
 * The fixture is a 400x800pt page, so the visual scale is exactly 2 and the
 * expected coordinates are exact integers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { detectHebrewSignatureSpotsFromPdfBuffer } = require('../utils/signatureDetection');
const { BASE_RENDER_WIDTH } = require('../lib/signingGeometry');

const PAGE_WIDTH = 400;
const PAGE_HEIGHT = 800;
const SCALE = BASE_RENDER_WIDTH / PAGE_WIDTH; // exactly 2

const LINE_BASELINE_Y = 200;   // PDF user space
const UNDERLINE_X = 150;
const KEYWORD_X = 60;
const FONT_SIZE = 12;
const UNDERLINE_TEXT = '__________';

const HEBREW_FONT_PATH = path.resolve(__dirname, '../assets/fonts/NotoSansHebrew-Regular.ttf');

async function buildHebrewSignaturePdf() {
    const { PDFDocument } = require('pdf-lib');
    const fontkit = require('@pdf-lib/fontkit');

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const font = await doc.embedFont(fs.readFileSync(HEBREW_FONT_PATH), { subset: false });
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    page.drawText('חתימה', { x: KEYWORD_X, y: LINE_BASELINE_Y, size: FONT_SIZE, font });
    page.drawText(UNDERLINE_TEXT, { x: UNDERLINE_X, y: LINE_BASELINE_Y, size: FONT_SIZE, font });

    return {
        buffer: Buffer.from(await doc.save()),
        underlineWidth: font.widthOfTextAtSize(UNDERLINE_TEXT, FONT_SIZE),
    };
}

test('detection emits a spot whose bottom edge sits on the underline baseline', async () => {
    const { buffer } = await buildHebrewSignaturePdf();

    const spots = await detectHebrewSignatureSpotsFromPdfBuffer(buffer);
    assert.ok(Array.isArray(spots), 'detection returned an array');
    assert.ok(spots.length >= 1, `expected at least one spot, got ${spots.length}`);

    const spot = spots.find((s) => s.pageNum === 1);
    assert.ok(spot, 'a spot was detected on page 1');

    // The generated box is 50pt tall with its bottom on the baseline, so in
    // visual space it spans y = (800 - 250)*2 = 1100 down to (800 - 200)*2 = 1200.
    const expectedHeight = 50 * SCALE;                                    // 100
    const expectedTop = (PAGE_HEIGHT - (LINE_BASELINE_Y + 50)) * SCALE;   // 1100
    const expectedBaselineY = (PAGE_HEIGHT - LINE_BASELINE_Y) * SCALE;    // 1200

    assert.equal(spot.height, expectedHeight, 'spot height in visual space');
    assert.equal(spot.y, expectedTop, 'spot top in visual space');
    assert.equal(spot.y + spot.height, expectedBaselineY, 'spot bottom rests on the underline');
});

test('detection centres the spot on the underline, with no horizontal offset', async () => {
    const { buffer, underlineWidth } = await buildHebrewSignaturePdf();

    const spots = await detectHebrewSignatureSpotsFromPdfBuffer(buffer);
    const spot = spots.find((s) => s.pageNum === 1);
    assert.ok(spot, 'a spot was detected on page 1');

    // Width is clamped to [120, 260] pt; this underline is narrower than 120.
    const expectedWidthPt = Math.min(Math.max(underlineWidth, 120), 260);
    assert.equal(spot.width, Math.round(expectedWidthPt * SCALE), 'spot width in visual space');

    // Expected centre is the underline's own centre, converted to visual space.
    const underlineCentrePt = UNDERLINE_X + (underlineWidth / 2);
    const expectedCentreVisual = underlineCentrePt * SCALE;
    const actualCentreVisual = spot.x + (spot.width / 2);

    // Tolerance covers the small difference between pdf-lib's advance-width
    // metrics and the width pdfjs reports for the extracted text item.
    assert.ok(
        Math.abs(actualCentreVisual - expectedCentreVisual) <= 4,
        `spot centre ${actualCentreVisual} should be within 4px of underline centre ${expectedCentreVisual}`,
    );
});

test('detected spots stay inside the visual page bounds', async () => {
    const { buffer } = await buildHebrewSignaturePdf();

    const spots = await detectHebrewSignatureSpotsFromPdfBuffer(buffer);
    const expectedPageHeight = PAGE_HEIGHT * SCALE; // 1600

    for (const spot of spots) {
        assert.ok(spot.x >= 0, `spot.x ${spot.x} >= 0`);
        assert.ok(spot.y >= 0, `spot.y ${spot.y} >= 0`);
        assert.ok(
            spot.x + spot.width <= BASE_RENDER_WIDTH,
            `spot right edge ${spot.x + spot.width} <= ${BASE_RENDER_WIDTH}`,
        );
        assert.ok(
            spot.y + spot.height <= expectedPageHeight,
            `spot bottom edge ${spot.y + spot.height} <= ${expectedPageHeight}`,
        );
    }
});

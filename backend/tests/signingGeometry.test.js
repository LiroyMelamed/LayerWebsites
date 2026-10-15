'use strict';

/**
 * Contract tests for the canonical signing coordinate system.
 *
 * Every important coordinate case carries at least one ABSOLUTE expected
 * rectangle, hand-derived from the pdfjs PageViewport definition rather than
 * from this module's own output. Round-trip assertions alone are not enough: a
 * self-consistent but wrong transform round-trips perfectly.
 *
 * Test pages are deliberately 400x800 pt so that at baseWidth 800 the scale is
 * exactly 2 (or exactly 1 for quarter turns) and every expectation is an exact
 * integer. One real A4 case guards against the clean numbers hiding an error.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BASE_RENDER_WIDTH,
    buildPageGeometry,
    clientPointToVisual,
    normalizeRect,
    normalizeRotation,
    pageGeometryFromPdfLibPage,
    pageGeometryFromPdfjsPage,
    pdfBoxToVisualBox,
    pdfPointToVisual,
    resolveViewBox,
    visualBoxToPdfBox,
} = require('../lib/signingGeometry');

const EPS = 1e-6;

function assertClose(actual, expected, message) {
    assert.ok(
        Math.abs(actual - expected) < EPS,
        `${message || 'value'}: expected ${expected}, got ${actual}`,
    );
}

function assertBoxClose(actual, expected, label) {
    assertClose(actual.x, expected.x, `${label}.x`);
    assertClose(actual.y, expected.y, `${label}.y`);
    assertClose(actual.width, expected.width, `${label}.width`);
    assertClose(actual.height, expected.height, `${label}.height`);
}

function assertTransformClose(actual, expected, label) {
    assert.equal(actual.length, 6, `${label}: transform must have 6 entries`);
    for (let i = 0; i < 6; i += 1) {
        assertClose(actual[i], expected[i], `${label}[${i}]`);
    }
}

/** The box every case probes, in visual space. */
const PROBE = { x: 100, y: 200, width: 160, height: 56 };

// ---------------------------------------------------------------------------
// Absolute expected values, per coordinate-system case
// ---------------------------------------------------------------------------

test('A4 rotation 0: absolute rectangle and y-flip', () => {
    // Real A4. ptsPerPx = 595.276 / 800 = 0.744095 exactly.
    const geometry = buildPageGeometry({ mediaBox: [0, 0, 595.276, 841.89] });

    assertClose(geometry.visualWidth, 800, 'visualWidth');
    assertClose(geometry.scale, 800 / 595.276, 'scale');

    // Hand-derived: x = 100 * 0.744095; y = 841.89 - 256 * 0.744095;
    //               w = 160 * 0.744095; h = 56 * 0.744095
    assertBoxClose(
        visualBoxToPdfBox(geometry, PROBE),
        { x: 74.4095, y: 651.40168, width: 119.0552, height: 41.66932 },
        'a4 pdf box',
    );

    // Visual y grows downward, PDF y grows upward.
    const topLeft = pdfPointToVisual(geometry, 0, 841.89);
    assertClose(topLeft.x, 0, 'top-left visual x');
    assertClose(topLeft.y, 0, 'top-left visual y');
});

test('rotation 0 on a 400x800 page: exact transform and rectangle', () => {
    const geometry = buildPageGeometry({ mediaBox: [0, 0, 400, 800] });

    assertTransformClose(geometry.transform, [2, 0, 0, -2, 0, 1600], 'rot0 transform');
    assertClose(geometry.visualWidth, 800, 'visualWidth');
    assertClose(geometry.visualHeight, 1600, 'visualHeight');

    assertBoxClose(
        visualBoxToPdfBox(geometry, PROBE),
        { x: 50, y: 672, width: 80, height: 28 },
        'rot0 pdf box',
    );
});

test('CropBox smaller than MediaBox with non-zero origin: origin is carried', () => {
    // CropBox [50,100,450,900] inside MediaBox [0,0,500,1000] -> 400x800 view box.
    const geometry = buildPageGeometry({
        mediaBox: [0, 0, 500, 1000],
        cropBox: [50, 100, 450, 900],
    });

    assert.deepEqual(geometry.viewBox, [50, 100, 450, 900]);
    assertTransformClose(geometry.transform, [2, 0, 0, -2, -100, 1800], 'crop transform');

    // The whole visual page maps back onto the CropBox exactly.
    assertBoxClose(
        visualBoxToPdfBox(geometry, { x: 0, y: 0, width: 800, height: 1600 }),
        { x: 50, y: 100, width: 400, height: 800 },
        'crop full page',
    );

    // Same probe as the rotation-0 case, shifted by the CropBox origin.
    assertBoxClose(
        visualBoxToPdfBox(geometry, PROBE),
        { x: 100, y: 772, width: 80, height: 28 },
        'crop pdf box',
    );
});

test('rotation 90: axes swap and rectangle is exact', () => {
    const geometry = buildPageGeometry({ mediaBox: [0, 0, 400, 800], rotation: 90 });

    // Quarter turn: the 800pt tall side becomes the 800px wide side, so scale = 1.
    assertClose(geometry.scale, 1, 'scale');
    assertClose(geometry.visualWidth, 800, 'visualWidth');
    assertClose(geometry.visualHeight, 400, 'visualHeight');
    assertTransformClose(geometry.transform, [0, 1, 1, 0, 0, 0], 'rot90 transform');

    assertBoxClose(
        visualBoxToPdfBox(geometry, PROBE),
        { x: 200, y: 100, width: 56, height: 160 },
        'rot90 pdf box',
    );
});

test('rotation 180: exact transform and rectangle', () => {
    const geometry = buildPageGeometry({ mediaBox: [0, 0, 400, 800], rotation: 180 });

    assertClose(geometry.visualWidth, 800, 'visualWidth');
    assertClose(geometry.visualHeight, 1600, 'visualHeight');
    assertTransformClose(geometry.transform, [-2, 0, 0, 2, 800, 0], 'rot180 transform');

    assertBoxClose(
        visualBoxToPdfBox(geometry, PROBE),
        { x: 270, y: 100, width: 80, height: 28 },
        'rot180 pdf box',
    );
});

test('rotation 270: exact transform and rectangle', () => {
    const geometry = buildPageGeometry({ mediaBox: [0, 0, 400, 800], rotation: 270 });

    assertClose(geometry.scale, 1, 'scale');
    assertClose(geometry.visualWidth, 800, 'visualWidth');
    assertClose(geometry.visualHeight, 400, 'visualHeight');
    assertTransformClose(geometry.transform, [0, -1, -1, 0, 800, 400], 'rot270 transform');

    assertBoxClose(
        visualBoxToPdfBox(geometry, PROBE),
        { x: 144, y: 540, width: 56, height: 160 },
        'rot270 pdf box',
    );
});

test('each rotation puts the PDF origin in the expected visual corner', () => {
    const mediaBox = [0, 0, 400, 800];
    const corners = {
        0: { x: 0, y: 1600 },   // bottom-left
        90: { x: 0, y: 0 },     // top-left
        180: { x: 800, y: 0 },  // top-right
        270: { x: 800, y: 400 }, // bottom-right
    };

    for (const [rotation, expected] of Object.entries(corners)) {
        const geometry = buildPageGeometry({ mediaBox, rotation: Number(rotation) });
        const origin = pdfPointToVisual(geometry, 0, 0);
        assertClose(origin.x, expected.x, `rot${rotation} origin x`);
        assertClose(origin.y, expected.y, `rot${rotation} origin y`);
    }
});

// ---------------------------------------------------------------------------
// CropBox resolution semantics (must match pdfjs, not pdf-lib's raw accessor)
// ---------------------------------------------------------------------------

test('reversed box coordinates are normalized before use', () => {
    const reversed = buildPageGeometry({ mediaBox: [400, 800, 0, 0] });
    const forward = buildPageGeometry({ mediaBox: [0, 0, 400, 800] });

    assert.deepEqual(reversed.viewBox, [0, 0, 400, 800]);
    assertTransformClose(reversed.transform, forward.transform, 'reversed transform');

    // Reversed CropBox too.
    const reversedCrop = buildPageGeometry({
        mediaBox: [0, 0, 500, 1000],
        cropBox: [450, 900, 50, 100],
    });
    assert.deepEqual(reversedCrop.viewBox, [50, 100, 450, 900]);
});

test('CropBox larger than MediaBox is clipped, not trusted', () => {
    // This is the pdf-lib divergence: getCropBox() would hand back the oversized
    // box verbatim, giving a different scale than the browser renders at.
    const geometry = buildPageGeometry({
        mediaBox: [0, 0, 400, 800],
        cropBox: [-50, -100, 450, 900],
    });

    assert.deepEqual(geometry.viewBox, [0, 0, 400, 800]);
    assertTransformClose(geometry.transform, [2, 0, 0, -2, 0, 1600], 'clipped transform');
});

test('CropBox disjoint from or degenerate against MediaBox falls back to MediaBox', () => {
    const disjoint = buildPageGeometry({
        mediaBox: [0, 0, 400, 800],
        cropBox: [900, 900, 1000, 1000],
    });
    assert.deepEqual(disjoint.viewBox, [0, 0, 400, 800]);

    // Touching along one edge only -> zero area -> ignored.
    const degenerate = buildPageGeometry({
        mediaBox: [0, 0, 400, 800],
        cropBox: [400, 0, 500, 800],
    });
    assert.deepEqual(degenerate.viewBox, [0, 0, 400, 800]);
});

test('resolveViewBox and normalizeRect behave as documented', () => {
    assert.deepEqual(normalizeRect([10, 20, 5, 8]), [5, 8, 10, 20]);
    assert.deepEqual(resolveViewBox({ mediaBox: [0, 0, 100, 100], cropBox: null }), [0, 0, 100, 100]);
    assert.deepEqual(
        resolveViewBox({ mediaBox: [0, 0, 100, 100], cropBox: [10, 10, 90, 90] }),
        [10, 10, 90, 90],
    );
    assert.throws(() => resolveViewBox({ mediaBox: [0, 0, Number.NaN, 100] }), /mediaBox/);
});

test('rotation is snapped exactly as pdfjs does', () => {
    assert.equal(normalizeRotation(0), 0);
    assert.equal(normalizeRotation(90), 90);
    assert.equal(normalizeRotation(450), 90);
    assert.equal(normalizeRotation(-90), 270);
    assert.equal(normalizeRotation(45), 0, 'non-multiples of 90 collapse to 0');
    assert.equal(normalizeRotation(undefined), 0);
});

test('zero-area pages are rejected rather than producing Infinity', () => {
    assert.throws(() => buildPageGeometry({ mediaBox: [0, 0, 0, 800] }), /zero area/);
});

// ---------------------------------------------------------------------------
// UserUnit: excluded because it provably cancels
// ---------------------------------------------------------------------------

test('UserUnit does not affect the transform (locks the exclusion rationale)', () => {
    // pdfjs multiplies viewport scale by UserUnit, but react-pdf solves for a
    // fixed output width, so the factor cancels. If the viewer is ever changed
    // to pass a fixed `scale` instead of `width`, this test must be revisited.
    const base = buildPageGeometry({ mediaBox: [0, 0, 400, 800], userUnit: 1 });
    const scaled = buildPageGeometry({ mediaBox: [0, 0, 400, 800], userUnit: 2.5 });

    assertTransformClose(scaled.transform, base.transform, 'userUnit transform');
    assertClose(scaled.visualWidth, base.visualWidth, 'userUnit visualWidth');
    assertClose(scaled.visualHeight, base.visualHeight, 'userUnit visualHeight');
});

// ---------------------------------------------------------------------------
// Round trips (necessary but not sufficient; the absolutes above do the work)
// ---------------------------------------------------------------------------

test('visual -> pdf -> visual round-trips for every rotation and box shape', () => {
    const cases = [
        { mediaBox: [0, 0, 595.276, 841.89] },
        { mediaBox: [0, 0, 400, 800], rotation: 90 },
        { mediaBox: [0, 0, 400, 800], rotation: 180 },
        { mediaBox: [0, 0, 400, 800], rotation: 270 },
        { mediaBox: [0, 0, 500, 1000], cropBox: [50, 100, 450, 900] },
        { mediaBox: [0, 0, 500, 1000], cropBox: [50, 100, 450, 900], rotation: 270 },
    ];

    const boxes = [
        PROBE,
        { x: 0, y: 0, width: 40, height: 40 },
        { x: 640, y: 900, width: 160, height: 56 },
    ];

    for (const options of cases) {
        const geometry = buildPageGeometry(options);
        for (const box of boxes) {
            const back = pdfBoxToVisualBox(geometry, visualBoxToPdfBox(geometry, box));
            assertBoxClose(back, box, `round trip r${options.rotation || 0}`);
        }
    }
});

// ---------------------------------------------------------------------------
// Frontend invariant, tested as a pure helper (no new test infrastructure)
// ---------------------------------------------------------------------------

test('identical drop point yields identical 800-space coords at widths 800/1000/1400', () => {
    // A page rendered at width W has height W * (800/400) for our test page.
    // The user drops at 25% across and 60% down the rendered page in all cases.
    const results = [800, 1000, 1400].map((renderedWidth) => {
        const renderedHeight = renderedWidth * 2;
        return clientPointToVisual({
            clientX: 0 + (0.25 * renderedWidth),
            clientY: 0 + (0.6 * renderedHeight),
            rectLeft: 0,
            rectTop: 0,
            measuredWidth: renderedWidth,
        });
    });

    // 25% of 800 = 200; 60% of the 1600-tall visual space = 960.
    for (const [i, got] of results.entries()) {
        assertClose(got.x, 200, `width case ${i} x`);
        assertClose(got.y, 960, `width case ${i} y`);
    }
});

test('clientPointToVisual subtracts the page origin and rejects unmeasured widths', () => {
    const got = clientPointToVisual({
        clientX: 350,
        clientY: 520,
        rectLeft: 150,
        rectTop: 120,
        measuredWidth: 400,
    });
    // (350-150) * 800/400 = 400 ; (520-120) * 2 = 800
    assertClose(got.x, 400, 'x');
    assertClose(got.y, 800, 'y');

    assert.throws(() => clientPointToVisual({
        clientX: 1, clientY: 1, rectLeft: 0, rectTop: 0, measuredWidth: 0,
    }), /measuredWidth/);
});

test('BASE_RENDER_WIDTH is the documented 800', () => {
    assert.equal(BASE_RENDER_WIDTH, 800);
});

// ---------------------------------------------------------------------------
// Cross-library agreement: pdf-lib page vs pdfjs page must yield one transform
// ---------------------------------------------------------------------------

async function buildFixture({ size = [400, 800], rotation = 0, cropBox = null, inheritCropBox = false }) {
    const { PDFDocument, PDFName, degrees } = require('pdf-lib');

    const doc = await PDFDocument.create();
    const page = doc.addPage(size);
    if (rotation) page.setRotation(degrees(rotation));

    if (cropBox && !inheritCropBox) {
        page.node.set(PDFName.of('CropBox'), doc.context.obj(cropBox));
    }

    if (cropBox && inheritCropBox) {
        // Put CropBox on the page-tree parent and leave the leaf without one,
        // so the value can only be found through attribute inheritance.
        const pagesDict = doc.context.lookup(doc.catalog.get(PDFName.of('Pages')));
        pagesDict.set(PDFName.of('CropBox'), doc.context.obj(cropBox));
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
}

async function loadWithPdfjs(buffer) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    return pdf.getPage(1);
}

async function loadWithPdfLib(buffer) {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(buffer);
    return doc.getPages()[0];
}

const CROSS_CASES = [
    { name: 'A4 rotation 0', size: [595.276, 841.89] },
    { name: 'rotation 90', size: [400, 800], rotation: 90 },
    { name: 'rotation 180', size: [400, 800], rotation: 180 },
    { name: 'rotation 270', size: [400, 800], rotation: 270 },
    { name: 'CropBox with non-zero origin', size: [500, 1000], cropBox: [50, 100, 450, 900] },
    { name: 'inherited CropBox', size: [500, 1000], cropBox: [50, 100, 450, 900], inheritCropBox: true },
    { name: 'CropBox larger than MediaBox', size: [400, 800], cropBox: [-50, -100, 450, 900] },
    { name: 'rotated page with CropBox', size: [500, 1000], cropBox: [50, 100, 450, 900], rotation: 90 },
];

for (const testCase of CROSS_CASES) {
    test(`pdf-lib and pdfjs agree: ${testCase.name}`, async () => {
        const buffer = await buildFixture(testCase);

        const pdfLibPage = await loadWithPdfLib(buffer);
        const pdfjsPage = await loadWithPdfjs(buffer);

        const fromPdfLib = pageGeometryFromPdfLibPage(pdfLibPage);
        const fromPdfjs = pageGeometryFromPdfjsPage(pdfjsPage);

        assert.deepEqual(fromPdfLib.viewBox, fromPdfjs.viewBox, 'viewBox');
        assert.equal(fromPdfLib.rotation, fromPdfjs.rotation, 'rotation');
        assertTransformClose(fromPdfLib.transform, fromPdfjs.transform, 'transform');

        // And both must match the viewport the browser would actually render,
        // which is the ultimate authority for where a spot appears on screen.
        const viewport = pdfjsPage.getViewport({ scale: fromPdfjs.scale });
        assertClose(viewport.width, BASE_RENDER_WIDTH, 'rendered viewport width');
        assertClose(viewport.height, fromPdfjs.visualHeight, 'rendered viewport height');
        assertTransformClose(viewport.transform, fromPdfjs.transform, 'viewport transform');
    });
}

test('inherited CropBox is actually inherited, not silently defaulted', async () => {
    const buffer = await buildFixture({
        size: [500, 1000],
        cropBox: [50, 100, 450, 900],
        inheritCropBox: true,
    });

    const pdfjsPage = await loadWithPdfjs(buffer);
    assert.deepEqual(pdfjsPage.view, [50, 100, 450, 900], 'pdfjs resolved the inherited CropBox');

    const pdfLibPage = await loadWithPdfLib(buffer);
    const crop = pdfLibPage.getCropBox();
    assertClose(crop.x, 50, 'pdf-lib inherited crop x');
    assertClose(crop.y, 100, 'pdf-lib inherited crop y');
    assertClose(crop.width, 400, 'pdf-lib inherited crop width');
    assertClose(crop.height, 800, 'pdf-lib inherited crop height');
});

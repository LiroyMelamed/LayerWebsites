'use strict';

/**
 * The frontend cannot import from backend/, so the pointer->spot-space formula
 * exists in two places: clientPointToVisual() in backend/lib/signingGeometry.js
 * and clientPointToSpotSpace() in frontend/src/utils/signingSpotGeometry.js.
 *
 * This test loads the real frontend module (Node can require() ESM) and asserts
 * the two agree, so the duplication cannot silently drift. It deliberately adds
 * no frontend test runner or config.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BASE_RENDER_WIDTH,
    clientPointToVisual,
} = require('../lib/signingGeometry');

const {
    SPOT_BASE_WIDTH,
    clampSpotToPage,
    clientPointToSpotSpace,
    pageSizeInSpotSpace,
    spotSpaceScale,
} = require('../../frontend/src/utils/signingSpotGeometry.js');

const EPS = 1e-9;

function assertClose(actual, expected, message) {
    assert.ok(
        Math.abs(actual - expected) < EPS,
        `${message}: expected ${expected}, got ${actual}`,
    );
}

test('frontend and backend agree on the base width', () => {
    assert.equal(SPOT_BASE_WIDTH, BASE_RENDER_WIDTH);
});

test('frontend clientPointToSpotSpace matches backend clientPointToVisual', () => {
    const cases = [
        { clientX: 0, clientY: 0, rectLeft: 0, rectTop: 0, measuredWidth: 800 },
        { clientX: 350, clientY: 520, rectLeft: 150, rectTop: 120, measuredWidth: 400 },
        { clientX: 1180, clientY: 940, rectLeft: 40, rectTop: 24, measuredWidth: 1400 },
        { clientX: 12.75, clientY: 933.5, rectLeft: 3.25, rectTop: 11.5, measuredWidth: 997.5 },
        { clientX: -20, clientY: -35, rectLeft: 10, rectTop: 15, measuredWidth: 1000 },
    ];

    for (const input of cases) {
        const front = clientPointToSpotSpace(input);
        const back = clientPointToVisual(input);
        assertClose(front.x, back.x, `x for measuredWidth ${input.measuredWidth}`);
        assertClose(front.y, back.y, `y for measuredWidth ${input.measuredWidth}`);
    }
});

test('frontend helper enforces the same measured-width requirement', () => {
    // The backend throws; the frontend returns null so React render paths can
    // simply skip until the canvas has been measured. Both refuse to guess.
    assert.equal(clientPointToSpotSpace({
        clientX: 1, clientY: 1, rectLeft: 0, rectTop: 0, measuredWidth: 0,
    }), null);
    assert.equal(spotSpaceScale(0), 0);
    assert.throws(() => clientPointToVisual({
        clientX: 1, clientY: 1, rectLeft: 0, rectTop: 0, measuredWidth: 0,
    }), /measuredWidth/);
});

test('the 800/1000/1400 invariant holds in the frontend helper too', () => {
    // Same physical drop point (25% across, 60% down) on the same 400x800pt page.
    for (const renderedWidth of [800, 1000, 1400]) {
        const renderedHeight = renderedWidth * 2;
        const point = clientPointToSpotSpace({
            clientX: 0.25 * renderedWidth,
            clientY: 0.6 * renderedHeight,
            rectLeft: 0,
            rectTop: 0,
            measuredWidth: renderedWidth,
        });
        assertClose(point.x, 200, `x at rendered width ${renderedWidth}`);
        assertClose(point.y, 960, `y at rendered width ${renderedWidth}`);
    }
});

test('the invariant also holds when the page is offset on screen', () => {
    // Scrolled/centred pages must not change the stored coordinate.
    const offsets = [{ left: 0, top: 0 }, { left: 137.5, top: -420.25 }, { left: 12, top: 88 }];
    for (const renderedWidth of [800, 1000, 1400]) {
        for (const offset of offsets) {
            const point = clientPointToSpotSpace({
                clientX: offset.left + (0.25 * renderedWidth),
                clientY: offset.top + (0.6 * renderedWidth * 2),
                rectLeft: offset.left,
                rectTop: offset.top,
                measuredWidth: renderedWidth,
            });
            assertClose(point.x, 200, `x at ${renderedWidth} offset ${offset.left}`);
            assertClose(point.y, 960, `y at ${renderedWidth} offset ${offset.top}`);
        }
    }
});

test('spotSpaceScale and clientPointToSpotSpace are exact inverses', () => {
    for (const measuredWidth of [800, 1000, 1400, 613.5]) {
        const scale = spotSpaceScale(measuredWidth);
        const spotPoint = { x: 200, y: 960 };

        // Render position the overlay would use, then read it back as a pointer.
        const back = clientPointToSpotSpace({
            clientX: spotPoint.x * scale,
            clientY: spotPoint.y * scale,
            rectLeft: 0,
            rectTop: 0,
            measuredWidth,
        });

        assertClose(back.x, spotPoint.x, `x round trip at ${measuredWidth}`);
        assertClose(back.y, spotPoint.y, `y round trip at ${measuredWidth}`);
    }
});

test('pageSizeInSpotSpace derives page height from the measured rect', () => {
    // A 400x800pt page rendered 1000px wide is 2000px tall; in spot space that
    // is 800 x 1600 regardless of the rendered size.
    for (const renderedWidth of [800, 1000, 1400]) {
        const size = pageSizeInSpotSpace({
            measuredWidth: renderedWidth,
            measuredHeight: renderedWidth * 2,
        });
        assertClose(size.width, 800, 'page width in spot space');
        assertClose(size.height, 1600, 'page height in spot space');
    }
    assert.equal(pageSizeInSpotSpace({ measuredWidth: 0, measuredHeight: 100 }), null);
});

test('clampSpotToPage keeps boxes inside the page without shifting valid ones', () => {
    const page = { pageWidth: 800, pageHeight: 1600 };

    assert.deepEqual(
        clampSpotToPage({ x: 100, y: 200, width: 160, height: 56, ...page }),
        { x: 100, y: 200 },
    );
    assert.deepEqual(
        clampSpotToPage({ x: 780, y: 1590, width: 160, height: 56, ...page }),
        { x: 640, y: 1544 },
    );
    assert.deepEqual(
        clampSpotToPage({ x: -50, y: -50, width: 160, height: 56, ...page }),
        { x: 0, y: 0 },
    );
    // A box larger than the page collapses to the origin rather than going negative.
    assert.deepEqual(
        clampSpotToPage({ x: 10, y: 10, width: 900, height: 2000, ...page }),
        { x: 0, y: 0 },
    );
});

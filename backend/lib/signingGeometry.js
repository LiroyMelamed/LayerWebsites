'use strict';

/**
 * Canonical coordinate system for signing geometry.
 *
 *   PDF native user space  <->  PDF.js visual/page space  <->  800-space spots
 *
 * Spots are persisted in "visual space": a top-left-origin pixel grid whose
 * width is always BASE_RENDER_WIDTH, matching what react-pdf renders in the
 * browser. Every conversion between that grid and PDF user space must go
 * through visualBoxToPdfBox / pdfBoxToVisualBox so that the placement UI, the
 * auto-detector and the PDF burn cannot drift apart.
 *
 * The transform is deliberately a re-implementation of pdfjs-dist's
 * PageViewport matrix rather than an independent derivation. The browser
 * renders through PageViewport, so matching it by construction is the only way
 * to guarantee that a spot dropped on a glyph burns onto that same glyph.
 *
 * Consequence: rotation needs no per-angle special cases. Transforming two
 * opposite corners and re-normalizing is correct for every multiple of 90,
 * because an axis-aligned box always maps to an axis-aligned box.
 *
 * ---------------------------------------------------------------------------
 * Why UserUnit is deliberately excluded
 * ---------------------------------------------------------------------------
 * pdfjs folds UserUnit into the viewport scale (PageViewport does
 * `scale *= userUnit`, and every matrix entry is linear in that product).
 * react-pdf never fixes a scale; it normalizes by output width:
 *
 *     const viewport = page.getViewport({ scale: 1, rotation });
 *     pageScale = width / viewport.width;
 *
 * `viewport.width` at scale 1 already contains UserUnit, so the scale actually
 * used is `pageScale * userUnit === width / boxWidth`. UserUnit cancels. This
 * module normalizes by `baseWidth` in exactly the same way, so UserUnit cannot
 * shift a spot and modelling it would be dead code.
 *
 * This holds only because the app always passes `width` to <Page> and never
 * `scale`. buildPageGeometry accepts a `userUnit` argument and provably ignores
 * it; the invariance test locks that claim, and is the test that will fail if
 * anyone ever switches the viewer to a fixed scale.
 */

/** Width, in CSS pixels, of the visual space that persisted spot coordinates live in. */
const BASE_RENDER_WIDTH = 800;

/** Sort [x0, y0, x1, y1] so x0 <= x1 and y0 <= y1 (pdfjs Util.normalizeRect). */
function normalizeRect(rect) {
    const out = rect.slice(0, 4).map(Number);
    if (out[0] > out[2]) {
        const t = out[0];
        out[0] = out[2];
        out[2] = t;
    }
    if (out[1] > out[3]) {
        const t = out[1];
        out[1] = out[3];
        out[3] = t;
    }
    return out;
}

/** Intersection of two normalized rects, or null when they do not overlap (pdfjs Util.intersect). */
function intersectRect(a, b) {
    const x0 = Math.max(a[0], b[0]);
    const x1 = Math.min(a[2], b[2]);
    if (x0 > x1) return null;

    const y0 = Math.max(a[1], b[1]);
    const y1 = Math.min(a[3], b[3]);
    if (y0 > y1) return null;

    return [x0, y0, x1, y1];
}

function isFiniteRect(rect) {
    return Array.isArray(rect)
        && rect.length >= 4
        && rect.slice(0, 4).every((n) => Number.isFinite(Number(n)));
}

/**
 * The box pdfjs actually renders: CropBox clipped to MediaBox, falling back to
 * MediaBox when CropBox is absent, degenerate or disjoint.
 *
 * pdf-lib's page.getCropBox() is `cropBox?.asRectangle() ?? getMediaBox()` with
 * no normalization and no intersection, so it is NOT equivalent to pdfjs's
 * page.view. Routing it through here is what makes the two libraries agree.
 */
function resolveViewBox({ mediaBox, cropBox }) {
    if (!isFiniteRect(mediaBox)) {
        throw new Error('signingGeometry: mediaBox must be [x0, y0, x1, y1] of finite numbers');
    }

    const media = normalizeRect(mediaBox);

    if (isFiniteRect(cropBox)) {
        const hit = intersectRect(normalizeRect(cropBox), media);
        // Zero-area intersections are ignored, as pdfjs does.
        if (hit && hit[2] - hit[0] > 0 && hit[3] - hit[1] > 0) return hit;
    }

    return media;
}

/** Snap /Rotate to 0/90/180/270 exactly as pdfjs's Page#rotate getter does. */
function normalizeRotation(value) {
    const rotate = Number(value) || 0;
    if (rotate % 90 !== 0) return 0;
    if (rotate >= 360) return rotate % 360;
    if (rotate < 0) return ((rotate % 360) + 360) % 360;
    return rotate;
}

/**
 * Build the transform between PDF user space and visual space for one page.
 *
 * @param {object}   opts
 * @param {number[]} opts.mediaBox   [x0, y0, x1, y1] in PDF points.
 * @param {number[]} [opts.cropBox]  [x0, y0, x1, y1]; clipped to mediaBox.
 * @param {number}   [opts.rotation] /Rotate in degrees.
 * @param {number}   [opts.userUnit] Accepted and provably ignored; see header.
 * @param {number}   [opts.baseWidth] Visual-space width; defaults to 800.
 */
function buildPageGeometry({
    mediaBox,
    cropBox = null,
    rotation = 0,
    userUnit = 1,
    baseWidth = BASE_RENDER_WIDTH,
} = {}) {
    const viewBox = resolveViewBox({ mediaBox, cropBox });
    const rot = normalizeRotation(rotation);

    const boxW = viewBox[2] - viewBox[0];
    const boxH = viewBox[3] - viewBox[1];
    if (!(boxW > 0) || !(boxH > 0)) {
        throw new Error('signingGeometry: page view box has zero area');
    }

    const width = Number(baseWidth);
    const safeBaseWidth = Number.isFinite(width) && width > 0 ? width : BASE_RENDER_WIDTH;

    const isQuarterTurn = rot === 90 || rot === 270;

    // pdfjs computes `scale * userUnit`; because we solve for a fixed output
    // width, the UserUnit factor cancels and leaves baseWidth / viewBoxWidth.
    // See the header for the derivation.
    const effectiveScale = safeBaseWidth / (isQuarterTurn ? boxH : boxW);

    // --- pdfjs PageViewport matrix (dontFlip = false) ---
    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;

    let rotateA;
    let rotateB;
    let rotateC;
    let rotateD;
    switch (rot) {
        case 180:
            rotateA = -1; rotateB = 0; rotateC = 0; rotateD = 1;
            break;
        case 90:
            rotateA = 0; rotateB = 1; rotateC = 1; rotateD = 0;
            break;
        case 270:
            rotateA = 0; rotateB = -1; rotateC = -1; rotateD = 0;
            break;
        default:
            rotateA = 1; rotateB = 0; rotateC = 0; rotateD = -1;
            break;
    }

    let offsetCanvasX;
    let offsetCanvasY;
    let visualWidth;
    let visualHeight;
    if (rotateA === 0) {
        offsetCanvasX = Math.abs(centerY - viewBox[1]) * effectiveScale;
        offsetCanvasY = Math.abs(centerX - viewBox[0]) * effectiveScale;
        visualWidth = boxH * effectiveScale;
        visualHeight = boxW * effectiveScale;
    } else {
        offsetCanvasX = Math.abs(centerX - viewBox[0]) * effectiveScale;
        offsetCanvasY = Math.abs(centerY - viewBox[1]) * effectiveScale;
        visualWidth = boxW * effectiveScale;
        visualHeight = boxH * effectiveScale;
    }

    const transform = [
        rotateA * effectiveScale,
        rotateB * effectiveScale,
        rotateC * effectiveScale,
        rotateD * effectiveScale,
        offsetCanvasX - (rotateA * effectiveScale * centerX) - (rotateC * effectiveScale * centerY),
        offsetCanvasY - (rotateB * effectiveScale * centerX) - (rotateD * effectiveScale * centerY),
    ];

    return {
        viewBox,
        rotation: rot,
        // Reported for diagnostics only; provably not part of the transform.
        userUnit: Number(userUnit) > 0 ? Number(userUnit) : 1,
        scale: effectiveScale,
        visualWidth,
        visualHeight,
        transform,
    };
}

function applyTransform(m, x, y) {
    return [
        (m[0] * x) + (m[2] * y) + m[4],
        (m[1] * x) + (m[3] * y) + m[5],
    ];
}

function applyInverseTransform(m, x, y) {
    const det = (m[0] * m[3]) - (m[1] * m[2]);
    if (!det) throw new Error('signingGeometry: page transform is not invertible');

    const px = x - m[4];
    const py = y - m[5];
    return [
        ((m[3] * px) - (m[2] * py)) / det,
        ((m[0] * py) - (m[1] * px)) / det,
    ];
}

/** PDF native point -> visual space (top-left origin, baseWidth wide). */
function pdfPointToVisual(geometry, x, y) {
    const [vx, vy] = applyTransform(geometry.transform, Number(x), Number(y));
    return { x: vx, y: vy };
}

/** Visual-space point -> PDF native point. */
function visualPointToPdf(geometry, x, y) {
    const [px, py] = applyInverseTransform(geometry.transform, Number(x), Number(y));
    return { x: px, y: py };
}

function readBox(box) {
    const x = Number(box?.x ?? 0);
    const y = Number(box?.y ?? 0);
    const width = Number(box?.width ?? 0);
    const height = Number(box?.height ?? 0);
    if (![x, y, width, height].every(Number.isFinite)) {
        throw new Error('signingGeometry: box must have finite x, y, width, height');
    }
    return { x, y, width, height };
}

function boxFromCorners(a, b) {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
    };
}

/**
 * Visual box (top-left origin) -> PDF native box (bottom-left origin).
 * Canonical direction used when burning a signature into a PDF.
 */
function visualBoxToPdfBox(geometry, box) {
    const { x, y, width, height } = readBox(box);
    return boxFromCorners(
        visualPointToPdf(geometry, x, y),
        visualPointToPdf(geometry, x + width, y + height),
    );
}

/**
 * PDF native box (bottom-left origin) -> visual box (top-left origin).
 * Canonical direction used when auto-detecting spots from PDF text.
 */
function pdfBoxToVisualBox(geometry, box) {
    const { x, y, width, height } = readBox(box);
    return boxFromCorners(
        pdfPointToVisual(geometry, x, y),
        pdfPointToVisual(geometry, x + width, y + height),
    );
}

/**
 * Convert a pointer position on a rendered page element into visual space.
 *
 * This is the browser-side half of the contract, kept here so the frontend and
 * the backend share one definition and one test. `measuredWidth` MUST be the
 * measured width of the rendered canvas, never an intended/expected width:
 * deriving the scale from an assumed width is what allowed placed spots to be
 * persisted against a different scale than the page was drawn at.
 */
function clientPointToVisual({ clientX, clientY, rectLeft, rectTop, measuredWidth, baseWidth = BASE_RENDER_WIDTH }) {
    const measured = Number(measuredWidth);
    if (!(measured > 0)) {
        throw new Error('signingGeometry: measuredWidth must be a positive number');
    }

    const base = Number(baseWidth);
    const safeBaseWidth = Number.isFinite(base) && base > 0 ? base : BASE_RENDER_WIDTH;

    // One scalar for both axes: the rendered page preserves the page aspect
    // ratio, so a separate vertical scale would only reintroduce drift.
    const pxToVisual = safeBaseWidth / measured;

    return {
        x: (Number(clientX) - Number(rectLeft)) * pxToVisual,
        y: (Number(clientY) - Number(rectTop)) * pxToVisual,
        scale: pxToVisual,
    };
}

function rectFromPdfLibBox(box) {
    if (!box) return null;
    const x = Number(box.x);
    const y = Number(box.y);
    const width = Number(box.width);
    const height = Number(box.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return [x, y, x + width, y + height];
}

/**
 * Build geometry for a pdf-lib PDFPage.
 * getMediaBox/getCropBox/getRotation resolve inherited attributes through
 * PDFPageLeaf.getInheritableAttribute, so inherited boxes are handled here.
 */
function pageGeometryFromPdfLibPage(page, baseWidth = BASE_RENDER_WIDTH) {
    return buildPageGeometry({
        mediaBox: rectFromPdfLibBox(page.getMediaBox()),
        cropBox: rectFromPdfLibBox(page.getCropBox()),
        rotation: page.getRotation()?.angle || 0,
        baseWidth,
    });
}

/** Build geometry for a pdfjs-dist PDFPageProxy. */
function pageGeometryFromPdfjsPage(page, baseWidth = BASE_RENDER_WIDTH) {
    // page.view is already CropBox clipped to MediaBox and normalized.
    return buildPageGeometry({
        mediaBox: page.view,
        rotation: page.rotate || 0,
        baseWidth,
    });
}

module.exports = {
    BASE_RENDER_WIDTH,
    applyInverseTransform,
    applyTransform,
    buildPageGeometry,
    clientPointToVisual,
    intersectRect,
    normalizeRect,
    normalizeRotation,
    pageGeometryFromPdfLibPage,
    pageGeometryFromPdfjsPage,
    pdfBoxToVisualBox,
    pdfPointToVisual,
    resolveViewBox,
    visualBoxToPdfBox,
    visualPointToPdf,
};

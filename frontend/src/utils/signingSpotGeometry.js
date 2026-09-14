/**
 * Geometry helpers for signature spots (PDF page coordinates, unscaled).
 */

/**
 * Width of the visual space that persisted spot coordinates live in.
 * Must stay equal to BASE_RENDER_WIDTH in backend/lib/signingGeometry.js, which
 * owns the canonical transform. The parity test in
 * backend/tests/signingSpotGeometry.parity.test.js fails if the two drift.
 */
export const SPOT_BASE_WIDTH = 800;

/**
 * CSS pixels per spot unit, from the MEASURED width of the rendered page.
 *
 * Always pass a measured width (a canvas/page bounding rect), never an intended
 * or requested render width. Deriving this from an assumed width is what let
 * spots be persisted against a different scale than the page was drawn at,
 * which shifted signatures upward in proportion to their distance down the page.
 */
export function spotSpaceScale(measuredWidth, baseWidth = SPOT_BASE_WIDTH) {
  const measured = Number(measuredWidth);
  const base = Number(baseWidth) > 0 ? Number(baseWidth) : SPOT_BASE_WIDTH;
  if (!(measured > 0)) return 0;
  return measured / base;
}

/**
 * Convert a pointer position into spot space (top-left origin, baseWidth wide).
 * Mirror of clientPointToVisual() in backend/lib/signingGeometry.js.
 */
export function clientPointToSpotSpace({
  clientX,
  clientY,
  rectLeft,
  rectTop,
  measuredWidth,
  baseWidth = SPOT_BASE_WIDTH,
}) {
  const measured = Number(measuredWidth);
  if (!(measured > 0)) return null;

  const base = Number(baseWidth) > 0 ? Number(baseWidth) : SPOT_BASE_WIDTH;
  // One scalar for both axes: the rendered page preserves the page aspect
  // ratio, so a separate vertical scale would only reintroduce drift.
  const pxToSpot = base / measured;

  return {
    x: (Number(clientX) - Number(rectLeft)) * pxToSpot,
    y: (Number(clientY) - Number(rectTop)) * pxToSpot,
  };
}

/** Page dimensions in spot space, from the measured rendered rect. */
export function pageSizeInSpotSpace({ measuredWidth, measuredHeight, baseWidth = SPOT_BASE_WIDTH }) {
  const measured = Number(measuredWidth);
  if (!(measured > 0)) return null;

  const base = Number(baseWidth) > 0 ? Number(baseWidth) : SPOT_BASE_WIDTH;
  const pxToSpot = base / measured;

  return {
    width: base,
    height: Number(measuredHeight) * pxToSpot,
  };
}

/** Clamp a spot box so it stays fully inside the page, in spot space. */
export function clampSpotToPage({ x, y, width, height, pageWidth, pageHeight }) {
  const maxX = Math.max(0, Number(pageWidth) - Number(width));
  const maxY = Math.max(0, Number(pageHeight) - Number(height));
  return {
    x: Math.max(0, Math.min(Number(x), maxX)),
    y: Math.max(0, Math.min(Number(y), maxY)),
  };
}

/* -------------------------------------------------------------------------- */
/* DOM readers. Not pure, but kept here so page measurement has one definition. */
/* -------------------------------------------------------------------------- */

/** CSS selector for the element that shrink-wraps a rendered page. */
export const PAGE_BOX_SELECTOR = ".lw-signing-pageInner";

export function pageBoxForNumber(pageNumber) {
  if (typeof document === "undefined") return null;
  return document.querySelector(`${PAGE_BOX_SELECTOR}[data-page-number="${pageNumber}"]`);
}

/**
 * Width of the canvas that was actually rendered for this page.
 *
 * PdfViewer publishes its ResizeObserver measurement on the page element; the
 * canvas rect is the fallback, and the page box rect is the last resort (correct
 * because the page box shrink-wraps the canvas). Never substitute an intended
 * render width here.
 */
export function measuredPageWidth(pageEl) {
  if (!pageEl) return 0;

  const published = Number(pageEl.dataset?.measuredWidth);
  if (published > 0) return published;

  const canvas = pageEl.querySelector?.("canvas");
  const fromCanvas = canvas?.getBoundingClientRect?.().width;
  if (fromCanvas > 0) return fromCanvas;

  return pageEl.getBoundingClientRect?.().width || 0;
}

/** Measured page geometry in spot space, or null when the page is not rendered. */
export function measuredPageSizeInSpotSpace(pageEl) {
  if (!pageEl) return null;
  const measuredWidth = measuredPageWidth(pageEl);
  if (!(measuredWidth > 0)) return null;
  const rect = pageEl.getBoundingClientRect();
  return pageSizeInSpotSpace({ measuredWidth, measuredHeight: rect.height });
}

export const SPOT_MIN_WIDTH = 80;
export const SPOT_MIN_HEIGHT = 36;
export const SPOT_MAX_WIDTH = 600;
export const SPOT_MAX_HEIGHT = 400;
export const SPOT_COLLISION_PAD = 4;

export function spotPage(spot) {
  return Number(spot?.pageNum ?? spot?.PageNumber ?? 1) || 1;
}

export function spotRect(spot) {
  return {
    x: Number(spot?.x || 0),
    y: Number(spot?.y || 0),
    w: Math.max(1, Number(spot?.width || 130)),
    h: Math.max(1, Number(spot?.height || 48)),
    page: spotPage(spot),
  };
}

export function rectsOverlap(a, b, pad = SPOT_COLLISION_PAD) {
  if (a.page !== b.page) return false;
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export function clampSpotSize(width, height) {
  return {
    width: Math.max(SPOT_MIN_WIDTH, Math.min(SPOT_MAX_WIDTH, Number(width) || SPOT_MIN_WIDTH)),
    height: Math.max(SPOT_MIN_HEIGHT, Math.min(SPOT_MAX_HEIGHT, Number(height) || SPOT_MIN_HEIGHT)),
  };
}

/**
 * Returns true if `candidate` (merged spot) overlaps any other spot in the list.
 */
export function spotCollidesWithOthers(spots, index, candidate) {
  const cand = spotRect(candidate);
  for (let i = 0; i < spots.length; i++) {
    if (i === index) continue;
    if (rectsOverlap(cand, spotRect(spots[i]))) return true;
  }
  return false;
}

/** Client-fillable field types that should default to required. */
export function isFillableFieldType(fieldType) {
  const t = String(fieldType || "signature").toLowerCase();
  return [
    "signature",
    "initials",
    "email",
    "text",
    "date",
    "phone",
    "idnumber",
    "number",
    "checkbox",
    "clientstamp",
  ].includes(t);
}

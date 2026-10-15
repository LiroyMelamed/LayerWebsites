/**
 * Geometry helpers for signature spots (PDF page coordinates, unscaled).
 */

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

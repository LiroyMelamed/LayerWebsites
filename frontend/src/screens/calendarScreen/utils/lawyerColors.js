/**
 * Deterministic, premium navy/pastel palette used to color-code events by lawyer
 * (or any stable string/number key) in the firm-wide calendar view.
 *
 * Same key → same color across renders, page reloads, and sessions. The palette
 * is hand-picked for AA contrast against white text and the deep-navy theme.
 */

const PALETTE = [
    '#2A4365', // deep navy (primary)
    '#3182CE', // royal blue
    '#2C7A7B', // teal
    '#805AD5', // royal purple
    '#B83280', // magenta
    '#C05621', // burnt orange
    '#2F855A', // emerald
    '#D69E2E', // amber
    '#5A6B8C', // slate blue
    '#9F1239', // burgundy
    '#1E6091', // ocean blue
    '#553C9A', // indigo
];

const LEAVE_COLOR = '#718096'; // muted slate gray — distinct from any lawyer color

function _hash(input) {
    const str = String(input ?? '');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

/** Pick a stable palette color for a given key (e.g. lawyer id or name). */
export function colorForKey(key) {
    if (key == null || key === '') return PALETTE[0];
    return PALETTE[_hash(key) % PALETTE.length];
}

/** Firm-view color key: manager (מנהל) when set, otherwise event owner. */
export function colorKeyForEvent(ev) {
    return ev?.managerUserId ?? ev?.managerName ?? ev?.ownerId ?? ev?.ownerName ?? ev?.id;
}

/** Color reserved for leave/vacation events — visually distinct from any lawyer. */
export function leaveColor() {
    return LEAVE_COLOR;
}

/** Build a legend payload `{ id, name, color }[]` from a list of lawyers. */
export function buildLawyerLegend(lawyers = []) {
    return lawyers
        .map((l) => ({
            id: l?.UserId ?? l?.userid ?? l?.id ?? null,
            name: l?.Name ?? l?.name ?? '',
            color: colorForKey(l?.UserId ?? l?.userid ?? l?.id ?? l?.Name ?? l?.name ?? ''),
        }))
        .filter((l) => l.id != null && l.name);
}

const lawyerColors = {
    colorForKey,
    colorKeyForEvent,
    leaveColor,
    buildLawyerLegend,
};

export default lawyerColors;

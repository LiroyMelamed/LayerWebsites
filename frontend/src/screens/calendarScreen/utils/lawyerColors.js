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

/** Preset swatches for the event form (no free-form color picker). */
export const EVENT_COLOR_PRESETS = [...PALETTE];

/** Built-in fallbacks — must match migration CALENDAR_EVENT_TYPE_COLORS defaults. */
export const DEFAULT_EVENT_TYPE_COLORS = {
    appointment: '#2A4365',
    hearing: '#B83280',
    leave: '#718096',
    holiday: '#B7791F',
    reminder: '#3182CE',
};

/**
 * Platform-admin default color for an event type.
 * Reads live settings from window.__CALENDAR_TYPE_COLORS__ when available.
 */
export function getEventTypeDefaultColor(eventType) {
    const key = String(eventType || 'appointment').trim().toLowerCase();
    const live =
        (typeof window !== 'undefined' && window.__CALENDAR_TYPE_COLORS__ && typeof window.__CALENDAR_TYPE_COLORS__ === 'object')
            ? window.__CALENDAR_TYPE_COLORS__
            : null;
    const fromLive = live?.[key];
    if (typeof fromLive === 'string' && /^#[0-9a-fA-F]{6}$/.test(fromLive.trim())) {
        return fromLive.trim().toUpperCase();
    }
    return (DEFAULT_EVENT_TYPE_COLORS[key] || DEFAULT_EVENT_TYPE_COLORS.appointment).toUpperCase();
}

/**
 * True when the stored color is empty or exactly the type default —
 * i.e. not a lawyer-chosen custom swatch.
 */
export function isStockEventColor(storedRaw, eventType) {
    const stored = String(storedRaw || '').trim().toUpperCase();
    if (!stored) return true;
    const key = String(eventType || 'appointment').trim().toLowerCase();
    const typeDefault = getEventTypeDefaultColor(key).toUpperCase();
    const builtin = (DEFAULT_EVENT_TYPE_COLORS[key] || '').toUpperCase();
    if (stored === typeDefault || stored === builtin) return true;
    return false;
}

export function isPresetEventColor(color) {
    const c = String(color || '').trim().toUpperCase();
    return EVENT_COLOR_PRESETS.some((p) => p.toUpperCase() === c);
}

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
    return getEventTypeDefaultColor('leave');
}

/** Color reserved for firm holidays — visually distinct from leave and lawyer colors. */
export function holidayColor() {
    return getEventTypeDefaultColor('holiday');
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
    holidayColor,
    buildLawyerLegend,
};

export default lawyerColors;

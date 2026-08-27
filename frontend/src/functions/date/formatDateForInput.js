export function formatDateForInput(dateString) {
    if (!dateString) {
        return formatDateForInput(new Date());
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const p = _toDateParts(date);
    return `${p.day}/${p.month}/${p.year}`;
}

function _toDateParts(date, timeZone = 'Asia/Jerusalem') {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const byType = {};
    parts.forEach((p) => {
        byType[p.type] = p.value;
    });
    return byType;
}

export function formatDisplayDate(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.day}/${p.month}/${p.year}`;
}

export function formatDisplayDateTime(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export function formatDisplayTime(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.hour}:${p.minute}`;
}

export function formatDisplayWeekdayShort(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL', {
        timeZone,
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
    }).format(d);
}

export function parseDateInput(displayStr) {
    if (!displayStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(displayStr)) return displayStr;
    const m = displayStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return displayStr;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

export function formatDateTimeForInput(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d);
    return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`;
}

export function parseDateTimeInput(displayStr) {
    if (!displayStr) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(displayStr)) return displayStr;
    const m = displayStr.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})$/);
    if (!m) return displayStr;
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
}

/** ISO / Date → YYYY-MM-DD for BlockDateInput mode="date". */
export function toNativeDateValue(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const raw = String(dateString).trim();
    // Date-only civil value — keep as-is (no TZ reinterpretation).
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const fromDisplay = parseDateInput(raw);
    if (fromDisplay && /^\d{4}-\d{2}-\d{2}$/.test(fromDisplay)) return fromDisplay;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
}

/** ISO / Date → YYYY-MM-DDTHH:MM for BlockDateInput mode="datetime-local". */
/** dd/mm/yyyy (or passthrough) for reminder/email template [[date]] placeholders. */
export function formatTemplateDateValue(value) {
    if (value == null || value === '') return '';
    const native = toNativeDateValue(value);
    if (native && /^\d{4}-\d{2}-\d{2}$/.test(native)) {
        const [y, m, d] = native.split('-');
        return `${d}/${m}/${y}`;
    }
    return String(value).trim();
}

/** Normalize template_data object: date field → dd/mm/yyyy for API/preview. */
export function normalizeTemplateDateFields(data) {
    if (!data || typeof data !== 'object') return data || {};
    if (!data.date) return { ...data };
    return { ...data, date: formatTemplateDateValue(data.date) };
}

export function toNativeDateTimeValue(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const raw = String(dateString).trim();
    // Already a wall-clock datetime-local string (no Z/offset) — keep as-is.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
        return raw.slice(0, 16);
    }
    const fromDisplay = parseDateTimeInput(raw);
    if (
        fromDisplay
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(fromDisplay)
        && !/(Z|[+-]\d{2}:?\d{2})$/i.test(fromDisplay)
    ) {
        return fromDisplay.slice(0, 16);
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

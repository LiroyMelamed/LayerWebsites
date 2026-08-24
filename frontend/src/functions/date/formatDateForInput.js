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
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const fromDisplay = parseDateInput(raw);
    if (fromDisplay && /^\d{4}-\d{2}-\d{2}$/.test(fromDisplay)) return fromDisplay;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
}

/** ISO / Date → YYYY-MM-DDTHH:MM for BlockDateInput mode="datetime-local". */
export function toNativeDateTimeValue(dateString, { timeZone = 'Asia/Jerusalem' } = {}) {
    if (!dateString) return '';
    const raw = String(dateString).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
    const fromDisplay = parseDateTimeInput(raw);
    if (fromDisplay && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(fromDisplay)) {
        return fromDisplay.slice(0, 16);
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const p = _toDateParts(d, timeZone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

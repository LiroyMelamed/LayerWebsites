export function formatDateForInput(dateString) {
    if (!dateString) {
        return formatDateForInput(new Date());
    }
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
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
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

export function parseDateTimeInput(displayStr) {
    if (!displayStr) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(displayStr)) return displayStr;
    const m = displayStr.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})$/);
    if (!m) return displayStr;
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
}

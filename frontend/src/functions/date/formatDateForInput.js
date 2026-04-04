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

/** Parse <input type="datetime-local"> value as local wall time (no TZ shift). */
export function parseDatetimeLocal(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
    if (m) {
        const sec = m[6] != null ? Number(m[6]) : 0;
        return new Date(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            sec,
            0
        );
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Date / ISO → "YYYY-MM-DDTHH:MM" for datetime-local inputs (local timezone). */
export function toDatetimeLocal(val) {
    if (!val) return "";
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local calendar day YYYY-MM-DD from datetime-local wall time or Date. */
export function toLocalYmdFromInput(val) {
    const raw = String(val || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = parseDatetimeLocal(raw) || (val instanceof Date ? val : new Date(raw));
    if (!d || Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local calendar day from API ISO timestamps — never slice the UTC date portion. */
export function toLocalYmdFromApi(val) {
    const raw = String(val || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = val instanceof Date ? val : new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

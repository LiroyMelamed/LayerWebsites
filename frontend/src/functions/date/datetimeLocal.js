/** Tenant wall clock — never rely on browser/server local TZ. */
export const TENANT_TZ = "Asia/Jerusalem";

function _pad(n) {
    return String(n).padStart(2, "0");
}

/** Parts of an instant in Asia/Jerusalem. */
export function jerusalemParts(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: TENANT_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const by = {};
    for (const { type, value } of fmt.formatToParts(d)) {
        if (type !== "literal") by[type] = value;
    }
    const hour = by.hour === "24" ? 0 : Number(by.hour);
    return {
        year: Number(by.year),
        month: Number(by.month),
        day: Number(by.day),
        hour,
        minute: Number(by.minute),
        second: Number(by.second || 0),
    };
}

/**
 * Instant for y-m-d hh:mm[:ss] as Asia/Jerusalem wall time
 * (works even when the browser/OS is not on Israel time).
 */
export function zonedJerusalemInstant(year, month, day, hour = 0, minute = 0, second = 0) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    for (let i = 0; i < 4; i++) {
        const p = jerusalemParts(guess);
        if (!p) break;
        const desiredAsUtcMin = Date.UTC(year, month - 1, day, hour, minute, second) / 60000;
        const actualAsUtcMin = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 60000;
        const deltaMin = desiredAsUtcMin - actualAsUtcMin;
        if (deltaMin === 0) break;
        guess.setTime(guess.getTime() + deltaMin * 60000);
    }
    return guess;
}

/** Parse <input type="datetime-local"> / wall string as Jerusalem time (no browser TZ shift). */
export function parseDatetimeLocal(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
    if (m) {
        const sec = m[6] != null ? Number(m[6]) : 0;
        return zonedJerusalemInstant(
            Number(m[1]),
            Number(m[2]),
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            sec
        );
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, mo, d] = raw.split("-").map(Number);
        return zonedJerusalemInstant(y, mo, d, 0, 0, 0);
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Date / ISO → "YYYY-MM-DDTHH:MM" for datetime-local inputs (Jerusalem wall clock). */
export function toDatetimeLocal(val) {
    if (!val) return "";
    const p = jerusalemParts(val);
    if (!p) return "";
    return `${p.year}-${_pad(p.month)}-${_pad(p.day)}T${_pad(p.hour)}:${_pad(p.minute)}`;
}

/** Calendar day YYYY-MM-DD from datetime-local wall time or Date (Jerusalem). */
export function toLocalYmdFromInput(val) {
    const raw = String(val || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = parseDatetimeLocal(raw) || (val instanceof Date ? val : new Date(raw));
    if (!d || Number.isNaN(d.getTime())) return "";
    const p = jerusalemParts(d);
    if (!p) return "";
    return `${p.year}-${_pad(p.month)}-${_pad(p.day)}`;
}

/** Calendar day from API ISO timestamps — Jerusalem, never slice the UTC date portion. */
export function toLocalYmdFromApi(val) {
    const raw = String(val || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !raw.includes("T")) return raw;
    const p = jerusalemParts(val);
    if (!p) return "";
    return `${p.year}-${_pad(p.month)}-${_pad(p.day)}`;
}

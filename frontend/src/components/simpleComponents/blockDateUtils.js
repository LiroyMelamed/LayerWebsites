/** @typedef {{ dd: string, mm: string, yyyy: string, hh: string, mi: string }} DateSegments */

export const EMPTY_SEGMENTS = /** @type {DateSegments} */ ({
    dd: '',
    mm: '',
    yyyy: '',
    hh: '',
    mi: '',
});

const DATE_KEYS = ['dd', 'mm', 'yyyy'];
const DATETIME_KEYS = ['dd', 'mm', 'yyyy', 'hh', 'mi'];

export function segmentKeysForMode(mode) {
    return mode === 'datetime-local' ? DATETIME_KEYS : DATE_KEYS;
}

export function maxLengthForSegment(key) {
    if (key === 'yyyy') return 4;
    return 2;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function isValidDateParts(dd, mm, yyyy) {
    if (yyyy < 1900 || yyyy > 2100) return false;
    if (mm < 1 || mm > 12) return false;
    if (dd < 1 || dd > 31) return false;
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
    return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
}

function isValidTimeParts(hh, mi) {
    return hh >= 0 && hh <= 23 && mi >= 0 && mi <= 59;
}

/** Native value → segment strings for display. */
export function nativeToSegments(mode, value) {
    const raw = String(value || '').trim();
    if (!raw) return { ...EMPTY_SEGMENTS };

    const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) return { ...EMPTY_SEGMENTS };

    const segments = {
        dd: dateMatch[3],
        mm: dateMatch[2],
        yyyy: dateMatch[1],
        hh: '',
        mi: '',
    };

    if (mode === 'datetime-local') {
        const timeMatch = raw.match(/T(\d{2}):(\d{2})/);
        if (timeMatch) {
            segments.hh = timeMatch[1];
            segments.mi = timeMatch[2];
        }
    }

    return segments;
}

export function isSegmentsComplete(mode, segments) {
    const keys = segmentKeysForMode(mode);
    return keys.every((key) => {
        const len = String(segments[key] || '').length;
        return len === maxLengthForSegment(key);
    });
}

/** Complete + valid segments → native string, else null. */
export function segmentsToNative(mode, segments) {
    if (!isSegmentsComplete(mode, segments)) return null;

    const dd = Number(segments.dd);
    const mm = Number(segments.mm);
    const yyyy = Number(segments.yyyy);
    if (!isValidDateParts(dd, mm, yyyy)) return null;

    const datePart = `${segments.yyyy}-${segments.mm}-${segments.dd}`;
    if (mode === 'date') return datePart;

    const hh = Number(segments.hh);
    const mi = Number(segments.mi);
    if (!isValidTimeParts(hh, mi)) return null;
    return `${datePart}T${segments.hh}:${segments.mi}`;
}

/** Parse pasted text into segments (best effort). */
export function parsePastedSegments(mode, text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (m) {
        const seg = {
            dd: m[3],
            mm: m[2],
            yyyy: m[1],
            hh: m[4] || '',
            mi: m[5] || '',
        };
        if (mode === 'date') return { ...seg, hh: '', mi: '' };
        return seg;
    }

    m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
        let yyyy = m[3];
        if (yyyy.length === 2) yyyy = `20${yyyy}`;
        const seg = {
            dd: pad2(Number(m[1])),
            mm: pad2(Number(m[2])),
            yyyy: String(yyyy).padStart(4, '0').slice(-4),
            hh: m[4] ? pad2(Number(m[4])) : '',
            mi: m[5] ? pad2(Number(m[5])) : '',
        };
        if (mode === 'date') return { ...seg, hh: '', mi: '' };
        return seg;
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8) {
        const seg = {
            dd: digits.slice(0, 2),
            mm: digits.slice(2, 4),
            yyyy: digits.slice(4, 8),
            hh: digits.length >= 10 ? digits.slice(8, 10) : '',
            mi: digits.length >= 12 ? digits.slice(10, 12) : '',
        };
        if (mode === 'date') return { ...seg, hh: '', mi: '' };
        return seg;
    }

    return null;
}

export function sanitizeSegmentInput(key, raw) {
    const max = maxLengthForSegment(key);
    return String(raw || '').replace(/\D/g, '').slice(0, max);
}

/**
 * Digit-slot temporal masks — never allow more digits than the format permits.
 * Prevents floods like "20308/08/2026".
 */

const TEMPLATES = {
    date: '##/##/####',
    time: '##:##',
    'datetime-local': '##/##/#### ##:##',
};

function hashCount(template) {
    let n = 0;
    for (const ch of template) if (ch === '#') n += 1;
    return n;
}

/** Keep only digits, capped to the template slot count. */
export function extractTemporalDigits(type, raw) {
    const template = TEMPLATES[type];
    if (!template) return String(raw || '').replace(/\D/g, '');
    return String(raw || '').replace(/\D/g, '').slice(0, hashCount(template));
}

/**
 * Apply digits into ## slots. Separators appear only after the preceding digit.
 * Example datetime digits "100820261430" → "10/08/2026 14:30"
 */
export function applyTemporalDigitMask(type, rawOrDigits) {
    const template = TEMPLATES[type];
    if (!template) return String(rawOrDigits || '');
    const digits = extractTemporalDigits(type, rawOrDigits);
    if (!digits) return '';

    let out = '';
    let di = 0;
    for (let i = 0; i < template.length; i++) {
        const ch = template[i];
        if (ch === '#') {
            if (di >= digits.length) break;
            out += digits[di++];
        } else {
            // Emit separator only once the previous digit slot is filled.
            if (di === 0) break;
            if (di >= digits.length) {
                // Trailing separator while still typing next group — include it
                // only when there is at least one more digit pending in input... 
                // Standard UX: show separator as soon as prior group is complete.
                const slotsBefore = template.slice(0, i).split('#').length - 1;
                if (digits.length >= slotsBefore) out += ch;
                break;
            }
            out += ch;
        }
    }
    return out;
}

/** True when all digit slots are filled. */
export function isTemporalMaskComplete(type, maskedText) {
    const template = TEMPLATES[type];
    if (!template) return false;
    return extractTemporalDigits(type, maskedText).length === hashCount(template);
}

export function formatTemporalDisplay(type, rawValue) {
    const v = String(rawValue ?? '');
    if (!v) return '';
    if (type === 'date') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
    }
    if (type === 'datetime-local') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '';
    }
    if (type === 'time') {
        const m = v.match(/^(\d{2}):(\d{2})/);
        return m ? `${m[1]}:${m[2]}` : '';
    }
    return '';
}

/** Parse a fully-masked (or nearly complete) display string → native value. */
export function parseTemporalText(type, text) {
    const masked = applyTemporalDigitMask(type, text);
    if (!masked) return '';
    if (!isTemporalMaskComplete(type, masked)) return null;

    if (type === 'time') {
        const m = masked.match(/^(\d{2}):(\d{2})$/);
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (hh > 23 || mm > 59) return null;
        return `${m[1]}:${m[2]}`;
    }

    if (type === 'date') {
        const m = masked.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return null;
        const dd = Number(m[1]);
        const mo = Number(m[2]);
        const yyyy = Number(m[3]);
        if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null;
        return `${yyyy}-${m[2]}-${m[1]}`;
    }

    if (type === 'datetime-local') {
        const m = masked.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
        if (!m) return null;
        const dd = Number(m[1]);
        const mo = Number(m[2]);
        const yyyy = Number(m[3]);
        const hh = Number(m[4]);
        const mi = Number(m[5]);
        if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100 || hh > 23 || mi > 59) {
            return null;
        }
        return `${yyyy}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
    }

    return null;
}

export function temporalPlaceholder(type) {
    if (type === 'time') return 'HH:mm';
    if (type === 'date') return 'dd/mm/yyyy';
    return 'dd/mm/yyyy HH:mm';
}

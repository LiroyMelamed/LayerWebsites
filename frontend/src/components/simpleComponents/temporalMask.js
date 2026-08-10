/**
 * Digit-slot temporal masks — never allow more digits than the format permits.
 * Supports empty progressive typing and mid-field overwrite editing with caret restore.
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

export function getTemporalTemplate(type) {
    return TEMPLATES[type] || null;
}

export function getTemporalMaxDigits(type) {
    const template = TEMPLATES[type];
    return template ? hashCount(template) : 0;
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
            if (di === 0) break;
            if (di >= digits.length) {
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

/**
 * Map a caret position in the display string → digit-slot index to edit next
 * (count of digits strictly before caret).
 */
export function caretToDigitIndex(display, caret) {
    const safe = String(display || '');
    const pos = Math.max(0, Math.min(Number(caret) || 0, safe.length));
    return safe.slice(0, pos).replace(/\D/g, '').length;
}

/**
 * Map a digit-slot index → caret position in the fully masked display for
 * those digits. Places caret after the digit and skips following separators
 * so the next keystroke lands on the next slot.
 */
export function digitIndexToCaret(type, digitIndex) {
    const template = TEMPLATES[type];
    if (!template) return 0;
    const max = hashCount(template);
    const target = Math.max(0, Math.min(Number(digitIndex) || 0, max));
    if (target === 0) return 0;

    let seen = 0;
    for (let i = 0; i < template.length; i++) {
        if (template[i] !== '#') continue;
        seen += 1;
        if (seen === target) {
            let caret = i + 1;
            while (caret < template.length && template[caret] !== '#') caret += 1;
            return caret;
        }
    }
    return template.length;
}

/**
 * Snap a click caret onto the nearest digit boundary (start of nearest slot).
 */
export function snapCaretToDigitSlot(type, display, caret) {
    const template = TEMPLATES[type];
    if (!template) return caret;
    const digIdx = caretToDigitIndex(display, caret);
    // If caret sits on a separator, digIdx already points at the next digit slot.
    return digitIndexToCaret(type, digIdx);
}

/**
 * Insert/overwrite digits at a caret within an existing display value.
 * Full masks overwrite in-place (no flood / no corrupt append).
 * Incomplete masks insert until full, then overwrite.
 *
 * @returns {{ display: string, caret: number, digits: string }}
 */
export function editTemporalDigits(type, prevDisplay, incomingDigits, selectionStart, selectionEnd = selectionStart) {
    const template = TEMPLATES[type];
    const incoming = String(incomingDigits || '').replace(/\D/g, '');
    if (!template || !incoming) {
        const digits = extractTemporalDigits(type, prevDisplay);
        return {
            display: applyTemporalDigitMask(type, digits),
            caret: digitIndexToCaret(type, caretToDigitIndex(prevDisplay, selectionStart)),
            digits,
        };
    }

    const max = hashCount(template);
    let digits = extractTemporalDigits(type, prevDisplay).split('');
    let digStart = caretToDigitIndex(prevDisplay, selectionStart);
    let digEnd = caretToDigitIndex(prevDisplay, selectionEnd);

    if (digEnd < digStart) {
        const tmp = digStart;
        digStart = digEnd;
        digEnd = tmp;
    }

    // Replace selected digit range (if any), then write incoming digits.
    if (digEnd > digStart) {
        digits.splice(digStart, digEnd - digStart);
    }

    let writeAt = digStart;
    const wasFull = digits.length >= max;
    for (const ch of incoming) {
        if (writeAt >= max) {
            if (!wasFull && digits.length >= max) break;
            writeAt = max - 1;
        }
        if (writeAt < digits.length) {
            digits[writeAt] = ch;
        } else {
            digits.push(ch);
        }
        writeAt += 1;
        if (writeAt > max) writeAt = max;
    }

    if (digits.length > max) digits = digits.slice(0, max);

    const nextDigits = digits.join('');
    const display = applyTemporalDigitMask(type, nextDigits);
    return {
        display,
        caret: digitIndexToCaret(type, writeAt),
        digits: nextDigits,
    };
}

/**
 * Backspace/Delete within a masked temporal field.
 * @param {'backspace'|'delete'} direction
 */
export function deleteTemporalDigit(type, prevDisplay, selectionStart, selectionEnd = selectionStart, direction = 'backspace') {
    const template = TEMPLATES[type];
    if (!template) {
        return { display: '', caret: 0, digits: '' };
    }

    let digits = extractTemporalDigits(type, prevDisplay).split('');
    let digStart = caretToDigitIndex(prevDisplay, selectionStart);
    let digEnd = caretToDigitIndex(prevDisplay, selectionEnd);

    if (digEnd < digStart) {
        const tmp = digStart;
        digStart = digEnd;
        digEnd = tmp;
    }

    if (digEnd > digStart) {
        digits.splice(digStart, digEnd - digStart);
    } else if (direction === 'backspace') {
        if (digStart <= 0) {
            const display = applyTemporalDigitMask(type, digits.join(''));
            return { display, caret: 0, digits: digits.join('') };
        }
        digits.splice(digStart - 1, 1);
        digStart -= 1;
    } else if (direction === 'delete') {
        if (digStart >= digits.length) {
            const display = applyTemporalDigitMask(type, digits.join(''));
            return { display, caret: digitIndexToCaret(type, digStart), digits: digits.join('') };
        }
        digits.splice(digStart, 1);
    }

    const nextDigits = digits.join('');
    const display = applyTemporalDigitMask(type, nextDigits);
    return {
        display,
        caret: digitIndexToCaret(type, digStart),
        digits: nextDigits,
    };
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

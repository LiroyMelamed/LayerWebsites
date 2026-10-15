'use strict';
const { createAppError } = require('../../utils/appError');
const fail = (code, message, status = 400) => { throw createAppError(code, status, message); };
function courtNumber(value) {
    const s = String(value || '').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[‐‑‒–—−]/g, '-').trim();
    if (!/^\d{1,7}-(0[1-9]|1[0-2])-\d{2}$/.test(s)) fail('INVALID_COURT_NUMBER', 'מספר התיק צריך להיות בתבנית 12345-01-26');
    const [n, m, y] = s.split('-');
    if (Number(n) === 0) fail('INVALID_COURT_NUMBER', 'מספר תיק לא תקין');
    return `${Number(n)}-${m}-${y}`;
}
function phones(values) {
    if (!Array.isArray(values) || values.length > 7) fail('INVALID_RECIPIENTS', 'אפשר לבחור עד שבעה מוזמנים, בנוסף למספר העסק');
    const result = values.map(value => {
        let s = String(value || '').trim().replace(/[\s()-]/g, '');
        if (/^0[2-9]\d{7,8}$/.test(s)) s = '+972' + s.slice(1);
        if (/^972[2-9]\d{7,8}$/.test(s)) s = '+' + s;
        if (!/^\+[1-9]\d{7,14}$/.test(s)) fail('INVALID_PHONE', 'יש להזין מספר תקין עם קידומת מדינה');
        return s;
    });
    return [...new Set(result)];
}
function positiveId(value) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n <= 0) fail('INVALID_ID', 'מזהה לא תקין');
    return n;
}
function inviteLink(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'chat.whatsapp.com' && /^\/[A-Za-z0-9_-]+$/.test(u.pathname) && !u.search && !u.hash ? u.href : null; } catch { return null; }
}
module.exports = { fail, courtNumber, phones, positiveId, inviteLink };

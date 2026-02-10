function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTemplate(template, fields) {
    let out = String(template || '');
    for (const [key, raw] of Object.entries(fields || {})) {
        const safe = escapeHtml(String(raw ?? ''));
        out = out.split(`[[${key}]]`).join(safe);
    }
    return out;
}

function maskEmailForLog(email) {
    const e = String(email || '').trim();
    const at = e.indexOf('@');
    if (at <= 0) return '[redacted-email]';
    const name = e.slice(0, at);
    const domain = e.slice(at + 1);
    const safeName = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
    return `${safeName}@${domain}`;
}

module.exports = { renderTemplate, maskEmailForLog };

/**
 * Build a plain-text live preview of a reminder email body.
 * Fills [[placeholders]] from `fields`; empty values fall back to quoted Hebrew labels
 * (same style as the reminders import / add-modal preview box).
 */

const PREVIEW_PLACEHOLDER_LABELS = {
    client_name: '"שם הלקוח"',
    firm_name: 'שם המשרד',
    date: '"תאריך"',
    subject: '"נושא"',
    body: '"תוכן ההודעה"',
    case_title: '"שם התיק"',
    document_name: '"שם המסמך"',
    amount: '"סכום"',
    content_1: '"תוכן 1"',
    content_2: '"תוכן 2"',
    content_3: '"תוכן 3"',
};

function _htmlToPreviewText(raw) {
    return String(raw || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * @param {object|null} template - template from GET /reminders/templates (bodyHtml / body / bodyPreview)
 * @param {Record<string, string|null|undefined>} fields - placeholder values (client_name, body, …)
 * @returns {string}
 */
export function buildReminderBodyPreview(template, fields = {}) {
    const raw = template?.bodyHtml || template?.body || '';
    if (!raw && template?.bodyPreview) {
        // Fallback: static catalog preview when HTML is unavailable
        return String(template.bodyPreview);
    }
    let text = _htmlToPreviewText(raw);
    text = text.replace(/\[\[([^\]]+)\]\]/g, (_m, key) => {
        const val = fields[key];
        if (val != null && String(val).trim()) return String(val).trim();
        return PREVIEW_PLACEHOLDER_LABELS[key] || `"${key}"`;
    });
    return text;
}

export { PREVIEW_PLACEHOLDER_LABELS };

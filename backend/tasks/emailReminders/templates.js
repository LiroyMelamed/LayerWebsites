/**
 * Email reminder templates.
 *
 * Each key maps to a template with subject + body (HTML).
 * Uses [[placeholder]] syntax — rendered via renderTemplate().
 *
 * Admins pick a template_key when importing reminders from Excel;
 * the scheduler replaces placeholders at send-time.
 *
 * Additional templates can be defined via the REMINDER_EMAIL_TEMPLATES
 * environment variable (JSON array of { key, label, subject, body }).
 */

const BUILT_IN_TEMPLATES = {
    GENERAL: {
        key: 'GENERAL',
        label: 'תזכורת כללית',
        labelEn: 'General Reminder',
        description: 'תבנית כללית לשליחת תזכורת חופשית עם נושא וגוף הודעה מותאמים אישית.',
        subject: 'תזכורת: [[subject]]',
        body:
            'שלום <span style="font-weight:600;color:#1A365D;">[[client_name]]</span>,<br><br>' +
            '[[body]]<br><br>' +
            'בברכה,<br>[[firm_name]]',
    },
    COURT_DATE: {
        key: 'COURT_DATE',
        label: 'תזכורת מועד דיון',
        labelEn: 'Court Date Reminder',
        description: 'תזכורת ללקוח על מועד דיון קרב. כוללת תאריך דיון ופרטי תיק.',
        subject: 'תזכורת דיון בתאריך [[date]]',
        body:
            'שלום <span style="font-weight:600;color:#1A365D;">[[client_name]]</span>,<br><br>' +
            'ברצוננו להזכיר לך כי נקבע <strong>דיון</strong> בתאריך <span style="font-weight:600;color:#1A365D;">[[date]]</span>.' +
            '<br><br>תיק: <span style="font-weight:600;color:#1A365D;">[[case_title]]</span>' +
            '<br><br>נא להגיע בזמן ולהביא את כל המסמכים הנדרשים.' +
            '<br><br>בברכה,<br>[[firm_name]]',
    },
    DOCUMENT_REQUIRED: {
        key: 'DOCUMENT_REQUIRED',
        label: 'תזכורת להגשת מסמך',
        labelEn: 'Document Required Reminder',
        description: 'בקשה מלקוח להגיש מסמך נדרש עד מועד מסוים.',
        subject: 'תזכורת: נדרש מסמך – [[document_name]]',
        body:
            'שלום <span style="font-weight:600;color:#1A365D;">[[client_name]]</span>,<br><br>' +
            'נבקש להעביר את המסמך: <span style="font-weight:600;color:#1A365D;">[[document_name]]</span>' +
            '<br>מועד אחרון: <span style="font-weight:600;color:#1A365D;">[[date]]</span>' +
            '<br><br>בברכה,<br>[[firm_name]]',
    },
    LICENSE_RENEWAL: {
        key: 'LICENSE_RENEWAL',
        label: 'תזכורת חידוש רישיון',
        labelEn: 'License Renewal Reminder',
        description: 'תזכורת ללקוח על חידוש רישיון לפני תום תוקף.',
        subject: 'תזכורת לחידוש רישיון – [[client_name]]',
        body:
            'שלום <span style="font-weight:600;color:#1A365D;">[[client_name]]</span>,<br><br>' +
            'הרישיון שלך עומד לפוג בתאריך <span style="font-weight:600;color:#1A365D;">[[date]]</span>.' +
            '<br>נא לפנות אלינו בהקדם לחידוש.' +
            '<br><br>בברכה,<br>[[firm_name]]',
    },
    PAYMENT: {
        key: 'PAYMENT',
        label: 'תזכורת תשלום',
        labelEn: 'Payment Reminder',
        description: 'תזכורת תשלום ללקוח עם פירוט הסכום ומועד אחרון לתשלום.',
        subject: 'תזכורת תשלום – [[client_name]]',
        body:
            'שלום <span style="font-weight:600;color:#1A365D;">[[client_name]]</span>,<br><br>' +
            'ברצוננו להזכיר כי קיימת לך יתרת חוב בסך <span style="font-weight:600;color:#1A365D;">[[amount]]</span>.' +
            '<br>נא להסדיר את התשלום עד <span style="font-weight:600;color:#1A365D;">[[date]]</span>.' +
            '<br><br>בברכה,<br>[[firm_name]]',
    },
};

/**
 * Merge built-in templates with any extra templates from env var.
 * Env format: JSON array of { key, label, subject, body }.
 */
function getAllTemplates() {
    const templates = { ...BUILT_IN_TEMPLATES };

    const envRaw = process.env.REMINDER_EMAIL_TEMPLATES;
    if (envRaw) {
        try {
            const extras = JSON.parse(envRaw);
            if (Array.isArray(extras)) {
                for (const t of extras) {
                    if (t.key && t.label && t.subject && t.body) {
                        templates[t.key] = { ...t };
                    }
                }
            }
        } catch (err) {
            console.warn('[reminder-templates] Failed to parse REMINDER_EMAIL_TEMPLATES env var:', err.message);
        }
    }

    return templates;
}

/**
 * Get a template by key — checks built-in first, then DB.
 * Used by the scheduler when sending a reminder with a custom template.
 */
async function getTemplateByKey(key) {
    const builtIn = getAllTemplates();
    if (builtIn[key]) return builtIn[key];

    // Fallback to DB-stored custom templates
    try {
        const pool = require('../../config/db');
        const { rows } = await pool.query(
            'SELECT template_key, label, description, subject_template, body_html FROM reminder_templates WHERE template_key = $1',
            [key]
        );
        if (rows[0]) {
            return {
                key: rows[0].template_key,
                label: rows[0].label,
                description: rows[0].description || '',
                subject: rows[0].subject_template,
                body: rows[0].body_html,
            };
        }
    } catch (_) { /* table may not exist yet */ }

    return null;
}

/**
 * Replace [[key]] placeholders in a string with values from `fields`.
 */
function renderTemplate(template, fields) {
    if (!template) return '';
    return template.replace(/\[\[(\w+)\]\]/g, (_, key) => {
        const val = fields[key];
        if (val == null) return `[[${key}]]`;
        // Basic HTML escape
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    });
}

/**
 * Wrap an email body in the branded RTL HTML shell
 * (matching the design used by email campaign templates).
 */
function wrapEmailHtml(bodyHtml, { firmName = 'MelamedLaw', title = '' } = {}) {
    const headerTitle = title || firmName;
    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${headerTitle}</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="${firmName}" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">${headerTitle}</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">${bodyHtml}</div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; ${firmName}</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>`;
}

module.exports = { BUILT_IN_TEMPLATES, getAllTemplates, getTemplateByKey, renderTemplate, wrapEmailHtml };

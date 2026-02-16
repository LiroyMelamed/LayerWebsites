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
            'שלום [[client_name]],<br><br>' +
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
            'שלום [[client_name]],<br><br>' +
            'ברצוננו להזכיר לך כי נקבע <strong>דיון</strong> בתאריך <strong>[[date]]</strong>.' +
            '<br><br>תיק: <strong>[[case_title]]</strong>' +
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
            'שלום [[client_name]],<br><br>' +
            'נבקש להעביר את המסמך: <strong>[[document_name]]</strong>' +
            '<br>מועד אחרון: <strong>[[date]]</strong>' +
            '<br><br>בברכה,<br>[[firm_name]]',
    },
    LICENSE_RENEWAL: {
        key: 'LICENSE_RENEWAL',
        label: 'תזכורת חידוש רישיון',
        labelEn: 'License Renewal Reminder',
        description: 'תזכורת ללקוח על חידוש רישיון לפני תום תוקף.',
        subject: 'תזכורת לחידוש רישיון – [[client_name]]',
        body:
            'שלום [[client_name]],<br><br>' +
            'הרישיון שלך עומד לפוג בתאריך <strong>[[date]]</strong>.' +
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
            'שלום [[client_name]],<br><br>' +
            'ברצוננו להזכיר כי קיימת לך יתרת חוב בסך <strong>[[amount]]</strong>.' +
            '<br>נא להסדיר את התשלום עד <strong>[[date]]</strong>.' +
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
 * Wrap an email body in a styled RTL HTML shell.
 */
function wrapEmailHtml(bodyHtml, { firmName = 'MelamedLaw' } = {}) {
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: Arial, Helvetica, sans-serif; direction: rtl; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: #1a3c5e; color: #fff; padding: 18px 24px; font-size: 18px; font-weight: bold; }
    .body { padding: 24px; font-size: 15px; line-height: 1.7; color: #333; }
    .footer { padding: 16px 24px; font-size: 12px; color: #888; border-top: 1px solid #eee; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${firmName}</div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">הודעה זו נשלחה אוטומטית ממערכת ${firmName}.</div>
  </div>
</body>
</html>`;
}

module.exports = { BUILT_IN_TEMPLATES, getAllTemplates, renderTemplate, wrapEmailHtml };

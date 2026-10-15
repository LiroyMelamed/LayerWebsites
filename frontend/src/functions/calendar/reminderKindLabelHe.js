/** Full Hebrew labels — same as reminder template picker (emailReminders BUILT_IN + custom). */
export const REMINDER_KIND_LABELS = {
    GENERAL: 'תזכורת כללית',
    COURT_DATE: 'תזכורת מועד דיון',
    DOCUMENT_REQUIRED: 'תזכורת להגשת מסמך',
    LICENSE_RENEWAL: 'תזכורת חידוש רישיון',
    PAYMENT: 'תזכורת תשלום',
};

/**
 * Label for {{meetingTypeLabel}} when event_type === 'reminder'.
 * Prefer the template row label (e.g. "תזכורת מסמכים – מלמדיה") when available.
 */
export function reminderKindLabelHe(reminderTemplateKey = 'GENERAL', {
    title = '',
    subject = '',
    templateLabel = '',
} = {}) {
    const customLabel = String(templateLabel || '').trim();
    if (customLabel) return customLabel;

    const key = String(reminderTemplateKey || 'GENERAL').trim().toUpperCase();
    if (REMINDER_KIND_LABELS[key]) return REMINDER_KIND_LABELS[key];

    const fallback = String(title || subject || '').trim();
    if (fallback) {
        return /^תזכורת(\s|:|$)/i.test(fallback) ? fallback : `תזכורת ${fallback}`;
    }
    return REMINDER_KIND_LABELS.GENERAL;
}

export function supportsCalendarInviteSms(eventType = '') {
    const et = String(eventType || '').trim().toLowerCase();
    return et === 'appointment' || et === 'hearing';
}

/** Calendar event_type=reminder: "זוהי תזכורת מועד דיון" not "זוהי תזכורת לדיון". */
export function adaptClientReminderSmsForReminderEvent(text) {
    let s = String(text || '');
    if (!s) return s;
    return s
        .replace(/זוהי תזכורת ל\{\{meetingTypeLabel\}\}/g, 'זוהי {{meetingTypeLabel}}')
        .replace(/זוהי תזכורת ל{{meetingTypeLabel}}/g, 'זוהי {{meetingTypeLabel}}');
}

export const DEFAULT_CLIENT_REMINDER_SMS_REMINDER =
    'שלום {{recipientName}},\n'
    + 'זוהי {{meetingTypeLabel}} שנקבעה עבורך ב{{firmName}}\n'
    + 'בתאריך {{date}} בשעה {{time}}.\n'
    + 'כתובתנו הינה {{address}}\n'
    + 'להוראות הגעה בוויז {{wazeUrl}}\n'
    + 'לבירור או שינוי נא להתקשר ל {{firmPhone}}\n'
    + 'מידע נוסף ניתן למצוא באתר שלנו\n'
    + '{{websiteUrl}}';

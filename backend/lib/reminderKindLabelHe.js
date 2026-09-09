'use strict';

/** Full Hebrew labels — same as reminder template picker (emailReminders BUILT_IN + custom). */
const REMINDER_KIND_LABELS = {
    GENERAL: 'תזכורת כללית',
    COURT_DATE: 'תזכורת מועד דיון',
    DOCUMENT_REQUIRED: 'תזכורת להגשת מסמך',
    LICENSE_RENEWAL: 'תזכורת חידוש רישיון',
    PAYMENT: 'תזכורת תשלום',
};

function reminderKindLabelHe(reminderTemplateKey = 'GENERAL', {
    title = '',
    subject = '',
    templateLabel = '',
} = {}) {
    const eventTitle = String(title || subject || '').trim();
    const key = String(reminderTemplateKey || 'GENERAL').trim().toUpperCase();

    // Calendar title is what staff typed — prefer it over generic template labels.
    if (eventTitle) {
        if (key !== 'GENERAL' && REMINDER_KIND_LABELS[key]) {
            return `${REMINDER_KIND_LABELS[key]}: ${eventTitle}`;
        }
        return eventTitle;
    }

    const customLabel = String(templateLabel || '').trim();
    if (customLabel) return customLabel;

    if (REMINDER_KIND_LABELS[key]) return REMINDER_KIND_LABELS[key];

    return REMINDER_KIND_LABELS.GENERAL;
}

function supportsCalendarInviteSms(eventType = '') {
    const et = String(eventType || '').trim().toLowerCase();
    return et === 'appointment' || et === 'hearing';
}

function adaptClientReminderSmsForReminderEvent(text) {
    let s = String(text || '');
    if (!s) return s;
    return s
        .replace(/זוהי תזכורת ל\{\{meetingTypeLabel\}\}/g, 'זוהי {{meetingTypeLabel}}')
        .replace(/זוהי תזכורת ל{{meetingTypeLabel}}/g, 'זוהי {{meetingTypeLabel}}');
}

const DEFAULT_CLIENT_REMINDER_SMS_REMINDER =
    'שלום {{recipientName}},\n'
    + 'זוהי {{meetingTypeLabel}} שנקבעה עבורך ב{{firmName}}\n'
    + 'בתאריך {{date}} בשעה {{time}}.\n'
    + 'כתובתנו הינה {{address}}\n'
    + 'להוראות הגעה בוויז {{wazeUrl}}\n'
    + 'לבירור או שינוי נא להתקשר ל {{firmPhone}}\n'
    + 'מידע נוסף ניתן למצוא באתר שלנו\n'
    + '{{websiteUrl}}';

module.exports = {
    REMINDER_KIND_LABELS,
    reminderKindLabelHe,
    supportsCalendarInviteSms,
    adaptClientReminderSmsForReminderEvent,
    DEFAULT_CLIENT_REMINDER_SMS_REMINDER,
};

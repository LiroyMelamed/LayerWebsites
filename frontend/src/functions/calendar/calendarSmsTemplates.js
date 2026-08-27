import {
    adaptClientReminderSmsForReminderEvent,
    DEFAULT_CLIENT_REMINDER_SMS_REMINDER,
} from './reminderKindLabelHe';

/** Hearing events only — calendar תזכורת events use full template labels. */
export function usesHearingSmsTemplates(eventType) {
    return String(eventType || '').trim().toLowerCase() === 'hearing';
}

/** Replace legacy hardcoded "פגישה"/"דיון" with {{meetingTypeLabel}} for dynamic previews + sends. */
export function upgradeLegacyCalendarSmsTemplate(text) {
    let s = String(text || '');
    if (!s || s.includes('{{meetingTypeLabel}}')) return s;
    return s
        .replace(/זוהי תזכורת לפגישה/g, 'זוהי תזכורת ל{{meetingTypeLabel}}')
        .replace(/זוהי תזכורת לדיון/g, 'זוהי תזכורת ל{{meetingTypeLabel}}')
        .replace(/נקבעה לך פגישה/g, 'נקבעה לך {{meetingTypeLabel}}')
        .replace(/נקבעה לך דיון/g, 'נקבעה לך {{meetingTypeLabel}}')
        .replace(/הוזמנת לדיון/g, 'הוזמנת ל{{meetingTypeLabel}}');
}

export function pickCalendarSmsPair(templates, eventType) {
    const et = String(eventType || '').trim().toLowerCase();
    if (et === 'reminder') {
        const raw = upgradeLegacyCalendarSmsTemplate(
            templates?.reminderEventReminder || templates?.appointmentReminder
        );
        return {
            clientReminder: adaptClientReminderSmsForReminderEvent(
                raw || DEFAULT_CLIENT_REMINDER_SMS_REMINDER
            ),
            invite: '',
        };
    }
    const hearing = usesHearingSmsTemplates(eventType);
    const appointmentReminder = upgradeLegacyCalendarSmsTemplate(templates?.appointmentReminder);
    const hearingReminder = upgradeLegacyCalendarSmsTemplate(
        templates?.hearingReminder || templates?.appointmentReminder
    );
    const appointmentInvite = upgradeLegacyCalendarSmsTemplate(templates?.appointmentInvite);
    const hearingInvite = upgradeLegacyCalendarSmsTemplate(
        templates?.hearingInvite || templates?.appointmentInvite
    );
    return {
        clientReminder: hearing ? hearingReminder : appointmentReminder,
        invite: hearing ? hearingInvite : appointmentInvite,
    };
}

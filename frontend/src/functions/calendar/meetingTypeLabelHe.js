import { reminderKindLabelHe } from './reminderKindLabelHe';

/**
 * Hebrew phrase for calendar SMS {{meetingTypeLabel}} — not always "פגישה".
 * Mirrors backend/lib/publicShortLinks.js meetingTypeLabelHe.
 */
export function meetingTypeLabelHe(
    meetingType,
    eventType = '',
    title = '',
    reminderTemplateKey = '',
    subject = '',
    templateLabel = '',
) {
    const et = String(eventType || '').trim().toLowerCase();
    const eventTitle = String(title || '').trim();

    if (et === 'hearing') return 'דיון';
    if (et === 'reminder') {
        return reminderKindLabelHe(reminderTemplateKey, {
            title: eventTitle,
            subject,
            templateLabel,
        });
    }
    if (et === 'holiday') return eventTitle || 'חג';
    if (et === 'leave') return eventTitle || 'חופשה';

    const mt = String(meetingType || '').trim().toLowerCase();
    if (mt === 'zoom') return 'פגישת זום';
    if (mt === 'frontal') return 'פגישה פרונטלית';
    if (mt === 'phone') return 'פגישה טלפונית';
    if (mt === 'other') return eventTitle || 'פגישה';

    if (eventTitle) return eventTitle;
    return 'אירוע';
}

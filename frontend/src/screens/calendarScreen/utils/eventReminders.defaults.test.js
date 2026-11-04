import { configuredReminderOffsets } from './eventReminders';
const allowed = [0, 30, 60, 120, 1440, 2880, 10080];
test('lawyer and client defaults are independent; empty explicitly means no reminders', () => {
    const settings = { CALENDAR_LAWYER_REMINDER_DEFAULTS: { effectiveValue: '10080,1440' }, CALENDAR_CLIENT_REMINDER_DEFAULTS: { effectiveValue: '' } };
    expect(configuredReminderOffsets(settings, 'lawyer', allowed)).toEqual([10080, 1440]);
    expect(configuredReminderOffsets(settings, 'client', allowed)).toEqual([]);
});
test('unavailable offsets are removed and missing settings retain the old defaults', () => {
    expect(configuredReminderOffsets({ CALENDAR_CLIENT_REMINDER_DEFAULTS: { effectiveValue: '10,60,60,abc' } }, 'client', allowed)).toEqual([60]);
    expect(configuredReminderOffsets({}, 'lawyer', allowed)).toEqual([2880,1440,120,60,30]);
});

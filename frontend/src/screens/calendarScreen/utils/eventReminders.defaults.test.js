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

test('channel defaults are independent, filtered, and preserve explicit empty choices', () => {
    const { configuredReminderChannels, normalizeSelectedChannels, parseStoredChannels } = require('./eventReminders');
    const value = configuredReminderChannels({
        CALENDAR_LAWYER_REMINDER_CHANNEL_DEFAULTS: { effectiveValue: 'email,push' },
        CALENDAR_CLIENT_REMINDER_CHANNEL_DEFAULTS: { effectiveValue: 'sms' },
    }, ['sms', 'email']);
    expect(value.lawyer).toEqual({push:false,sms:false,email:true});
    expect(value.client).toEqual({push:false,sms:true,email:false});
    expect(value.sms && value.email).toBe(true);
    expect(configuredReminderChannels({CALENDAR_CLIENT_REMINDER_CHANNEL_DEFAULTS:{effectiveValue:''}}).client).toEqual({push:false,sms:false,email:false});
    expect(normalizeSelectedChannels(value,['email']).client.sms).toBe(false);
    expect(parseStoredChannels({sms:true,email:false,push:false})).toEqual({sms:true,email:false,push:false});
});

-- Default reminder channel for lawyers, next to the existing client default.

BEGIN;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'CALENDAR_LAWYER_REMINDER_CHANNEL_DEFAULTS', 'push,sms', 'string',
       'סוג ההתראה לעורכי דין',
       'ערוצים שמסומנים מראש בתזכורת חדשה לעורך דין. ריק = בלי ערוץ.'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings
    WHERE category = 'calendar' AND setting_key = 'CALENDAR_LAWYER_REMINDER_CHANNEL_DEFAULTS'
);

COMMIT;

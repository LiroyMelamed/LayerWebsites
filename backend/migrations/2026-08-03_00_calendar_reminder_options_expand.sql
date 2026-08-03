-- Expand default calendar reminder offset options to include 2 days and 1 week.
UPDATE platform_settings
SET value = '15,30,60,120,1440,2880,10080',
    updated_at = NOW()
WHERE category = 'calendar'
  AND key = 'CALENDAR_REMINDER_OPTIONS'
  AND (value IS NULL OR value = '' OR value = '15,30,60,120,1440');

INSERT INTO platform_settings (category, key, value, value_type, label, description)
SELECT 'calendar', 'CALENDAR_REMINDER_OPTIONS', '15,30,60,120,1440,2880,10080', 'string',
       'אפשרויות תזכורת לאירוע', 'דקות לפני תחילת האירוע'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND key = 'CALENDAR_REMINDER_OPTIONS'
);

-- Migration: Per-event reminder offsets (lawyer-selected, not automatic)

BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS reminder_offsets JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS reminders_sent_offsets JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN calendar_events.reminder_offsets IS
    'Minutes-before-start push reminders chosen for this event, e.g. [1440, 30]. Empty = no reminders.';
COMMENT ON COLUMN calendar_events.reminders_sent_offsets IS
    'Offsets already dispatched by the reminder worker. Reset when start_time or reminder_offsets change.';

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'CALENDAR_REMINDER_OPTIONS', '15,30,60,120,1440', 'string',
     'אפשרויות תזכורת לעורכי דין',
     'רשימת מרווחי תזכורת (בדקות לפני האירוע) שעורכי דין יכולים לבחור בעת יצירת אירוע. לדוגמה: 30 = חצי שעה לפני, 1440 = יום לפני.')
ON CONFLICT (category, setting_key) DO NOTHING;

UPDATE platform_settings
SET description = 'הפעלה/כיבוי של מנגנון שליחת תזכורות Push לאירועים. עורכי דין בוחרים תזכורות לכל אירוע בנפרד.'
WHERE category = 'calendar' AND setting_key = 'CALENDAR_REMINDERS_ENABLED';

UPDATE platform_settings
SET label = 'מנגנון תזכורות Push פעיל'
WHERE category = 'calendar' AND setting_key = 'CALENDAR_REMINDERS_ENABLED';

COMMIT;

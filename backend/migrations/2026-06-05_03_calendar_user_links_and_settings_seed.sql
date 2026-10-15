-- Migration: Add user-link columns for calendar event participants and ensure calendar settings are seeded

BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS client_user_id INTEGER NULL REFERENCES users(userid) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS manager_user_id INTEGER NULL REFERENCES users(userid) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_client_user_id
    ON calendar_events (client_user_id)
    WHERE client_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_manager_user_id
    ON calendar_events (manager_user_id)
    WHERE manager_user_id IS NOT NULL;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'CALENDAR_REMINDERS_ENABLED', 'true', 'boolean', 'תזכורות יומן פעילות', 'האם להפעיל תזכורות אוטומטיות (יום לפני ו-30 דקות לפני האירוע)'),
    ('calendar', 'CALENDAR_REMINDERS_POLL_MINUTES', '5', 'number', 'תדירות בדיקת תזכורות (דקות)', 'כל כמה דקות מנגנון התזכורות יסרוק אירועים קרובים')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

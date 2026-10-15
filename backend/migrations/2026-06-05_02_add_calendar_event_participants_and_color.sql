-- Migration: Add optional participant metadata + color coding fields to calendar events
-- Purpose:
--   - client_name / manager_name: lightweight attendee context for legal appointments
--   - color: per-event color tag (HEX #RRGGBB) for visual categorization (vacation, court, etc.)

BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS client_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS manager_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS color TEXT NULL;

-- Optional safety constraint for UI-provided colors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_calendar_events_color_hex'
    ) THEN
        ALTER TABLE calendar_events
            ADD CONSTRAINT chk_calendar_events_color_hex
            CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
    END IF;
END $$;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'CALENDAR_REMINDERS_ENABLED', 'true', 'boolean', 'תזכורות יומן פעילות', 'האם להפעיל תזכורות אוטומטיות (יום לפני ו-30 דקות לפני האירוע)'),
    ('calendar', 'CALENDAR_REMINDERS_POLL_MINUTES', '5', 'number', 'תדירות בדיקת תזכורות (דקות)', 'כל כמה דקות מנגנון התזכורות יסרוק אירועים קרובים')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

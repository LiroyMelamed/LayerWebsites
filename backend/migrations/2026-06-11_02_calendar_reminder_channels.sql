-- Migration: Per-event reminder delivery channels (push / SMS / email)

BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS reminder_channels JSONB NOT NULL DEFAULT '{"push":false,"sms":false,"email":false}'::jsonb;

COMMENT ON COLUMN calendar_events.reminder_channels IS
    'Delivery channels for calendar reminders: { push, sms, email } booleans chosen per event.';

INSERT INTO notification_channel_config (notification_type, label, push_enabled, email_enabled, sms_enabled, admin_cc, manager_cc)
VALUES ('CALENDAR_REMINDER', 'תזכורות יומן', TRUE, TRUE, TRUE, FALSE, FALSE)
ON CONFLICT (notification_type) DO NOTHING;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'CALENDAR_REMINDER_CHANNELS', 'push,sms,email', 'string',
     'ערוצי תזכורת זמינים לעורכי דין',
     'אילו ערוצי שליחה (push, sms, email) עורכי דין יכולים לבחור בעת יצירת תזכורות לאירוע.')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

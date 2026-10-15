-- Birthday greetings: add notification channel config row, SMS template,
-- and a tracking table to prevent duplicate sends per day.

BEGIN;

-- ─── 1) Notification channel config for birthday greetings ──────────
INSERT INTO notification_channel_config (notification_type, label, push_enabled, email_enabled, sms_enabled, admin_cc)
VALUES
    ('BIRTHDAY', 'ברכת יום הולדת', TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (notification_type) DO NOTHING;

-- ─── 2) Birthday SMS template in platform_settings ──────────────────
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('templates', 'BIRTHDAY_SMS', '{{firmName}} מאחלת לך מזל טוב ליום הולדתך, {{recipientName}}! 🎂🎉', 'string',
     'תבנית SMS - יום הולדת', 'תבנית SMS לברכת יום הולדת. משתנים: {{recipientName}}, {{firmName}}, {{websiteUrl}}'),
    ('notifications', 'BIRTHDAY_GREETINGS_ENABLED', 'true', 'boolean',
     'ברכות יום הולדת', 'שליחת ברכת יום הולדת אוטומטית ללקוחות')
ON CONFLICT (category, setting_key) DO NOTHING;

-- ─── 3) Tracking table to avoid sending duplicate birthday greetings ─
CREATE TABLE IF NOT EXISTS birthday_greetings_sent (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    sent_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, sent_date)
);

GRANT SELECT, INSERT, DELETE ON birthday_greetings_sent          TO liroym;
GRANT USAGE, SELECT ON SEQUENCE birthday_greetings_sent_id_seq   TO liroym;

COMMIT;

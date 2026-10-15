-- Platform settings: dynamic key-value store that overrides .env defaults.
-- Platform admin management with DB-based permissions (replaces env-only allowlist).

BEGIN;

-- ─── 1) platform_settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
    id            SERIAL PRIMARY KEY,
    category      VARCHAR(50)  NOT NULL,
    setting_key   VARCHAR(100) NOT NULL,
    setting_value TEXT,
    value_type    VARCHAR(20)  NOT NULL DEFAULT 'string',  -- string | number | boolean | json
    label         VARCHAR(200),
    description   TEXT,
    updated_by    INTEGER      REFERENCES users(userid) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(category, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_category
    ON platform_settings (category);

-- ─── 2) platform_admins ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    name       VARCHAR(200),
    added_by   INTEGER      REFERENCES users(userid) ON DELETE SET NULL,
    added_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE(user_id)
);

-- ─── 3) notification_channel_config ─────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_channel_config (
    id                 SERIAL PRIMARY KEY,
    notification_type  VARCHAR(50) NOT NULL UNIQUE,
    label              VARCHAR(200),
    push_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by         INTEGER REFERENCES users(userid) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default notification types (admin_cc added by later migration 2026-02-26)
INSERT INTO notification_channel_config (notification_type, label, push_enabled, email_enabled, sms_enabled)
VALUES
    ('CASE_UPDATE',     'עדכון תיק',          TRUE, TRUE, TRUE),
    ('SIGN_INVITE',     'הזמנה לחתימה',       TRUE, TRUE, TRUE),
    ('SIGN_REMINDER',   'תזכורת חתימה',       TRUE, TRUE, TRUE),
    ('DOC_SIGNED',      'מסמך נחתם',          TRUE, TRUE, TRUE),
    ('DOC_REJECTED',    'מסמך נדחה',          TRUE, TRUE, TRUE),
    ('PAYMENT',         'תזכורת תשלום',       TRUE, TRUE, TRUE),
    ('LICENSE_RENEWAL', 'חידוש רישיון',       TRUE, TRUE, TRUE),
    ('GENERAL',         'הודעה כללית',        TRUE, TRUE, TRUE)
ON CONFLICT (notification_type) DO NOTHING;

-- ─── 4) Seed initial settings from common env vars ──────────────────
-- These will serve as DB-stored defaults. The actual values should be
-- populated from the running .env by the platform admin via the UI.
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    -- Messaging
    ('messaging', 'SMOOVE_SENDER_PHONE',      '0559199044', 'string',  'מספר שולח SMS',          'מספר הטלפון ממנו נשלחות הודעות SMS — ניתן לשנות בעמוד ההגדרות'),
    ('messaging', 'SMOOVE_EMAIL_FROM_NAME',    NULL, 'string',  'שם שולח אימייל',         'השם שיופיע כשולח באימיילים'),
    ('messaging', 'SMOOVE_EMAIL_FROM_EMAIL',   NULL, 'string',  'כתובת שולח אימייל',      'כתובת האימייל של השולח'),
    ('messaging', 'SMTP_FROM_EMAIL',           NULL, 'string',  'כתובת SMTP שולח',        'כתובת השולח ב-SMTP'),

    -- Signing
    ('signing',   'SIGNING_OTP_ENABLED',        NULL, 'boolean', 'OTP בחתימה',             'האם נדרש OTP בעת חתימה על מסמכים'),
    ('signing',   'SIGNING_REQUIRE_OTP_DEFAULT', NULL, 'boolean', 'OTP ברירת מחדל',        'ברירת מחדל לדרישת OTP בחתימות חדשות'),

    -- Firm
    ('firm',      'FIRM_NAME',                  NULL, 'string',  'שם המשרד (אנגלית)',      'שם המשרד באנגלית — מופיע בתבניות אימייל תזכורות (בחתימה בסוף המייל) ובמסמכים שנשלחים ללקוחות באנגלית'),
    ('firm',      'LAW_FIRM_NAME',              NULL, 'string',  'שם המשרד (עברית)',       'שם המשרד בעברית — מופיע בהודעות SMS של יום הולדת ללקוחות, ובתבניות תזכורות שנשלחות בעברית'),

    -- Reminders
    ('reminders', 'LICENSE_RENEWAL_REMINDERS_CEO_EMAIL', NULL, 'string',  'אימייל מנכ"ל לתזכורות', 'כתובת אימייל לשליחת תזכורות רישיון'),
    ('reminders', 'LICENSE_RENEWAL_REMINDERS_CEO_NAME',  NULL, 'string',  'שם מנכ"ל לתזכורות',     'שם המנכ"ל שיופיע בתזכורות רישיון'),
    ('reminders', 'EMAIL_REMINDERS_START_HOUR',          NULL, 'time',    'שעת התחלת שליחה',        'שעת ההתחלה לשליחת תזכורות'),
    ('reminders', 'EMAIL_REMINDERS_END_HOUR',            NULL, 'time',    'שעת סיום שליחה',         'שעת הסיום לשליחת תזכורות')
ON CONFLICT (category, setting_key) DO NOTHING;

-- ─── 5) Grants ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_settings            TO liroym;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_admins              TO liroym;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_channel_config  TO liroym;
GRANT USAGE, SELECT ON SEQUENCE platform_settings_id_seq             TO liroym;
GRANT USAGE, SELECT ON SEQUENCE platform_admins_id_seq               TO liroym;
GRANT USAGE, SELECT ON SEQUENCE notification_channel_config_id_seq   TO liroym;

COMMIT;

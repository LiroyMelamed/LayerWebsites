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

-- Seed default notification types
INSERT INTO notification_channel_config (notification_type, label, push_enabled, email_enabled, sms_enabled)
VALUES
    ('CASE_UPDATE',     'עדכון תיק',          TRUE, TRUE, FALSE),
    ('SIGN_INVITE',     'הזמנה לחתימה',       TRUE, TRUE, TRUE),
    ('SIGN_REMINDER',   'תזכורת חתימה',       TRUE, TRUE, TRUE),
    ('DOC_SIGNED',      'מסמך נחתם',          TRUE, TRUE, FALSE),
    ('DOC_REJECTED',    'מסמך נדחה',          TRUE, TRUE, FALSE),
    ('PAYMENT',         'תזכורת תשלום',       TRUE, TRUE, FALSE),
    ('LICENSE_RENEWAL', 'חידוש רישיון',       TRUE, TRUE, FALSE),
    ('GENERAL',         'הודעה כללית',        TRUE, TRUE, FALSE)
ON CONFLICT (notification_type) DO NOTHING;

-- ─── 4) Seed initial settings from common env vars ──────────────────
-- These will serve as DB-stored defaults. The actual values should be
-- populated from the running .env by the platform admin via the UI.
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    -- Messaging
    ('messaging', 'SMOOVE_SENDER_PHONE',      NULL, 'string',  'מספר שולח SMS',          'מספר הטלפון ממנו נשלחות הודעות SMS'),
    ('messaging', 'SMOOVE_EMAIL_FROM_NAME',    NULL, 'string',  'שם שולח אימייל',         'השם שיופיע כשולח באימיילים'),
    ('messaging', 'SMOOVE_EMAIL_FROM_EMAIL',   NULL, 'string',  'כתובת שולח אימייל',      'כתובת האימייל של השולח'),
    ('messaging', 'SMTP_FROM_EMAIL',           NULL, 'string',  'כתובת SMTP שולח',        'כתובת השולח ב-SMTP'),

    -- Signing
    ('signing',   'SIGNING_OTP_ENABLED',        NULL, 'boolean', 'OTP בחתימה',             'האם נדרש OTP בעת חתימה על מסמכים'),
    ('signing',   'SIGNING_REQUIRE_OTP_DEFAULT', NULL, 'boolean', 'OTP ברירת מחדל',        'ברירת מחדל לדרישת OTP בחתימות חדשות'),

    -- Firm
    ('firm',      'FIRM_NAME',                  NULL, 'string',  'שם המשרד (אנגלית)',      'שם המשרד באנגלית'),
    ('firm',      'LAW_FIRM_NAME',              NULL, 'string',  'שם המשרד (עברית)',       'שם המשרד בעברית'),
    ('firm',      'FIRM_DEFAULT_UNLIMITED_UNTIL_UTC', NULL, 'string', 'תוקף חבילה ללא הגבלה', 'תאריך תפוגה של תוקף בלתי מוגבל (ISO-8601)'),

    -- Reminders
    ('reminders', 'LICENSE_RENEWAL_REMINDERS_CEO_EMAIL', NULL, 'string',  'אימייל מנכ"ל לתזכורות', 'כתובת אימייל לשליחת תזכורות רישיון'),
    ('reminders', 'LICENSE_RENEWAL_REMINDERS_CEO_NAME',  NULL, 'string',  'שם מנכ"ל לתזכורות',     'שם המנכ"ל שיופיע בתזכורות רישיון'),
    ('reminders', 'EMAIL_REMINDERS_START_HOUR',          NULL, 'number',  'שעת התחלת שליחה',        'שעת ההתחלה לשליחת תזכורות (0-23)'),
    ('reminders', 'EMAIL_REMINDERS_END_HOUR',            NULL, 'number',  'שעת סיום שליחה',         'שעת הסיום לשליחת תזכורות (0-23)'),
    ('reminders', 'EMAIL_REMINDERS_POLL_MINUTES',        NULL, 'number',  'תדירות בדיקה (דקות)',   'כל כמה דקות לבדוק תזכורות חדשות'),
    ('reminders', 'EMAIL_REMINDERS_BATCH_SIZE',          NULL, 'number',  'גודל אצווה',            'כמה תזכורות לשלוח בכל סבב'),

    -- Security
    ('security',  'OTP_MAX_ATTEMPTS',           NULL, 'number',  'מקסימום ניסיונות OTP',   'מספר ניסיונות כושלים לפני חסימה'),
    ('security',  'OTP_LOCKOUT_MS',             NULL, 'number',  'זמן חסימה (מילישניות)', 'משך זמן חסימה לאחר ניסיונות כושלים'),
    ('security',  'SECURITY_LOG_RETENTION_DAYS', NULL, 'number', 'שמירת לוגים (ימים)',     'כמה ימים לשמור לוגים אבטחתיים')
ON CONFLICT (category, setting_key) DO NOTHING;

-- ─── 5) Grants ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_settings            TO liroym;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_admins              TO liroym;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_channel_config  TO liroym;
GRANT USAGE, SELECT ON SEQUENCE platform_settings_id_seq             TO liroym;
GRANT USAGE, SELECT ON SEQUENCE platform_admins_id_seq               TO liroym;
GRANT USAGE, SELECT ON SEQUENCE notification_channel_config_id_seq   TO liroym;

COMMIT;

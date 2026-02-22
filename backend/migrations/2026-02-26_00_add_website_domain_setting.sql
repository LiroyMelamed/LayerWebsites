-- Add COMPANY_NAME, notification control settings, admin CC to notification channels,
-- and SMS templates to platform_settings.
-- WEBSITE_DOMAIN is NOT stored here — it must be set via env / .env file only.

BEGIN;

-- ─── 1) Platform settings: firm, messaging, notifications, templates ─────
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('firm', 'COMPANY_NAME',   'MelamedLaw',              'string', 'שם החברה (אנגלית)',  'שם החברה באנגלית — מופיע בהודעות SMS ללקוחות, באימיילים שנשלחים מהמערכת, ובהודעות ברוכים הבאים ללקוחות חדשים'),
    ('messaging', 'WHATSAPP_DEFAULT_PHONE', '97236565004', 'string', 'טלפון ברירת מחדל לוואטסאפ', 'מספר טלפון לוואטסאפ כאשר מנהל תיק לא משוייך'),
    ('notifications', 'NOTIFY_ON_MANAGER_CHANGE',        'false', 'boolean', 'התראה בשינוי מנהל תיק',       'שליחת התראה ללקוחות כאשר משנים את מנהל התיק'),
    ('notifications', 'NOTIFY_ON_ESTIMATED_DATE_CHANGE', 'false', 'boolean', 'התראה בשינוי תאריך סיום משוער', 'שליחת התראה ללקוחות כאשר משנים את תאריך הסיום המשוער'),
    ('templates', 'CASE_CREATED_SMS',        'היי {{recipientName}}, תיק {{caseName}} נוצר, היכנס לאתר למעקב. {{websiteUrl}}',           'string', 'תבנית SMS - תיק חדש',    'תבנית הודעת SMS בעת יצירת תיק חדש. משתנים: {{recipientName}}, {{caseName}}, {{stageName}}, {{websiteUrl}}'),
    ('templates', 'CASE_UPDATED_SMS',        'היי {{recipientName}}, תיק {{caseName}} התעדכן, היכנס לאתר למעקב. {{websiteUrl}}',          'string', 'תבנית SMS - עדכון תיק',   'תבנית הודעת SMS בעת עדכון תיק. משתנים: {{recipientName}}, {{caseName}}, {{stageName}}, {{websiteUrl}}'),
    ('templates', 'CASE_STAGE_CHANGED_SMS',  'היי {{recipientName}}, בתיק {{caseName}} התעדכן שלב: {{stageName}}. היכנס לאתר למעקב. {{websiteUrl}}', 'string', 'תבנית SMS - שינוי שלב', 'תבנית SMS בעת שינוי שלב בתיק'),
    ('templates', 'CASE_CLOSED_SMS',         'היי {{recipientName}}, תיק {{caseName}} הסתיים בהצלחה. היכנס לאתר למעקב. {{websiteUrl}}',   'string', 'תבנית SMS - סגירת תיק',   'תבנית SMS בעת סגירת תיק'),
    ('templates', 'CASE_REOPENED_SMS',       'היי {{recipientName}}, תיק {{caseName}} נפתח מחדש. היכנס לאתר למעקב. {{websiteUrl}}',       'string', 'תבנית SMS - פתיחה מחדש',  'תבנית SMS בעת פתיחת תיק מחדש')
ON CONFLICT (category, setting_key) DO NOTHING;

-- ─── 2) Remove WEBSITE_DOMAIN from platform_settings if it was inserted earlier ──
DELETE FROM platform_settings WHERE category = 'firm' AND setting_key = 'WEBSITE_DOMAIN';

-- ─── 3) Add admin_cc column to notification_channel_config ───────────────
--    When TRUE, platform admins receive a copy of the notification.
ALTER TABLE notification_channel_config
    ADD COLUMN IF NOT EXISTS admin_cc BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed default admin_cc values for critical notification types
UPDATE notification_channel_config SET admin_cc = TRUE
WHERE notification_type IN ('SIGN_INVITE', 'DOC_SIGNED', 'DOC_REJECTED');

COMMIT;

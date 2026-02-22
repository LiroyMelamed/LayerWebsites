-- Add WEBSITE_DOMAIN, COMPANY_NAME, and notification control settings to platform_settings

BEGIN;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('firm', 'WEBSITE_DOMAIN', 'client.melamedlaw.co.il', 'string', 'דומיין אתר לקוחות', 'הדומיין של אתר הלקוחות (ללא https://)'),
    ('firm', 'COMPANY_NAME',   'MelamedLaw',              'string', 'שם החברה (אנגלית)',  'שם החברה שמופיע בהודעות SMS ואימיילים'),
    ('messaging', 'WHATSAPP_DEFAULT_PHONE', '97236565004', 'string', 'טלפון ברירת מחדל לוואטסאפ', 'מספר טלפון לוואטסאפ כאשר מנהל תיק לא משוייך'),
    ('notifications', 'NOTIFY_ON_MANAGER_CHANGE',        'false', 'boolean', 'התראה בשינוי מנהל תיק',       'שליחת התראה ללקוחות כאשר משנים את מנהל התיק'),
    ('notifications', 'NOTIFY_ON_ESTIMATED_DATE_CHANGE', 'false', 'boolean', 'התראה בשינוי תאריך סיום משוער', 'שליחת התראה ללקוחות כאשר משנים את תאריך הסיום המשוער'),
    ('templates', 'CASE_CREATED_SMS',        'היי {{recipientName}}, תיק {{caseName}} נוצר, היכנס לאתר למעקב. {{websiteUrl}}',           'string', 'תבנית SMS - תיק חדש',    'תבנית הודעת SMS בעת יצירת תיק חדש. משתנים: {{recipientName}}, {{caseName}}, {{websiteUrl}}'),
    ('templates', 'CASE_UPDATED_SMS',        'היי {{recipientName}}, תיק {{caseName}} התעדכן, היכנס לאתר למעקב. {{websiteUrl}}',          'string', 'תבנית SMS - עדכון תיק',   'תבנית הודעת SMS בעת עדכון תיק. משתנים: {{recipientName}}, {{caseName}}, {{stageName}}, {{websiteUrl}}'),
    ('templates', 'CASE_STAGE_CHANGED_SMS',  'היי {{recipientName}}, בתיק {{caseName}} התעדכן שלב: {{stageName}}. היכנס לאתר למעקב. {{websiteUrl}}', 'string', 'תבנית SMS - שינוי שלב', 'תבנית SMS בעת שינוי שלב בתיק'),
    ('templates', 'CASE_CLOSED_SMS',         'היי {{recipientName}}, תיק {{caseName}} הסתיים בהצלחה. היכנס לאתר למעקב. {{websiteUrl}}',   'string', 'תבנית SMS - סגירת תיק',   'תבנית SMS בעת סגירת תיק'),
    ('templates', 'CASE_REOPENED_SMS',       'היי {{recipientName}}, תיק {{caseName}} נפתח מחדש. היכנס לאתר למעקב. {{websiteUrl}}',       'string', 'תבנית SMS - פתיחה מחדש',  'תבנית SMS בעת פתיחת תיק מחדש')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

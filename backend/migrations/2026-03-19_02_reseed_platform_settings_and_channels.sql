-- Re-seed platform_settings and notification_channel_config data.
-- After prod→Neon sync these tables were empty; this migration restores all seed data.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. notification_channel_config
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO notification_channel_config (notification_type, label, push_enabled, email_enabled, sms_enabled, admin_cc, manager_cc)
VALUES
    ('SIGN_INVITE',       'הזמנה לחתימה',              TRUE,  TRUE,  TRUE,  FALSE,  TRUE),
    ('SIGN_REMINDER',     'תזכורת חתימה',              TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('DOC_SIGNED',        'מסמך נחתם',                 TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
    ('DOC_REJECTED',      'מסמך נדחה',                 TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
    ('PAYMENT',           'תזכורת תשלום',              TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('LICENSE_RENEWAL',   'חידוש רישיון',              TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('GENERAL',           'הודעה כללית',               TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_CREATED',      'יצירת תיק חדש',            TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_NAME_CHANGE',  'עדכון שם התיק',             TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_TYPE_CHANGE',  'עדכון סוג תיק',             FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_STAGE_CHANGE', 'עדכון שלבים',               TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_CLOSED',       'סגירת תיק',                TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_REOPENED',     'פתיחת תיק מחדש',           TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_MANAGER_CHANGE','עדכון מנהל התיק',          FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_EST_DATE_CHANGE','עדכון תאריך סיום משוער',   FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_LICENSE_CHANGE','עדכון תוקף רישיון',        FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_COMPANY_CHANGE','עדכון שם חברה',            FALSE, FALSE, FALSE, FALSE, FALSE),
    ('CASE_TAGGED',       'הצמדת / ביטול הצמדת תיק',  FALSE, FALSE, FALSE, FALSE, FALSE),
    ('BIRTHDAY',          'ברכת יום הולדת',            TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
    ('NEW_CLIENT',        'לקוח חדש',                  FALSE, TRUE,  TRUE,  FALSE, FALSE)
ON CONFLICT (notification_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 2. platform_settings — core categories
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    -- messaging
    ('messaging', 'SMOOVE_SENDER_PHONE',    '0559199044', 'string', 'מספר שולח SMS',           'מספר הטלפון ממנו נשלחות הודעות SMS'),
    ('messaging', 'SMOOVE_EMAIL_FROM_NAME',  NULL, 'string', 'שם שולח אימייל',          'השם שיופיע כשולח באימיילים'),
    ('messaging', 'SMOOVE_EMAIL_FROM_EMAIL', NULL, 'string', 'כתובת שולח אימייל',       'כתובת האימייל של השולח'),
    ('messaging', 'SMTP_FROM_EMAIL',         NULL, 'string', 'כתובת SMTP שולח',         'כתובת השולח ב-SMTP'),
    ('messaging', 'WHATSAPP_DEFAULT_PHONE', '97236565004', 'string', 'טלפון ברירת מחדל לוואטסאפ', 'מספר טלפון לוואטסאפ כאשר מנהל תיק לא משוייך'),

    -- signing
    ('signing', 'SIGNING_OTP_ENABLED',        NULL, 'boolean', 'OTP בחתימה',              'האם נדרש OTP בעת חתימה על מסמכים'),
    ('signing', 'SIGNING_REQUIRE_OTP_DEFAULT', NULL, 'boolean', 'OTP ברירת מחדל',         'ברירת מחדל לדרישת OTP בחתימות חדשות'),

    -- firm
    ('firm', 'FIRM_NAME',     NULL,          'string', 'שם המשרד (אנגלית)', 'שם המשרד באנגלית — מופיע בתבניות אימייל תזכורות ובמסמכים שנשלחים ללקוחות באנגלית'),
    ('firm', 'LAW_FIRM_NAME', NULL,          'string', 'שם המשרד (עברית)',  'שם המשרד בעברית — מופיע בהודעות SMS של יום הולדת ללקוחות, ובתבניות תזכורות שנשלחות בעברית'),
    ('firm', 'COMPANY_NAME',  'MorLevy', 'string', 'שם החברה (אנגלית)', 'שם החברה באנגלית — מופיע בהודעות SMS ללקוחות, באימיילים שנשלחים מהמערכת, ובהודעות ברוכים הבאים'),

    -- reminders
    ('reminders', 'LICENSE_RENEWAL_REMINDERS_CEO_EMAIL', NULL, 'string', 'אימייל מנכ"ל לתזכורות', 'כתובת אימייל לשליחת תזכורות רישיון'),
    ('reminders', 'LICENSE_RENEWAL_REMINDERS_CEO_NAME',  NULL, 'string', 'שם מנכ"ל לתזכורות',     'שם המנכ"ל שיופיע בתזכורות רישיון'),

    -- notifications
    ('notifications', 'BIRTHDAY_GREETINGS_ENABLED', 'true', 'boolean', 'ברכות יום הולדת', 'שליחת ברכת יום הולדת אוטומטית ללקוחות')
ON CONFLICT (category, setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 3. platform_settings — SMS templates
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('templates', 'CASE_CREATED_SMS',        'היי {{recipientName}}, תיק {{caseName}} נוצר, היכנס לאתר למעקב. {{websiteUrl}}',           'string', 'תבנית SMS - תיק חדש',     'תבנית הודעת SMS בעת יצירת תיק חדש'),
    ('templates', 'CASE_UPDATED_SMS',        'היי {{recipientName}}, תיק {{caseName}} התעדכן, היכנס לאתר למעקב. {{websiteUrl}}',          'string', 'תבנית SMS - עדכון תיק',    'תבנית הודעת SMS בעת עדכון תיק'),
    ('templates', 'CASE_STAGE_CHANGED_SMS',  'היי {{recipientName}}, בתיק {{caseName}} התעדכן שלב: {{stageName}}. היכנס לאתר למעקב. {{websiteUrl}}', 'string', 'תבנית SMS - שינוי שלב', 'תבנית SMS בעת שינוי שלב בתיק'),
    ('templates', 'CASE_CLOSED_SMS',         'היי {{recipientName}}, תיק {{caseName}} הסתיים בהצלחה. היכנס לאתר למעקב. {{websiteUrl}}',   'string', 'תבנית SMS - סגירת תיק',    'תבנית SMS בעת סגירת תיק'),
    ('templates', 'CASE_REOPENED_SMS',       'היי {{recipientName}}, תיק {{caseName}} נפתח מחדש. היכנס לאתר למעקב. {{websiteUrl}}',       'string', 'תבנית SMS - פתיחה מחדש',   'תבנית SMS בעת פתיחת תיק מחדש'),
    ('templates', 'BIRTHDAY_SMS',            '{{firmName}} מאחלת לך מזל טוב ליום הולדתך, {{recipientName}}! 🎂🎉',                         'string', 'תבנית SMS - יום הולדת',     'תבנית SMS לברכת יום הולדת'),
    ('templates', 'NEW_CLIENT_SMS',          'שלום {{recipientName}}, ברוכים הבאים ל{{firmName}}. היכנס לאתר להשלמת הרשמה: {{websiteUrl}}', 'string', 'הודעת ברוכים הבאים ללקוח חדש', 'SMS שנשלח ללקוח עם יצירתו במערכת'),
    ('templates', 'SIGN_INVITE_SMS',         'שלום {{recipientName}}, המסמך "{{documentName}}" מחכה לחתימתך. {{websiteUrl}}',              'string', 'הזמנה לחתימה (SMS)',        'הודעת SMS לחותם כשמסמך ממתין לחתימה'),
    ('templates', 'DOC_SIGNED_SMS',          'שלום {{recipientName}}, המסמך "{{documentName}}" נחתם בהצלחה. {{websiteUrl}}',               'string', 'מסמך נחתם (SMS)',           'הודעת SMS לעורך הדין כשמסמך נחתם'),
    ('templates', 'DOC_REJECTED_SMS',        'שלום {{recipientName}}, המסמך "{{documentName}}" נדחה. סיבה: {{rejectionReason}}. {{websiteUrl}}', 'string', 'מסמך נדחה (SMS)',     'הודעת SMS לעורך הדין כשמסמך נדחה'),
    ('templates', 'SIGN_REMINDER_SMS',       'שלום {{recipientName}}, תזכורת: המסמך "{{documentName}}" ממתין לחתימתך. {{websiteUrl}}',     'string', 'תזכורת חתימה (SMS)',        'הודעת SMS תזכורת לחותם'),
    ('templates', 'CASE_TAGGED_SMS',         'שלום {{recipientName}}, קבוצת וואטסאפ קושרה לתיק "{{caseName}}". {{websiteUrl}}',            'string', 'תיוג תיק (SMS)',            'הודעת SMS כשקבוצת וואטסאפ מקושרת לתיק'),
    ('templates', 'CASE_NAME_CHANGE_SMS',    'שלום {{recipientName}}, שם התיק "{{caseName}}" עודכן. {{websiteUrl}}',                       'string', 'שינוי שם תיק (SMS)',        'הודעת SMS כששם התיק משתנה'),
    ('templates', 'CASE_TYPE_CHANGE_SMS',    'שלום {{recipientName}}, סוג התיק "{{caseName}}" עודכן. {{websiteUrl}}',                      'string', 'שינוי סוג תיק (SMS)',       'הודעת SMS כשסוג התיק משתנה'),
    ('templates', 'CASE_MANAGER_CHANGE_SMS', 'שלום {{recipientName}}, מנהל התיק "{{caseName}}" עודכן ל{{managerName}}. {{websiteUrl}}',    'string', 'שינוי מנהל תיק (SMS)',      'הודעת SMS כשמנהל התיק משתנה'),
    ('templates', 'CASE_COMPANY_CHANGE_SMS', 'שלום {{recipientName}}, חברה בתיק "{{caseName}}" עודכנה. {{websiteUrl}}',                    'string', 'שינוי חברה בתיק (SMS)',     'הודעת SMS כשחברה בתיק משתנה'),
    ('templates', 'CASE_EST_DATE_CHANGE_SMS','שלום {{recipientName}}, תאריך משוער בתיק "{{caseName}}" עודכן. {{websiteUrl}}',               'string', 'שינוי תאריך משוער (SMS)',   'הודעת SMS כשתאריך משוער בתיק משתנה'),
    ('templates', 'CASE_LICENSE_CHANGE_SMS', 'שלום {{recipientName}}, רישיון בתיק "{{caseName}}" עודכן. {{websiteUrl}}',                   'string', 'שינוי רישיון בתיק (SMS)',   'הודעת SMS כשרישיון בתיק משתנה'),
    ('templates', 'GENERAL_SMS',             'שלום {{recipientName}}, {{firmName}} {{websiteUrl}}',                                        'string', 'הודעה כללית (SMS)',          'הודעת SMS כללית'),
    ('templates', 'PAYMENT_SMS',             'שלום {{recipientName}}, {{firmName}} {{websiteUrl}}',                                        'string', 'תשלום (SMS)',                'הודעת SMS בנושא תשלום'),
    ('templates', 'LICENSE_RENEWAL_SMS',     'שלום {{recipientName}}, תזכורת חידוש רישיון. {{firmName}} {{websiteUrl}}',                   'string', 'חידוש רישיון (SMS)',         'הודעת SMS תזכורת חידוש רישיון')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

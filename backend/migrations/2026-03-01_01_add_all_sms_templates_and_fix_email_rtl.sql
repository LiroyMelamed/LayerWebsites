-- Migration: Add all missing SMS templates + fix email RTL inline styles
-- Date: 2026-03-01

-- ═══════════════════════════════════════════════════
-- 1. Fix email RTL: add direction:rtl;text-align:right to <body> for email client compatibility
--    (Gmail, Apple Mail, Outlook web often ignore <html dir="rtl">)
-- ═══════════════════════════════════════════════════
UPDATE email_templates
SET html_body = REPLACE(
    html_body,
    '<body style="margin:0;padding:0;background-color:#EDF2F7;">',
    '<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">'
),
updated_at = NOW()
WHERE html_body LIKE '%<body style="margin:0;padding:0;background-color:#EDF2F7;">%';

-- ═══════════════════════════════════════════════════
-- 2. Add SMS templates for SIGNING notification types
-- ═══════════════════════════════════════════════════
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description, updated_at)
VALUES
  ('templates', 'SIGN_INVITE_SMS',
   'שלום {{recipientName}}, המסמך "{{documentName}}" מחכה לחתימתך. {{websiteUrl}}',
   'string', 'הזמנה לחתימה (SMS)', 'הודעת SMS לחותם כשמסמך ממתין לחתימה', NOW()),

  ('templates', 'DOC_SIGNED_SMS',
   'שלום {{recipientName}}, המסמך "{{documentName}}" נחתם בהצלחה. {{websiteUrl}}',
   'string', 'מסמך נחתם (SMS)', 'הודעת SMS לעורך הדין כשמסמך נחתם', NOW()),

  ('templates', 'DOC_REJECTED_SMS',
   'שלום {{recipientName}}, המסמך "{{documentName}}" נדחה. סיבה: {{rejectionReason}}. {{websiteUrl}}',
   'string', 'מסמך נדחה (SMS)', 'הודעת SMS לעורך הדין כשמסמך נדחה', NOW()),

  ('templates', 'SIGN_REMINDER_SMS',
   'שלום {{recipientName}}, תזכורת: המסמך "{{documentName}}" ממתין לחתימתך. {{websiteUrl}}',
   'string', 'תזכורת חתימה (SMS)', 'הודעת SMS תזכורת לחותם', NOW())
ON CONFLICT (category, setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- 3. Add SMS templates for per-field CASE change types
-- ═══════════════════════════════════════════════════
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description, updated_at)
VALUES
  ('templates', 'CASE_TAGGED_SMS',
   'שלום {{recipientName}}, קבוצת וואטסאפ קושרה לתיק "{{caseName}}". {{websiteUrl}}',
   'string', 'תיוג תיק (SMS)', 'הודעת SMS כשקבוצת וואטסאפ מקושרת לתיק', NOW()),

  ('templates', 'CASE_NAME_CHANGE_SMS',
   'שלום {{recipientName}}, שם התיק "{{caseName}}" עודכן. {{websiteUrl}}',
   'string', 'שינוי שם תיק (SMS)', 'הודעת SMS כששם התיק משתנה', NOW()),

  ('templates', 'CASE_TYPE_CHANGE_SMS',
   'שלום {{recipientName}}, סוג התיק "{{caseName}}" עודכן. {{websiteUrl}}',
   'string', 'שינוי סוג תיק (SMS)', 'הודעת SMS כשסוג התיק משתנה', NOW()),

  ('templates', 'CASE_MANAGER_CHANGE_SMS',
   'שלום {{recipientName}}, מנהל התיק "{{caseName}}" עודכן ל{{managerName}}. {{websiteUrl}}',
   'string', 'שינוי מנהל תיק (SMS)', 'הודעת SMS כשמנהל התיק משתנה', NOW()),

  ('templates', 'CASE_COMPANY_CHANGE_SMS',
   'שלום {{recipientName}}, חברה בתיק "{{caseName}}" עודכנה. {{websiteUrl}}',
   'string', 'שינוי חברה בתיק (SMS)', 'הודעת SMS כשחברה בתיק משתנה', NOW()),

  ('templates', 'CASE_EST_DATE_CHANGE_SMS',
   'שלום {{recipientName}}, תאריך משוער בתיק "{{caseName}}" עודכן. {{websiteUrl}}',
   'string', 'שינוי תאריך משוער (SMS)', 'הודעת SMS כשתאריך משוער בתיק משתנה', NOW()),

  ('templates', 'CASE_LICENSE_CHANGE_SMS',
   'שלום {{recipientName}}, רישיון בתיק "{{caseName}}" עודכן. {{websiteUrl}}',
   'string', 'שינוי רישיון בתיק (SMS)', 'הודעת SMS כשרישיון בתיק משתנה', NOW()),

  ('templates', 'GENERAL_SMS',
   'שלום {{recipientName}}, {{firmName}} {{websiteUrl}}',
   'string', 'הודעה כללית (SMS)', 'הודעת SMS כללית', NOW()),

  ('templates', 'PAYMENT_SMS',
   'שלום {{recipientName}}, {{firmName}} {{websiteUrl}}',
   'string', 'תשלום (SMS)', 'הודעת SMS בנושא תשלום', NOW()),

  ('templates', 'LICENSE_RENEWAL_SMS',
   'שלום {{recipientName}}, תזכורת חידוש רישיון. {{firmName}} {{websiteUrl}}',
   'string', 'חידוש רישיון (SMS)', 'הודעת SMS תזכורת חידוש רישיון', NOW())
ON CONFLICT (category, setting_key) DO NOTHING;

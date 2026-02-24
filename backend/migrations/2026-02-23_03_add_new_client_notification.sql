-- Migration: Add NEW_CLIENT notification templates + channel config
-- Date: 2026-02-23
-- Description:
--   1. Add NEW_CLIENT_SMS template to platform_settings
--   2. Add NEW_CLIENT email template to email_templates
--   3. Add NEW_CLIENT to notification_channel_config (SMS + email enabled)

BEGIN;

-- 1. SMS template
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES (
    'templates',
    'NEW_CLIENT_SMS',
    E'שלום {{recipientName}}, ברוכים הבאים ל{{firmName}}. היכנס לאתר להשלמת הרשמה: {{websiteUrl}}',
    'string',
    'הודעת ברוכים הבאים ללקוח חדש',
    'SMS שנשלח ללקוח עם יצירתו במערכת'
)
ON CONFLICT (category, setting_key) DO NOTHING;

-- 2. Email template
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'NEW_CLIENT',
    'ברוכים הבאים - לקוח חדש',
    E'ברוכים הבאים ל[[firm_name]]',
    E'<!DOCTYPE html>\r\n<html dir="rtl" lang="he">\r\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>ברוכים הבאים</title></head>\r\n<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">\r\n<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">ברוכים הבאים ל[[firm_name]]</div>\r\n<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">\r\n<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>\r\n<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">ברוכים הבאים</div></td></tr>\r\n<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>ברוכים הבאים לשירות של <span style="font-weight:600;color:#1A365D;">[[firm_name]]</span>.<br><br>כדי להיכנס למערכת ולהשלים את ההרשמה, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>\r\n<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;כניסה למערכת&nbsp;&nbsp;</a></td></tr></tbody></table>\r\n<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>\r\n<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>\r\n</tbody></table>\r\n</td></tr></tbody></table>\r\n</body>\r\n</html>',
    '["recipient_name", "firm_name", "action_url"]'::jsonb
)
ON CONFLICT (template_key) DO NOTHING;

-- 3. Channel config (SMS + email enabled by default)
INSERT INTO notification_channel_config (notification_type, label, sms_enabled, email_enabled, push_enabled, manager_cc, admin_cc)
VALUES ('NEW_CLIENT', 'לקוח חדש', true, true, false, false, false)
ON CONFLICT (notification_type) DO NOTHING;

COMMIT;

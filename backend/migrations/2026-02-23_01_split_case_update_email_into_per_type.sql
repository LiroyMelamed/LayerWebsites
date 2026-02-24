-- Migration: Split CASE_UPDATE email into per-type templates, remove CASE_UPDATED_SMS
-- Date: 2026-02-23

BEGIN;

-- ────────────────────────────────────────────────
-- 0. Ensure email_templates table exists (may be created by a later-dated migration,
--    but we need it now for the inserts below).
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
    template_key    VARCHAR(80)  PRIMARY KEY,
    label           VARCHAR(200) NOT NULL,
    subject_template TEXT        NOT NULL DEFAULT '',
    html_body       TEXT         NOT NULL DEFAULT '',
    available_vars  JSONB        NOT NULL DEFAULT '[]',
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by      INTEGER      REFERENCES users(userid) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON email_templates TO liroym;

-- ────────────────────────────────────────────────
-- 1. Insert per-type email templates (based on CASE_UPDATE HTML structure)
--    Each has a unique title, subject, preview text, and body text.
-- ────────────────────────────────────────────────

-- Helper: Build an email HTML body with custom title, previewText, bodyContent, buttonLabel
-- We'll use a common base and insert per-type via string replacement.

-- CASE_CREATED
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_CREATED',
    'יצירת תיק חדש',
    'תיק חדש נוצר: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>תיק חדש נוצר</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">תיק חדש נוצר: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">תיק חדש נוצר</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>תיק חדש נוצר: <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span><br>שלב נוכחי: <span style="font-weight:600;color:#1A365D;">[[case_stage]]</span><br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "case_stage", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_NAME_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_NAME_CHANGE',
    'עדכון שם תיק',
    'שם התיק עודכן: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון שם תיק</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">שם התיק עודכן: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון שם תיק</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>שם התיק עודכן ל: <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span><br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_TYPE_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_TYPE_CHANGE',
    'עדכון סוג תיק',
    'סוג התיק עודכן: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון סוג תיק</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">סוג התיק עודכן: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון סוג תיק</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>סוג התיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span> עודכן.<br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_STAGE_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_STAGE_CHANGE',
    'עדכון שלב בתיק',
    'התיק עבר לשלב: [[case_stage]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון שלב בתיק</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">התיק עבר לשלב חדש: [[case_stage]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון שלב בתיק</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>התיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span><br>עבר לשלב: <span style="font-weight:600;color:#1A365D;">[[case_stage]]</span><br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "case_stage", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_CLOSED
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_CLOSED',
    'סגירת תיק',
    'התיק נסגר: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>התיק נסגר</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">התיק נסגר: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">התיק נסגר</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>התיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span> הסתיים בהצלחה.<br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_REOPENED
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_REOPENED',
    'פתיחת תיק מחדש',
    'התיק נפתח מחדש: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>התיק נפתח מחדש</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">התיק נפתח מחדש: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">התיק נפתח מחדש</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>התיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span> נפתח מחדש.<br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_MANAGER_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_MANAGER_CHANGE',
    'עדכון מנהל תיק',
    'מנהל התיק עודכן: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון מנהל תיק</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">מנהל התיק עודכן: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון מנהל תיק</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>מנהל התיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span><br>עודכן ל: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_EST_DATE_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_EST_DATE_CHANGE',
    'עדכון תאריך משוער',
    'תאריך סיום משוער עודכן: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון תאריך משוער</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">תאריך סיום משוער עודכן: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון תאריך משוער</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>תאריך הסיום המשוער בתיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span> עודכן.<br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_LICENSE_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_LICENSE_CHANGE',
    'עדכון תוקף רישיון',
    'תוקף רישיון עודכן: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון תוקף רישיון</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">תוקף רישיון עודכן: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון תוקף רישיון</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>תוקף הרישיון בתיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span> עודכן.<br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_COMPANY_CHANGE
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_COMPANY_CHANGE',
    'עדכון חברה בתיק',
    'חברה עודכנה בתיק: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>עדכון חברה בתיק</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">חברה עודכנה בתיק: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">עדכון חברה בתיק</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>החברה בתיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span> - <span style="font-weight:600;color:#1A365D;">[[case_number]]</span> עודכנה.<br>מנהל תיק: <span style="font-weight:600;color:#1A365D;">[[manager_name]]</span><br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "case_number", "manager_name", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- CASE_TAGGED
INSERT INTO email_templates (template_key, label, subject_template, html_body, available_vars)
VALUES (
    'CASE_TAGGED',
    'הצמדת תיק',
    'קבוצת וואטסאפ קושרה: [[case_title]]',
    '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>הצמדת תיק</title></head>
<body style="margin:0;padding:0;background-color:#EDF2F7;direction:rtl;text-align:right;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">קבוצת וואטסאפ קושרה לתיק: [[case_title]]</div>
<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">
<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>
<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">הצמדת תיק</div></td></tr>
<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום <span style="font-weight:600;color:#1A365D;">[[recipient_name]]</span>,<br><br>קבוצת וואטסאפ קושרה לתיק <span style="font-weight:600;color:#1A365D;">[[case_title]]</span>.<br><br>כדי להיכנס ולצפות בפרטי התיק, לחץ/י על הכפתור:</div><div style="height:18px;line-height:18px;">&nbsp;</div>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה בתיק&nbsp;&nbsp;</a></td></tr></tbody></table>
<div style="height:10px;line-height:10px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:<br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית.<br>&copy; MelamedLaw</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body>
</html>',
    '["recipient_name", "case_title", "action_url"]'
) ON CONFLICT (template_key) DO NOTHING;

-- ────────────────────────────────────────────────
-- 2. Remove the old generic CASE_UPDATE email template
-- ────────────────────────────────────────────────
DELETE FROM email_templates WHERE template_key = 'CASE_UPDATE';

-- ────────────────────────────────────────────────
-- 3. Remove the old generic CASE_UPDATED_SMS from platform_settings
-- ────────────────────────────────────────────────
DELETE FROM platform_settings WHERE category = 'templates' AND setting_key = 'CASE_UPDATED_SMS';

COMMIT;

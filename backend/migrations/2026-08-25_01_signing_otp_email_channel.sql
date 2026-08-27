-- Allow signing OTP delivery via email when the signer has no phone.
-- phone_e164 becomes nullable; email + delivery_channel record the channel used.

ALTER TABLE signing_otp_challenges
    ALTER COLUMN phone_e164 DROP NOT NULL;

ALTER TABLE signing_otp_challenges
    ADD COLUMN IF NOT EXISTS email text NULL;

ALTER TABLE signing_otp_challenges
    ADD COLUMN IF NOT EXISTS delivery_channel text NOT NULL DEFAULT 'sms';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'signing_otp_challenges_delivery_channel_chk'
    ) THEN
        ALTER TABLE signing_otp_challenges
            ADD CONSTRAINT signing_otp_challenges_delivery_channel_chk
            CHECK (delivery_channel IN ('sms', 'email'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'signing_otp_challenges_contact_present_chk'
    ) THEN
        ALTER TABLE signing_otp_challenges
            ADD CONSTRAINT signing_otp_challenges_contact_present_chk
            CHECK (
                (delivery_channel = 'sms' AND phone_e164 IS NOT NULL AND length(trim(phone_e164)) > 0)
                OR (delivery_channel = 'email' AND email IS NOT NULL AND length(trim(email)) > 0)
            );
    END IF;
END $$;

-- Styled OTP email (same layout family as SIGN_INVITE / calendar templates)
INSERT INTO email_templates (template_key, label, subject_template, available_vars, html_body)
VALUES (
    'SIGNING_OTP',
    'קוד אימות לחתימה',
    'קוד אימות לחתימה: [[document_name]]',
    '["recipient_name","document_name","otp_code","otp_ttl_minutes","firm_name","firm_logo_url"]',
    E'<!DOCTYPE html>\n<html dir="rtl" lang="he">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>קוד אימות לחתימה</title></head>\n<body style="margin:0;padding:0;background-color:#EDF2F7;">\n<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">קוד האימות שלך לחתימה: [[otp_code]]</div>\n<table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%"><tbody><tr><td align="center" style="padding:24px 12px;">\n<table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640"><tbody>\n<tr><td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="[[firm_logo_url]]" width="170" alt="[[firm_name]]" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;"><div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">קוד אימות לחתימה</div></td></tr>\n<tr><td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#2D3748;"><div style="font-size:16px;line-height:1.7;">שלום [[recipient_name]],<br><br>להשלמת החתימה על המסמך <span style="font-weight:600;color:#1A365D;">[[document_name]]</span> יש להזין את קוד האימות הבא:</div><div style="height:18px;line-height:18px;">&nbsp;</div>\n<table border="0" cellpadding="0" cellspacing="0" style="width:100%;"><tbody><tr><td align="center" style="padding:0 0 8px 0;"><div style="display:inline-block;background:#EDF2F7;color:#1A365D;font-weight:700;font-size:28px;letter-spacing:0.35em;line-height:1.2;padding:16px 24px;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,''Liberation Mono'',''Courier New'',monospace;">[[otp_code]]</div></td></tr></tbody></table>\n<div style="height:14px;line-height:14px;">&nbsp;</div><div style="font-size:13px;line-height:1.7;color:#718096;text-align:center;">הקוד תקף ל־[[otp_ttl_minutes]] דקות. אל תשתפו אותו עם אף אחד.</div><div style="height:18px;line-height:18px;">&nbsp;</div></td></tr>\n<tr><td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית. אם לא ביקשתם קוד זה, ניתן להתעלם ממנה.<br>&copy; [[firm_name]]</td></tr>\n</tbody></table>\n</td></tr></tbody></table>\n</body>\n</html>'
) ON CONFLICT (template_key) DO NOTHING;

-- Migration: Add FIRM_LOGO_URL setting + replace hardcoded Melamed branding in email templates
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Add FIRM_LOGO_URL platform setting
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES (
    'firm',
    'FIRM_LOGO_URL',
    NULL,
    'string',
    'לוגו המשרד (URL)',
    'קישור לתמונת הלוגו של המשרד — מופיע בכותרת תבניות האימייל'
)
ON CONFLICT (category, setting_key) DO NOTHING;

-- 2) Replace hardcoded logo URL with [[firm_logo_url]] placeholder in all email templates
UPDATE email_templates
SET html_body = REPLACE(
    html_body,
    'https://client.melamedlaw.co.il/logoLMwhite.png',
    '[[firm_logo_url]]'
)
WHERE html_body LIKE '%client.melamedlaw.co.il/logoLMwhite.png%';

-- 3) Replace hardcoded alt="MelamedLaw" with alt="[[firm_name]]"
UPDATE email_templates
SET html_body = REPLACE(html_body, 'alt="MelamedLaw"', 'alt="[[firm_name]]"')
WHERE html_body LIKE '%alt="MelamedLaw"%';

-- 4) Replace hardcoded © MelamedLaw with © [[firm_name]]
UPDATE email_templates
SET html_body = REPLACE(html_body, '&copy; MelamedLaw', '&copy; [[firm_name]]')
WHERE html_body LIKE '%&copy; MelamedLaw%';

-- 5) Also ensure firm_logo_url is in the available_vars for all templates
UPDATE email_templates
SET available_vars = available_vars || '["firm_logo_url"]'::jsonb
WHERE NOT available_vars ? 'firm_logo_url';

-- 6) Also ensure firm_name is in available_vars for all templates
UPDATE email_templates
SET available_vars = available_vars || '["firm_name"]'::jsonb
WHERE NOT available_vars ? 'firm_name';

COMMIT;

-- Replace leftover hardcoded MorLevy logo URLs in email templates with
-- [[firm_logo_url]] / [[firm_name]] placeholders (same pattern as Melamed branding migration).
-- Safe on tenants that already use placeholders (0 rows updated).

BEGIN;

UPDATE email_templates
SET html_body = REPLACE(
    html_body,
    'https://client.morlevy.co.il/logoLMwhite.png',
    '[[firm_logo_url]]'
)
WHERE html_body LIKE '%client.morlevy.co.il/logoLMwhite.png%';

UPDATE email_templates
SET html_body = REPLACE(html_body, 'alt="MorLevy"', 'alt="[[firm_name]]"')
WHERE html_body LIKE '%alt="MorLevy"%';

UPDATE email_templates
SET html_body = REPLACE(html_body, '&copy; MorLevy', '&copy; [[firm_name]]')
WHERE html_body LIKE '%&copy; MorLevy%';

UPDATE email_templates
SET html_body = REPLACE(html_body, '&copy; MorLevi', '&copy; [[firm_name]]')
WHERE html_body LIKE '%&copy; MorLevi%';

UPDATE email_templates
SET available_vars = available_vars || '["firm_logo_url"]'::jsonb
WHERE NOT available_vars ? 'firm_logo_url';

UPDATE email_templates
SET available_vars = available_vars || '["firm_name"]'::jsonb
WHERE NOT available_vars ? 'firm_name';

COMMIT;

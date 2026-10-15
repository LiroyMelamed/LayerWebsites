-- Rename "עו״ד מטפל" / "עו"ד מטפל" → "מנהל תיק" in email template bodies.

BEGIN;

UPDATE email_templates
SET html_body = replace(html_body, 'עו״ד מטפל', 'מנהל תיק'),
    updated_at = NOW()
WHERE html_body LIKE '%עו״ד מטפל%';

UPDATE email_templates
SET html_body = replace(html_body, E'עו"ד מטפל', 'מנהל תיק'),
    updated_at = NOW()
WHERE html_body LIKE E'%עו"ד מטפל%';

COMMIT;

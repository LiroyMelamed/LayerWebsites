-- Rename "עו״ד מטפל" / "עו"ד מטפל" → "מנהל תיק" in email template bodies.

BEGIN;

UPDATE email_templates
SET body_html = replace(body_html, 'עו״ד מטפל', 'מנהל תיק'),
    updated_at = NOW()
WHERE body_html LIKE '%עו״ד מטפל%';

UPDATE email_templates
SET body_html = replace(body_html, E'עו"ד מטפל', 'מנהל תיק'),
    updated_at = NOW()
WHERE body_html LIKE E'%עו"ד מטפל%';

COMMIT;

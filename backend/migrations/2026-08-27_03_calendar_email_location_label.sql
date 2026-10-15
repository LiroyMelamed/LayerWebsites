-- Calendar emails: use dynamic location label (קישור לזום vs כתובת) via [[address_line]].

UPDATE email_templates
SET html_body = REPLACE(
    html_body,
    E'<br>כתובת: <span style="font-weight:600;">[[address]]</span>',
    E'[[address_line]]'
)
WHERE template_key IN ('CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_LAWYER_REMINDER');

UPDATE email_templates
SET available_vars = available_vars || '["location_label"]'::jsonb
WHERE template_key IN ('CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_LAWYER_REMINDER')
  AND NOT available_vars ? 'location_label';

UPDATE email_templates
SET available_vars = available_vars || '["address_line"]'::jsonb
WHERE template_key IN ('CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_LAWYER_REMINDER')
  AND NOT available_vars ? 'address_line';

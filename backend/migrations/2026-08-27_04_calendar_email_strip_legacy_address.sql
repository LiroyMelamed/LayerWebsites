-- Normalize any customized calendar email templates that still use raw [[address]] with "כתובת:".

UPDATE email_templates
SET html_body = REPLACE(
    html_body,
    E'<br>כתובת: [[address]]',
    E'[[address_line]]'
)
WHERE template_key IN ('CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_LAWYER_REMINDER');

UPDATE email_templates
SET html_body = REPLACE(
    html_body,
    E'<br>כתובת: <span style="font-weight:600;">[[address]]</span>',
    E'[[address_line]]'
)
WHERE template_key IN ('CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_LAWYER_REMINDER');

-- Separate calendar SMS templates for hearing vs appointment (platform defaults).
-- EventFormModal + reminder/invite composers fall back to the appointment keys when hearing keys are empty.

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
(
    'templates',
    'CALENDAR_CLIENT_REMINDER_SMS_HEARING',
    E'שלום {{recipientName}},\nזוהי תזכורת לדיון שנקבע עבורך ב{{firmName}}\nבתאריך {{date}} בשעה {{time}}.\nכתובתנו הינה {{address}}\nלהוראות הגעה בוויז {{wazeUrl}}\nלבירור או שינוי נא להתקשר ל {{firmPhone}}\nמידע נוסף ניתן למצוא באתר שלנו\n{{websiteUrl}}',
    'string',
    'SMS תזכורת לקוח – דיון',
    'תבנית SMS לתזכורת לקוח באירועי דיון. משתנים: {{recipientName}} {{firmName}} {{date}} {{time}} {{address}} {{wazeUrl}} {{mapsUrl}} {{firmPhone}} {{websiteUrl}} {{lawyerName}} {{title}}'
),
(
    'templates',
    'CALENDAR_INVITE_SMS_HEARING',
    E'שלום {{recipientName}},\nהוזמנת לדיון ב{{firmName}}\nבתאריך {{date}} בשעה {{time}}.\nכתובתנו הינה {{address}}\nלאישור הגעה: {{rsvpUrl}}\nלהוראות הגעה בוויז {{wazeUrl}}\nלבירור נא להתקשר ל {{firmPhone}}',
    'string',
    'SMS הזמנה לקוח – דיון',
    'תבנית SMS להזמנה/RSVP באירועי דיון. משתנים: {{recipientName}} {{firmName}} {{date}} {{time}} {{address}} {{wazeUrl}} {{mapsUrl}} {{rsvpUrl}} {{firmPhone}} {{websiteUrl}} {{lawyerName}} {{title}}'
)
ON CONFLICT (category, setting_key) DO NOTHING;

-- Include immediate (0) in default reminder options when missing.
UPDATE platform_settings
SET setting_value = CASE
    WHEN setting_value IS NULL OR btrim(setting_value) = '' THEN '0,15,30,60,120,1440,2880,10080'
    WHEN (',' || replace(setting_value, ' ', '') || ',') NOT LIKE '%,0,%'
        THEN '0,' || setting_value
    ELSE setting_value
END,
    updated_at = NOW()
WHERE category = 'calendar'
  AND setting_key = 'CALENDAR_REMINDER_OPTIONS';

-- Firm default office address + direct Waze/Maps place links for calendar SMS.
-- Waze/Maps URLs are used as-is in SMS (e.g. https://waze.com/ul/hsv9n8gwrw) — not wrapped in /n/.

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
(
    'calendar',
    'FIRM_OFFICE_ADDRESS',
    '',
    'string',
    'כתובת המשרד (ברירת מחדל)',
    'כתובת ברירת מחדל לאירועים ולקישורי ניווט כשלא הוזנה כתובת באירוע'
)
ON CONFLICT (category, setting_key) DO NOTHING;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
(
    'calendar',
    'FIRM_WAZE_URL',
    '',
    'string',
    'קישור וויז למשרד',
    'הדביקו קישור מקום מוויז (למשל https://waze.com/ul/hsv9n8gwrw). יישלח ישירות ב-SMS בלי מעבר באתר'
)
ON CONFLICT (category, setting_key) DO NOTHING;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
(
    'calendar',
    'FIRM_MAPS_URL',
    '',
    'string',
    'קישור מפות למשרד',
    'הדביקו קישור מקום מגוגל מפות. יישלח ישירות ב-SMS בלי מעבר באתר'
)
ON CONFLICT (category, setting_key) DO NOTHING;

-- Toggle whether the public signing screen shows the consent checkbox.
INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES (
    'signing',
    'SHOW_PUBLIC_SIGNING_CONSENT',
    'true',
    'boolean',
    'הצגת הסכמה בחתימה ציבורית',
    'האם להציג את תיבת ההסכמה במסך החתימה הציבורי לפני חתימה'
)
ON CONFLICT (category, setting_key) DO NOTHING;

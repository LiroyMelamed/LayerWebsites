-- Split SMS sender into:
--   INFORU_SENDER_PHONE  = alphanumeric sender name (direct save)
--   INFORU_SENDER_NUMBER = phone sender (change via request + InforU verification)

UPDATE platform_settings
SET label = 'שם שולח SMS',
    description = 'שם אלפאנומרי עד 11 תווים לטיניים, ללא רווחים. אם ריק — נשלח בלי שם (או במספר השולח אם הוגדר).',
    updated_at = now()
WHERE category = 'messaging'
  AND setting_key = 'INFORU_SENDER_PHONE';

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description, updated_at)
VALUES (
    'messaging',
    'INFORU_SENDER_NUMBER',
    NULL,
    'string',
    'מספר שולח SMS',
    'מספר טלפון שמוצג כשולח SMS (מאומת ב-InforU). שינוי דורש אישור צוות טכני.',
    now()
)
ON CONFLICT (category, setting_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();

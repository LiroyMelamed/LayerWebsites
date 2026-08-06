-- SMS sender is its own setting (not derived from firm name).
-- Name-only alphanumeric sender ID (not a phone number).

UPDATE platform_settings
SET label = 'שם שולח SMS',
    description = 'שם אלפאנומרי שמוצג כשולח SMS (נפרד משם המשרד). עד 11 תווים לטיניים, ללא רווחים. ניתן להשאיר ריק.',
    updated_at = now()
WHERE category = 'messaging'
  AND setting_key = 'INFORU_SENDER_PHONE';

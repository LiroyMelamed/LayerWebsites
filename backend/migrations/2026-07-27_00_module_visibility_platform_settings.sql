-- Module visibility toggles (runtime platform settings; not build-time flags).
-- ENABLE_CALENDAR_MODULE: show calendar nav/widget/screen
-- AI_CHATBOT_ENABLED: show chatbot entry in navigation (route may still exist)

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    (
        'calendar',
        'ENABLE_CALENDAR_MODULE',
        'true',
        'boolean',
        'מודול יומן',
        'כאשר פעיל: מסך היומן, ווידג''ט בלוח הבקרה ופריט התפריט מוצגים. כיבוי מסתיר את המודול מהממשק.'
    ),
    (
        'chatbot',
        'AI_CHATBOT_ENABLED',
        'false',
        'boolean',
        'צ׳אטבוט AI',
        'כאשר פעיל: קישור לצ׳אטבוט מוצג בניווט. הדף עדיין נגיש ב-URL ישיר.'
    )
ON CONFLICT (category, setting_key) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();

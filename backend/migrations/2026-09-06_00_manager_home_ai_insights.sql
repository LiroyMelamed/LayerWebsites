-- Manager Home AI morning brief toggle (runtime platform setting).
-- When enabled + CHATBOT_LLM_API_KEY configured, dashboard header brief is LLM-generated from operational facts.

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES (
    'managerHome',
    'MANAGER_HOME_AI_INSIGHTS_ENABLED',
    'false',
    'boolean',
    'תובנות AI בלוח הבקרה',
    'כאשר פעיל: סיכום בוקר בלוח הבקרה נוצר ב-AI מתוך נתונים תפעוליים קיימים. כיבוי: סיכום תבניתי בלבד.'
)
ON CONFLICT (category, setting_key) DO UPDATE
SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();

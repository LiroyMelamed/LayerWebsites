-- Contractor-Monitor settings (MelamedLaw only)
--
-- The standalone `contractor-monitor` Node service (running outside this
-- repo) reads its configuration from this `platform_settings` table using
-- `category = 'contractor_monitor'`. This migration seeds / updates the
-- labels and descriptions so a platform-admin opening the Platform
-- Settings screen actually understands what each row controls.
--
-- IMPORTANT: this is a MelamedLaw-only feature. Do NOT apply on MorLevi.

BEGIN;

-- ─── Helper: upsert a contractor_monitor setting (label + description) ──
-- We do NOT overwrite existing setting_value — only label/description are refreshed,
-- so admin-entered emails / phones are preserved.

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    -- Master switches
    ('contractor_monitor', 'CM_ENABLED',
        'true', 'boolean',
        'הפעלת מעקב קבלנים',
        'מפעיל/מכבה את כל מערכת מעקב הקבלנים. כאשר כבוי — לא נשלחים דוחות ולא מתבצעות בדיקות.'),

    ('contractor_monitor', 'CM_CHECK_INTERVAL_DAYS',
        '1', 'number',
        'מרווח בדיקה (בימים)',
        'כל כמה ימים תרוץ הבדיקה. 1 = פעם ביום, 7 = פעם בשבוע.'),

    ('contractor_monitor', 'CM_ALWAYS_SEND_REPORT',
        'true', 'boolean',
        'תמיד לשלוח דוח',
        'אם דלוק — נשלח דוח גם כשאין שינויים (״לא נמצאו שינויים״). אם כבוי — דוחות נשלחים רק כשמצאנו תוספות/הסרות.'),

    ('contractor_monitor', 'CM_REPORT_HOUR',
        '07:00', 'string',
        'שעת שליחת הדוח',
        'השעה ביום (לפי שעון ישראל) שבה תרוץ הבדיקה ויישלח הדוח. פורמט HH:MM, למשל 07:00.'),

    -- ── Global recipients (fallback for all datasets) ──
    ('contractor_monitor', 'CM_GLOBAL_EMAIL_RECIPIENTS',
        '', 'string',
        'נמענים לאימייל — כללי (כל המאגרים)',
        'כתובות אימייל שיקבלו את כל הדוחות כברירת מחדל וגם את דוח הסיכום היומי. ניתן להזין מספר כתובות מופרדות בפסיק (,) — לדוגמה: liav@example.com, office@example.com'),

    ('contractor_monitor', 'CM_GLOBAL_SMS_RECIPIENTS',
        '', 'string',
        'נמענים ל-SMS — כללי (כל המאגרים)',
        'מספרי טלפון שיקבלו התראת SMS כשיימצאו שינויים בכל מאגר. ניתן להזין מספר טלפונים מופרדים בפסיק (,) — לדוגמה: 0501234567, 0527654321'),

    -- ── Per-dataset toggles + recipient overrides ──
    -- Each dataset has its own enable flag + optional override recipients.
    -- If the override is empty, the global recipients above are used.

    -- Pinkash (פנקס הקבלנים)
    ('contractor_monitor', 'CM_PINKASH_ENABLED',
        'true', 'boolean',
        'מאגר פנקס הקבלנים — הפעלה',
        'מפעיל מעקב אחר רשם הקבלנים (פנקס הקבלנים) של רשות החברות.'),

    ('contractor_monitor', 'CM_PINKASH_EMAIL_RECIPIENTS',
        '', 'string',
        'פנקס הקבלנים — אימייל (אופציונלי)',
        'נמעני אימייל ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר כתובות מופרדות בפסיק (,).'),

    ('contractor_monitor', 'CM_PINKASH_SMS_RECIPIENTS',
        '', 'string',
        'פנקס הקבלנים — SMS (אופציונלי)',
        'נמעני SMS ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר טלפונים מופרדים בפסיק (,).'),

    -- Manpower (קבלני כוח אדם)
    ('contractor_monitor', 'CM_MANPOWER_ENABLED',
        'true', 'boolean',
        'מאגר קבלני כוח אדם — הפעלה',
        'מפעיל מעקב אחר מאגר רישיונות קבלני כוח אדם.'),

    ('contractor_monitor', 'CM_MANPOWER_EMAIL_RECIPIENTS',
        '', 'string',
        'קבלני כוח אדם — אימייל (אופציונלי)',
        'נמעני אימייל ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר כתובות מופרדות בפסיק (,).'),

    ('contractor_monitor', 'CM_MANPOWER_SMS_RECIPIENTS',
        '', 'string',
        'קבלני כוח אדם — SMS (אופציונלי)',
        'נמעני SMS ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר טלפונים מופרדים בפסיק (,).'),

    -- Crane (מפעילי עגורנים)
    ('contractor_monitor', 'CM_CRANE_ENABLED',
        'true', 'boolean',
        'מאגר מפעילי עגורנים — הפעלה',
        'מפעיל מעקב אחר מאגר רישיונות מפעילי עגורנים.'),

    ('contractor_monitor', 'CM_CRANE_EMAIL_RECIPIENTS',
        '', 'string',
        'מפעילי עגורנים — אימייל (אופציונלי)',
        'נמעני אימייל ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר כתובות מופרדות בפסיק (,).'),

    ('contractor_monitor', 'CM_CRANE_SMS_RECIPIENTS',
        '', 'string',
        'מפעילי עגורנים — SMS (אופציונלי)',
        'נמעני SMS ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר טלפונים מופרדים בפסיק (,).'),

    -- Service (קבלני שירות)
    ('contractor_monitor', 'CM_SERVICE_ENABLED',
        'true', 'boolean',
        'מאגר קבלני שירות — הפעלה',
        'מפעיל מעקב אחר מאגר רישיונות קבלני שירות.'),

    ('contractor_monitor', 'CM_SERVICE_EMAIL_RECIPIENTS',
        '', 'string',
        'קבלני שירות — אימייל (אופציונלי)',
        'נמעני אימייל ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר כתובות מופרדות בפסיק (,).'),

    ('contractor_monitor', 'CM_SERVICE_SMS_RECIPIENTS',
        '', 'string',
        'קבלני שירות — SMS (אופציונלי)',
        'נמעני SMS ספציפיים למאגר זה בלבד. אם ריק — נשלח לנמענים הכלליים שלמעלה. ניתן להזין מספר טלפונים מופרדים בפסיק (,).'),

    -- Run metadata (read-only, written by the monitor itself)
    ('contractor_monitor', 'CM_LAST_RUN_AT',
        '', 'string',
        'הרצה אחרונה — תאריך',
        'מתעדכן אוטומטית בכל הרצה — אין צורך לערוך ידנית.'),

    ('contractor_monitor', 'CM_LAST_RUN_RESULT',
        '', 'string',
        'הרצה אחרונה — תוצאה',
        'מתעדכן אוטומטית בכל הרצה — אין צורך לערוך ידנית.')
ON CONFLICT (category, setting_key) DO UPDATE SET
    label       = EXCLUDED.label,
    description = EXCLUDED.description,
    value_type  = EXCLUDED.value_type;
    -- NOTE: setting_value is intentionally NOT overwritten — admin values are preserved.

COMMIT;

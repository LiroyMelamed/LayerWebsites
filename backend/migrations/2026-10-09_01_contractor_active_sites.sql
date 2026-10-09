-- Dedicated MelamedLaw database only. Never infer identity from a display name.
-- Repeated application preserves all user-selected values and recipient lists.
DO $migration$
BEGIN
    IF pg_catalog.current_database() <> 'melamedlaw' THEN
        RETURN;
    END IF;
    INSERT INTO public.platform_settings
        (category, setting_key, value_type, setting_value, label, description)
    VALUES
        ('contractor_monitor', 'CM_ACTIVE_SITES_ENABLED', 'boolean', 'false',
         'אתרי בנייה פעילים — פעיל', 'נוספו והוסרו בלבד לפי מספר אתר; הטעינה הראשונה היא נקודת בסיס'),
        ('contractor_monitor', 'CM_ACTIVE_SITES_EMAIL_RECIPIENTS', 'string', '',
         'אתרי בנייה — נמעני אימייל', 'נמענים מפורשים לדוח הישיר בלבד. ריק = ללא דוח ישיר, ללא ירושת נמענים או BCC'),
        ('contractor_monitor', 'CM_ACTIVE_SITES_SMS_RECIPIENTS', 'string', '',
         'אתרי בנייה — נמעני SMS', 'ריק = ללא SMS; אין ירושה מהנמענים הגלובליים'),
        ('contractor_monitor', 'CM_ACTIVE_SITES_INCLUDE_IN_GLOBAL_SUMMARY', 'boolean', 'false',
         'אתרי בנייה — כלול בסיכום הכללי', 'בחירה מפורשת לחשיפת נתוני המקור לנמעני הסיכום הגלובליים ולהעתקי המערכת המוגדרים')
    ON CONFLICT (category, setting_key) DO UPDATE SET
        value_type = EXCLUDED.value_type,
        label = EXCLUDED.label,
        description = EXCLUDED.description;
END
$migration$;

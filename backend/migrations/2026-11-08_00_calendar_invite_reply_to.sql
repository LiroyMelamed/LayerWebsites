BEGIN;
INSERT INTO platform_settings(category, setting_key, setting_value, value_type, label, description)
VALUES (
    'messaging',
    'INVITE_REPLY_TO_EMAIL',
    '',
    'string',
    'כתובת לתשובות על זימון פגישה',
    'כשלקוח עונה על הזימון או לוחץ אישור ביומן, התשובה מגיעה לכאן. ריק = office@ באותו דומיין של כתובת השליחה.'
)
ON CONFLICT (category, setting_key) DO NOTHING;
COMMIT;

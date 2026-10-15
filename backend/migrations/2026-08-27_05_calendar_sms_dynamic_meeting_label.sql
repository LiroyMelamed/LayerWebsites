-- Upgrade legacy calendar SMS templates: hardcoded פגישה/דיון → {{meetingTypeLabel}}

UPDATE platform_settings
SET setting_value = replace(setting_value, 'זוהי תזכורת לפגישה', 'זוהי תזכורת ל{{meetingTypeLabel}}'),
    updated_at = NOW()
WHERE category = 'templates'
  AND setting_key IN (
      'CALENDAR_CLIENT_REMINDER_SMS',
      'CALENDAR_CLIENT_REMINDER_SMS_HEARING'
  )
  AND setting_value LIKE '%זוהי תזכורת לפגישה%'
  AND setting_value NOT LIKE '%{{meetingTypeLabel}}%';

UPDATE platform_settings
SET setting_value = replace(setting_value, 'זוהי תזכורת לדיון', 'זוהי תזכורת ל{{meetingTypeLabel}}'),
    updated_at = NOW()
WHERE category = 'templates'
  AND setting_key = 'CALENDAR_CLIENT_REMINDER_SMS_HEARING'
  AND setting_value LIKE '%זוהי תזכורת לדיון%'
  AND setting_value NOT LIKE '%{{meetingTypeLabel}}%';

UPDATE platform_settings
SET setting_value = replace(setting_value, 'נקבעה לך פגישה', 'נקבעה לך {{meetingTypeLabel}}'),
    updated_at = NOW()
WHERE category = 'templates'
  AND setting_key IN ('CALENDAR_INVITE_SMS', 'CALENDAR_INVITE_SMS_HEARING')
  AND setting_value LIKE '%נקבעה לך פגישה%'
  AND setting_value NOT LIKE '%{{meetingTypeLabel}}%';

UPDATE platform_settings
SET setting_value = replace(setting_value, 'הוזמנת לדיון', 'הוזמנת ל{{meetingTypeLabel}}'),
    updated_at = NOW()
WHERE category = 'templates'
  AND setting_key = 'CALENDAR_INVITE_SMS_HEARING'
  AND setting_value LIKE '%הוזמנת לדיון%'
  AND setting_value NOT LIKE '%{{meetingTypeLabel}}%';

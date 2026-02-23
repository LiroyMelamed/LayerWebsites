-- Remove CEO email/name settings from platform_settings.
-- These are now derived from platform_admins → users table.
DELETE FROM platform_settings
 WHERE category = 'reminders'
   AND setting_key IN (
       'LICENSE_RENEWAL_REMINDERS_CEO_EMAIL',
       'LICENSE_RENEWAL_REMINDERS_CEO_NAME'
   );

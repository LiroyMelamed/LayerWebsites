-- Remove the EMAIL_REMINDERS_START_HOUR and EMAIL_REMINDERS_END_HOUR settings
-- from platform_settings. The scheduler now runs 24/7 and reminders are sent
-- at their exact scheduled_for time set by the user in RemindersScreen.

DELETE FROM platform_settings
WHERE category = 'reminders'
  AND key IN ('EMAIL_REMINDERS_START_HOUR', 'EMAIL_REMINDERS_END_HOUR');

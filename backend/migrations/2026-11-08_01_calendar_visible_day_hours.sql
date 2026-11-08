-- Firm calendar grid shows the working day, 08:00–19:00.
-- Only replaces the previous early-morning defaults.

BEGIN;

UPDATE platform_settings
SET setting_value = '08:00', updated_at = NOW()
WHERE category = 'calendar'
  AND setting_key = 'CALENDAR_VISIBLE_HOURS_START'
  AND setting_value IN ('05:00', '5:00');

UPDATE platform_settings
SET setting_value = '19:00', updated_at = NOW()
WHERE category = 'calendar'
  AND setting_key = 'CALENDAR_VISIBLE_HOURS_END'
  AND setting_value IN ('21:00', '22:00');

COMMIT;

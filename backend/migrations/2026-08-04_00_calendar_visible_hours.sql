-- Platform-admin control for which clock hours FullCalendar shows (slot axis).

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'CALENDAR_VISIBLE_HOURS_START', '05:00', 'time',
       'שעת התחלת תצוגת היומן', 'השעה המוקדמת ביותר שמוצגת בלוח השנה (למשל 05:00)'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'CALENDAR_VISIBLE_HOURS_START'
);

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
SELECT 'calendar', 'CALENDAR_VISIBLE_HOURS_END', '22:00', 'time',
       'שעת סיום תצוגת היומן', 'השעה המאוחרת ביותר שמוצגת בלוח השנה (למשל 22:00)'
WHERE NOT EXISTS (
    SELECT 1 FROM platform_settings WHERE category = 'calendar' AND setting_key = 'CALENDAR_VISIBLE_HOURS_END'
);

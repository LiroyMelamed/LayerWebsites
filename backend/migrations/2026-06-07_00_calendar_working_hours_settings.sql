-- Migration: Seed firm working days and working hours for the calendar

BEGIN;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'WORKING_DAYS', '0,1,2,3,4', 'string',
     'ימי עבודה של המשרד',
     'רשימת ימי השבוע בהם המשרד פעיל (0=ראשון, 1=שני, 2=שלישי, 3=רביעי, 4=חמישי, 5=שישי, 6=שבת). ימים שלא נבחרו לא יוצגו בלוח השנה.'),
    ('calendar', 'WORKING_HOURS_START', '08:00', 'time',
     'שעת תחילת יום עבודה',
     'השעה ממנה מתחיל יום העבודה במשרד. השעות מחוץ לטווח לא יוצגו בתצוגות שבועיות ויומיות.'),
    ('calendar', 'WORKING_HOURS_END', '18:00', 'time',
     'שעת סיום יום עבודה',
     'השעה בה מסתיים יום העבודה במשרד.')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

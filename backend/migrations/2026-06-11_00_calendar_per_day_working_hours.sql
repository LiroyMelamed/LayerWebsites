-- Migration: Per-day firm working hours for the calendar (JSON schedule)

BEGIN;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'WORKING_HOURS_BY_DAY',
     '{"0":{"open":true,"start":"08:00","end":"18:00"},"1":{"open":true,"start":"08:00","end":"18:00"},"2":{"open":true,"start":"08:00","end":"18:00"},"3":{"open":true,"start":"08:00","end":"18:00"},"4":{"open":true,"start":"08:00","end":"18:00"},"5":{"open":false,"start":"08:00","end":"13:00"},"6":{"open":false,"start":"08:00","end":"18:00"}}',
     'string',
     'שעות פעילות לפי יום',
     'לוח שעות פעילות לכל יום בשבוע (0=ראשון … 6=שבת). כל יום: open, start, end.')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

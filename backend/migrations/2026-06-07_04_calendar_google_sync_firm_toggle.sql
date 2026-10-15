-- Firm-wide toggle: allow lawyers to connect personal Google Calendar accounts.

BEGIN;

INSERT INTO platform_settings (category, setting_key, setting_value, value_type, label, description)
VALUES
    ('calendar', 'GOOGLE_SYNC_ENABLED', 'true', 'boolean',
     'אפשר סנכרון Google Calendar',
     'כאשר מופעל, עורכי דין יכולים לחבר את חשבון Google האישי שלהם ממסך היומן. כאשר כבוי, חיבור Google חדש וסנכרון ידני ייחסמו.')
ON CONFLICT (category, setting_key) DO NOTHING;

COMMIT;

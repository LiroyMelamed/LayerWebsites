-- Clarify signing OTP platform settings:
-- SIGNING_OTP_ENABLED = show OTP choice on the send/upload page
-- SIGNING_REQUIRE_OTP_DEFAULT = default selection for that choice (true = require)

UPDATE platform_settings
SET
    label = 'OTP בחתימה',
    description = 'כאשר פעיל: במסך שליחת מסמך לחתימה מוצגת בחירה האם לשלוח עם אימות OTP. כיבוי ההגדרה משפיע רק על שליחות חדשות — מסמכים שכבר נשלחו עם OTP נשארים עם OTP.'
WHERE category = 'signing' AND setting_key = 'SIGNING_OTP_ENABLED';

UPDATE platform_settings
SET
    label = 'OTP ברירת מחדל',
    description = 'ברירת המחדל בבחירת OTP במסך השליחה (מופעל = דרוש OTP)'
WHERE category = 'signing' AND setting_key = 'SIGNING_REQUIRE_OTP_DEFAULT';

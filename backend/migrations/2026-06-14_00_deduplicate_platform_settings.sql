-- Deduplicate platform_settings: remove legacy Smoove email fields and redundant FIRM_NAME.
-- Consolidate data into LAW_FIRM_NAME / COMPANY_NAME / SMTP_FROM_EMAIL before delete.

BEGIN;

-- Smoove sender name → Hebrew firm name (if empty)
UPDATE platform_settings AS target
   SET setting_value = source.setting_value,
       updated_at = NOW()
  FROM platform_settings AS source
 WHERE target.category = 'firm'
   AND target.setting_key = 'LAW_FIRM_NAME'
   AND (target.setting_value IS NULL OR BTRIM(target.setting_value) = '')
   AND source.category = 'messaging'
   AND source.setting_key = 'SMOOVE_EMAIL_FROM_NAME'
   AND source.setting_value IS NOT NULL
   AND BTRIM(source.setting_value) <> '';

-- English firm name → COMPANY_NAME (if empty or default seed)
UPDATE platform_settings AS target
   SET setting_value = source.setting_value,
       updated_at = NOW()
  FROM platform_settings AS source
 WHERE target.category = 'firm'
   AND target.setting_key = 'COMPANY_NAME'
   AND (
       target.setting_value IS NULL
       OR BTRIM(target.setting_value) = ''
       OR BTRIM(target.setting_value) = 'MelaMedia'
   )
   AND source.category = 'firm'
   AND source.setting_key = 'FIRM_NAME'
   AND source.setting_value IS NOT NULL
   AND BTRIM(source.setting_value) <> '';

DELETE FROM platform_settings
 WHERE (category = 'messaging' AND setting_key IN ('SMOOVE_EMAIL_FROM_EMAIL', 'SMOOVE_EMAIL_FROM_NAME'))
    OR (category = 'firm' AND setting_key = 'FIRM_NAME');

-- Clearer Hebrew labels (same keys, less confusion)
UPDATE platform_settings
   SET label = 'כתובת שולח מייל',
       description = 'כתובת המייל שממנה נשלחות הודעות (חייבת להתאים ל-SMTP_USER)'
 WHERE category = 'messaging' AND setting_key = 'SMTP_FROM_EMAIL';

UPDATE platform_settings
   SET label = 'שם המשרד (עברית)',
       description = 'שם המשרד בעברית — SMS, אימיילים, תבניות, ושם השולח במייל'
 WHERE category = 'firm' AND setting_key = 'LAW_FIRM_NAME';

UPDATE platform_settings
   SET label = 'שם המשרד (אנגלית)',
       description = 'שם המשרד באנגלית — תזכורות, מסמכים באנגלית, ומיתוג פנימי'
 WHERE category = 'firm' AND setting_key = 'COMPANY_NAME';

COMMIT;

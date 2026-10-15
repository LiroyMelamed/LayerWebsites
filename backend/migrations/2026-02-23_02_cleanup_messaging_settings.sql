-- Migration: Clean up messaging settings after Smoove→SMTP migration
-- Date: 2026-02-23
-- Description:
--   1. Rename SMTP_FROM_EMAIL label from "כתובת SMTP שולח" to "כתובת שולח מייל"
--   2. Delete the now-redundant SMOOVE_EMAIL_FROM_EMAIL setting (duplicated by SMTP_FROM_EMAIL)

BEGIN;

-- Rename SMTP_FROM_EMAIL label to a clean Hebrew label
UPDATE platform_settings
   SET label = 'כתובת שולח מייל',
       description = 'כתובת שליחת המייל'
 WHERE setting_key = 'SMTP_FROM_EMAIL';

-- Remove the old Smoove email sender address (no longer used)
DELETE FROM platform_settings
 WHERE setting_key = 'SMOOVE_EMAIL_FROM_EMAIL';

COMMIT;

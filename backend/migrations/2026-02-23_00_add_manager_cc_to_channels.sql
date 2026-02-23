-- Add manager_cc column and granular case notification types.
-- Replaces single CASE_UPDATE with per-field notification types.
-- Removes NOTIFY_ON_MANAGER_CHANGE and NOTIFY_ON_ESTIMATED_DATE_CHANGE platform settings
-- (replaced by granular channel config rows).

BEGIN;

-- ─── 1) Add manager_cc column ───────────────────────────────────────
ALTER TABLE notification_channel_config
    ADD COLUMN IF NOT EXISTS manager_cc BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 2) Add granular case notification types ────────────────────────
INSERT INTO notification_channel_config (notification_type, label, push_enabled, email_enabled, sms_enabled, admin_cc, manager_cc)
VALUES
    ('CASE_CREATED',        'יצירת תיק חדש',              TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_NAME_CHANGE',    'עדכון שם התיק',              TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_TYPE_CHANGE',    'עדכון סוג תיק',              FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_STAGE_CHANGE',   'עדכון שלבים',                 TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_CLOSED',         'סגירת תיק',                  TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_REOPENED',       'פתיחת תיק מחדש',             TRUE,  TRUE,  TRUE,  FALSE, TRUE),
    ('CASE_MANAGER_CHANGE', 'עדכון מנהל התיק',            FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_EST_DATE_CHANGE','עדכון תאריך סיום משוער',      FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_LICENSE_CHANGE', 'עדכון תוקף רישיון',          FALSE, FALSE, FALSE, FALSE, TRUE),
    ('CASE_COMPANY_CHANGE', 'עדכון שם חברה',              FALSE, FALSE, FALSE, FALSE, FALSE),
    ('CASE_TAGGED',         'הצמדת / ביטול הצמדת תיק',    FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (notification_type) DO NOTHING;

-- ─── 3) Remove old platform_settings that are now replaced ──────────
DELETE FROM platform_settings
WHERE category = 'notifications'
  AND setting_key IN ('NOTIFY_ON_MANAGER_CHANGE', 'NOTIFY_ON_ESTIMATED_DATE_CHANGE');

COMMIT;

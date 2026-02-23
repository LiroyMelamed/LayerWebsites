-- Add manager_cc column to notification_channel_config.
-- When TRUE, the case manager receives a copy of the notification.

BEGIN;

ALTER TABLE notification_channel_config
    ADD COLUMN IF NOT EXISTS manager_cc BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;

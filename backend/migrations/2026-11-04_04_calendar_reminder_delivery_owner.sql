-- New reminders authored in the calendar use its chosen audiences/offsets/channels.
-- Existing independently scheduled email reminders retain their prior delivery owner.
BEGIN;
ALTER TABLE scheduled_email_reminders ADD COLUMN IF NOT EXISTS calendar_managed boolean NOT NULL DEFAULT false;
COMMIT;

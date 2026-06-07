-- Optional draft case name for lead-mode calendar events (shown before convert-to-client).
BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS lead_case_name TEXT NULL;

COMMIT;

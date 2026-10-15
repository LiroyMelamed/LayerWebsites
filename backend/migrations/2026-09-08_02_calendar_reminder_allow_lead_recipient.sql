-- Reminder events store unregistered recipients in lead_name / lead_email
-- (see reminderCalendarSync + EventFormModal). Only leave/holiday are internal-only.

BEGIN;

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_internal_no_lead;

ALTER TABLE calendar_events
    ADD CONSTRAINT chk_calendar_events_internal_no_lead
    CHECK (
        event_type NOT IN ('leave', 'holiday')
        OR (lead_name IS NULL AND lead_phone IS NULL AND lead_email IS NULL)
    );

COMMIT;

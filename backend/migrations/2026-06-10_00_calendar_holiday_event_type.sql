-- Add 'holiday' to calendar_events.event_type whitelist and internal-scoped lead guard.

BEGIN;

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_event_type;

ALTER TABLE calendar_events
    ADD CONSTRAINT chk_calendar_events_event_type
    CHECK (event_type IN ('appointment', 'leave', 'hearing', 'reminder', 'holiday'));

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_internal_no_lead;

ALTER TABLE calendar_events
    ADD CONSTRAINT chk_calendar_events_internal_no_lead
    CHECK (
        event_type NOT IN ('leave', 'reminder', 'holiday')
        OR (lead_name IS NULL AND lead_phone IS NULL AND lead_email IS NULL)
    );

COMMIT;

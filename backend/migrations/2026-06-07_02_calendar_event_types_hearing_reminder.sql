-- Migration: expand calendar_events.event_type whitelist
--   appointment | leave | hearing | reminder
--
-- Uses TEXT + CHECK (not a Postgres ENUM). Idempotent for staging/production re-runs.

BEGIN;

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_event_type;

ALTER TABLE calendar_events
    ADD CONSTRAINT chk_calendar_events_event_type
    CHECK (event_type IN ('appointment', 'leave', 'hearing', 'reminder'));

-- Extend the leave-only no-lead guard to cover reminder as well.
ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_leave_no_lead;

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_internal_no_lead;

ALTER TABLE calendar_events
    ADD CONSTRAINT chk_calendar_events_internal_no_lead
    CHECK (
        event_type NOT IN ('leave', 'reminder')
        OR (lead_name IS NULL AND lead_phone IS NULL AND lead_email IS NULL)
    );

COMMIT;

-- Soft-cancel calendar meetings: keep the event on the calendar but stop reminders/invites.

BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'scheduled',
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by INTEGER NULL REFERENCES users(userid) ON DELETE SET NULL;

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_event_status;

ALTER TABLE calendar_events
    ADD CONSTRAINT chk_calendar_events_event_status
    CHECK (event_status IN ('scheduled', 'cancelled'));

COMMENT ON COLUMN calendar_events.event_status IS 'scheduled = active; cancelled = meeting cancelled, no further reminders';
COMMENT ON COLUMN calendar_events.cancelled_at IS 'When the meeting was marked cancelled';
COMMENT ON COLUMN calendar_events.cancelled_by IS 'User who cancelled the meeting';

CREATE INDEX IF NOT EXISTS idx_calendar_events_event_status_start
    ON calendar_events (event_status, start_time);

COMMIT;

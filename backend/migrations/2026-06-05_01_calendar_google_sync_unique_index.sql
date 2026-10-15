-- Ensure Google Calendar sync upserts have a matching unique constraint.
-- The controller upserts by (owner_id, google_event_id), so this partial unique
-- index is required for ON CONFLICT (owner_id, google_event_id)
-- WHERE google_event_id IS NOT NULL.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_owner_google_event
    ON public.calendar_events (owner_id, google_event_id)
    WHERE google_event_id IS NOT NULL;

COMMIT;

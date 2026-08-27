-- Allow the same lead phone on multiple calendar meetings for one owner.
-- Previously uq_calendar_events_owner_active_lead_phone blocked a second
-- appointment with an already-active lead phone (except recurring series).

DROP INDEX IF EXISTS uq_calendar_events_owner_active_lead_phone;

-- Allow calendar events to have registered clients AND lead/prospect contacts together.
-- Previously chk_calendar_events_lead_xor_client forced XOR (lead OR client/case).

ALTER TABLE calendar_events
    DROP CONSTRAINT IF EXISTS chk_calendar_events_lead_xor_client;

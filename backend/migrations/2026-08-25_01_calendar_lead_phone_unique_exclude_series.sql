-- Allow recurring calendar series to share the same active lead phone.
-- The old unique index treated each series occurrence as a separate lead,
-- so monthly/weekly creates aborted after the first INSERT (no transaction),
-- leaving an orphan event; a retry then looked like "N leads → N events".

DROP INDEX IF EXISTS uq_calendar_events_owner_active_lead_phone;

-- One active *non-series* lead per (owner, phone). Recurring rows (rrule set)
-- share the same prospect across occurrences and are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_owner_active_lead_phone
    ON calendar_events (owner_id, regexp_replace(lead_phone, '\D', '', 'g'))
    WHERE lead_phone IS NOT NULL
      AND case_id IS NULL
      AND (rrule IS NULL OR btrim(rrule) = '');

-- Migration: Calendar CRM upgrade
--   • event_type ('appointment' | 'leave')              — Requirement 5 (Leave management)
--   • lead_name / lead_phone / lead_email               — Requirement 4 (Prospect intake)
--   • last_reminder_sent_at                             — Requirement 6 (audit timestamp for dual push)
--   • Partial unique index: one active un-converted lead per (owner, normalized phone)
--   • Mutual-exclusion CHECK: row is either lead-mode OR client-mode, never both
--   • Filter indexes for /api/calendar/events (lawyer / client / case / firm-wide views)
--
-- Idempotent: every ADD COLUMN / CREATE INDEX / constraint is wrapped in IF NOT EXISTS
-- or a pg_constraint guard, so re-running on Neon staging or production is safe.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns on calendar_events
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS event_type            TEXT        NOT NULL DEFAULT 'appointment',
    ADD COLUMN IF NOT EXISTS lead_name             TEXT        NULL,
    ADD COLUMN IF NOT EXISTS lead_phone            TEXT        NULL,
    ADD COLUMN IF NOT EXISTS lead_email            TEXT        NULL,
    ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. event_type whitelist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendar_events_event_type'
    ) THEN
        ALTER TABLE calendar_events
            ADD CONSTRAINT chk_calendar_events_event_type
            CHECK (event_type IN ('appointment', 'leave'));
    END IF;
END $$;

-- 2b. Mutual exclusion: an event is EITHER lead-mode OR client-mode, never both.
--     Once /api/calendar/convert-lead promotes a lead, it MUST null out lead_* and
--     set case_id (and optionally client_user_id) in the same transaction.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendar_events_lead_xor_client'
    ) THEN
        ALTER TABLE calendar_events
            ADD CONSTRAINT chk_calendar_events_lead_xor_client
            CHECK (
                -- pure client / firm event
                (lead_name IS NULL AND lead_phone IS NULL AND lead_email IS NULL)
                OR
                -- pure lead intake (no case, no client user yet)
                (case_id IS NULL AND client_user_id IS NULL
                 AND (lead_name IS NOT NULL OR lead_phone IS NOT NULL OR lead_email IS NOT NULL))
            );
    END IF;
END $$;

-- 2c. Leave events shouldn't carry lead data (defensive — keeps the data model clean)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendar_events_leave_no_lead'
    ) THEN
        ALTER TABLE calendar_events
            ADD CONSTRAINT chk_calendar_events_leave_no_lead
            CHECK (
                event_type <> 'leave'
                OR (lead_name IS NULL AND lead_phone IS NULL AND lead_email IS NULL)
            );
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Partial unique index — one un-converted lead per (owner, normalized phone)
--    Phone is normalized to digits only, matching customerController.normalizePhoneDigits
--    Releases the lock as soon as the lead is converted (case_id set, lead_phone nulled).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_owner_active_lead_phone
    ON calendar_events (owner_id, regexp_replace(lead_phone, '\D', '', 'g'))
    WHERE lead_phone IS NOT NULL AND case_id IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Filter indexes for the new /api/calendar/events query shape
--    (lawyer / client / case / firm-wide, with optional event_type)
-- ─────────────────────────────────────────────────────────────────────────────

-- "My Calendar" + leave toggle: WHERE owner_id = $1 AND event_type = $2 AND start_time BETWEEN ...
CREATE INDEX IF NOT EXISTS idx_cal_events_owner_type_start
    ON calendar_events (owner_id, event_type, start_time);

-- "Firm Calendar" + leave toggle: WHERE event_type = $1 AND start_time BETWEEN ...
CREATE INDEX IF NOT EXISTS idx_cal_events_type_start
    ON calendar_events (event_type, start_time);

-- Case-level filter (Requirement 2 + 3): WHERE case_id = $1 ORDER BY start_time
CREATE INDEX IF NOT EXISTS idx_cal_events_case_start
    ON calendar_events (case_id, start_time)
    WHERE case_id IS NOT NULL;

-- Reminder worker: claims rows by event_type='appointment' so leave blocks aren't pinged
CREATE INDEX IF NOT EXISTS idx_cal_events_reminder_30m_appt
    ON calendar_events (start_time)
    WHERE reminder_sent_30m = FALSE AND event_type = 'appointment';

CREATE INDEX IF NOT EXISTS idx_cal_events_reminder_1d_appt
    ON calendar_events (start_time)
    WHERE reminder_sent_1d = FALSE AND event_type = 'appointment';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Optional hard-overlap guard for leave events.
--    Disabled by default — Requirement 5 specs a soft warning banner, not a 23P01 error.
--    Uncomment to enforce that a single lawyer cannot have two overlapping 'leave' rows.
-- ─────────────────────────────────────────────────────────────────────────────
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1 FROM pg_constraint WHERE conname = 'excl_calendar_events_leave_overlap'
--     ) THEN
--         ALTER TABLE calendar_events
--             ADD CONSTRAINT excl_calendar_events_leave_overlap
--             EXCLUDE USING GIST (
--                 owner_id     WITH =,
--                 tstzrange(start_time, end_time, '[)') WITH &&
--             )
--             WHERE (event_type = 'leave');
--     END IF;
-- END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants — re-run for safety on existing tenant roles (no-op if already granted)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            CONTINUE;
        END IF;
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_events TO %I', role_name);
    END LOOP;
END $$;

COMMIT;

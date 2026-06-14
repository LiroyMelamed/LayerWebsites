-- Migration: Create calendar_events and user_calendar_tokens tables
-- for the Synchronized Calendar module.
--
-- Architecture notes:
--   - ONE DB PER FIRM — no firm_id column needed.
--   - All timestamps stored as TIMESTAMPTZ (UTC).
--   - ical_feed_token: a stable, per-user secret used in the public WebCal
--     subscription URL (/api/calendar/feed/:token.ics). Changing it
--     invalidates all existing calendar subscriptions for that user.
--   - Google OAuth2 tokens are encrypted at the application layer before
--     being stored in google_access_token / google_refresh_token.
--   - reminder_sent_30m / reminder_sent_1d: boolean flags so the cron
--     worker only fires each reminder exactly once.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. calendar_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
    id              SERIAL      PRIMARY KEY,

    -- Owning lawyer / admin
    owner_id        INTEGER     NOT NULL REFERENCES users(userid) ON DELETE CASCADE,

    -- Optional link to an existing case
    case_id         INTEGER     NULL     REFERENCES cases(caseid) ON DELETE SET NULL,

    -- Core event fields
    title           TEXT        NOT NULL,
    description     TEXT        NULL,
    location        TEXT        NULL,

    -- Timestamps (required; end_time must be >= start_time — enforced below)
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    all_day         BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Recurrence (iCal RRULE string, e.g. 'FREQ=WEEKLY;BYDAY=MO')
    rrule           TEXT        NULL,

    -- Google Calendar sync: ID of the counterpart event in Google Calendar
    google_event_id TEXT        NULL,

    -- Push notification reminder flags (reset to FALSE when event is updated)
    reminder_sent_30m   BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_sent_1d    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_calendar_events_time_order CHECK (end_time >= start_time)
);

-- Index: all upcoming events for a specific owner (used by dashboard widget + cron)
CREATE INDEX IF NOT EXISTS idx_cal_events_owner_start
    ON calendar_events (owner_id, start_time);

-- Index: cron job — find events needing a reminder, not yet sent
CREATE INDEX IF NOT EXISTS idx_cal_events_reminder_30m
    ON calendar_events (start_time, reminder_sent_30m)
    WHERE reminder_sent_30m = FALSE;

CREATE INDEX IF NOT EXISTS idx_cal_events_reminder_1d
    ON calendar_events (start_time, reminder_sent_1d)
    WHERE reminder_sent_1d = FALSE;

-- Index: Google sync lookups
CREATE INDEX IF NOT EXISTS idx_cal_events_google_event_id
    ON calendar_events (google_event_id)
    WHERE google_event_id IS NOT NULL;

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION fn_calendar_events_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION fn_calendar_events_set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. user_calendar_tokens
--    One row per user. Stores:
--      • ical_feed_token  — public WebCal subscription secret (UUID)
--      • Google OAuth2 tokens (encrypted at app layer before storage)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_calendar_tokens (
    user_id                 INTEGER     PRIMARY KEY REFERENCES users(userid) ON DELETE CASCADE,

    -- WebCal / iCal subscription secret.
    -- NULL until the user first requests their feed URL.
    ical_feed_token         TEXT        NULL UNIQUE,

    -- Google OAuth2 integration
    google_connected        BOOLEAN     NOT NULL DEFAULT FALSE,
    google_email            TEXT        NULL,                 -- Google account email shown in UI
    google_access_token     TEXT        NULL,                 -- encrypted, short-lived
    google_refresh_token    TEXT        NULL,                 -- encrypted, long-lived
    google_token_expiry     TIMESTAMPTZ NULL,                 -- when access token expires
    google_scope            TEXT        NULL,                 -- granted OAuth scopes (space-separated)

    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION fn_user_calendar_tokens_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_calendar_tokens_updated_at ON user_calendar_tokens;
CREATE TRIGGER trg_user_calendar_tokens_updated_at
    BEFORE UPDATE ON user_calendar_tokens
    FOR EACH ROW EXECUTE FUNCTION fn_user_calendar_tokens_set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants — safe loop identical to existing migration pattern
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

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_events        TO %I', role_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_calendar_tokens  TO %I', role_name);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.calendar_events_id_seq              TO %I', role_name);
    END LOOP;
END $$;

COMMIT;

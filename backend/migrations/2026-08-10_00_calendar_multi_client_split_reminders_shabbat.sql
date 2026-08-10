-- Multi-client events, split lawyer/client reminder offsets, Shabbat deferral support.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT).

BEGIN;

-- Per-event clients (multi) with per-client RSVP
CREATE TABLE IF NOT EXISTS calendar_event_clients (
    event_id INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    invite_token TEXT,
    invite_status TEXT NOT NULL DEFAULT 'none'
        CHECK (invite_status IN ('none', 'pending', 'accepted', 'declined')),
    invite_responded_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_clients_user
    ON calendar_event_clients (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_event_clients_invite_token
    ON calendar_event_clients (invite_token)
    WHERE invite_token IS NOT NULL;

-- Backfill from legacy single client_user_id
INSERT INTO calendar_event_clients (event_id, user_id, invite_token, invite_status, invite_responded_at, sort_order)
SELECT ce.id,
       ce.client_user_id,
       ce.invite_token,
       COALESCE(ce.invite_status, 'none'),
       ce.invite_responded_at,
       0
FROM calendar_events ce
WHERE ce.client_user_id IS NOT NULL
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Split reminder offsets: lawyer vs client
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS lawyer_reminder_offsets JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS client_reminder_offsets JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migrate legacy reminder_offsets into both sides when new columns are empty
UPDATE calendar_events
SET lawyer_reminder_offsets = COALESCE(reminder_offsets, '[]'::jsonb),
    client_reminder_offsets = COALESCE(reminder_offsets, '[]'::jsonb)
WHERE (lawyer_reminder_offsets = '[]'::jsonb OR lawyer_reminder_offsets IS NULL)
  AND (client_reminder_offsets = '[]'::jsonb OR client_reminder_offsets IS NULL)
  AND jsonb_array_length(COALESCE(reminder_offsets, '[]'::jsonb)) > 0;

-- Track deferred Shabbat sends: map of "role:offset" -> ISO timestamptz
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS reminder_deferred_until JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Pending invite SMS deferred to Motzaei Shabbat
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS invite_deferred_until TIMESTAMPTZ;

DO $$
BEGIN
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_event_clients TO morlevy_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_event_clients TO ashrafessa_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_event_clients TO liroym'; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

COMMIT;

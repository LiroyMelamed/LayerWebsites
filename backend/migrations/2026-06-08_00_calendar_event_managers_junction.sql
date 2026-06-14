-- Many-to-many: calendar event ↔ lawyer/manager (like case_users for clients)

BEGIN;

CREATE TABLE IF NOT EXISTS calendar_event_managers (
    id          SERIAL      PRIMARY KEY,
    event_id    INTEGER     NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id     INTEGER     NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_managers_event_id
    ON calendar_event_managers (event_id);

CREATE INDEX IF NOT EXISTS idx_calendar_event_managers_user_id
    ON calendar_event_managers (user_id);

INSERT INTO calendar_event_managers (event_id, user_id)
SELECT id, manager_user_id
FROM calendar_events
WHERE manager_user_id IS NOT NULL
ON CONFLICT (event_id, user_id) DO NOTHING;

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_event_managers TO %I',
            role_name
        );
        EXECUTE format(
            'GRANT USAGE, SELECT ON SEQUENCE public.calendar_event_managers_id_seq TO %I',
            role_name
        );
    END LOOP;
END $$;

COMMIT;

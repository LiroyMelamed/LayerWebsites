BEGIN;
CREATE TABLE IF NOT EXISTS calendar_external_invitations (
    event_id integer NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    owner_id integer NOT NULL REFERENCES users(userid),
    external_uid text NOT NULL,
    recurrence_key text NOT NULL DEFAULT '',
    organizer text NOT NULL,
    sequence integer NOT NULL DEFAULT 0,
    source_stamp timestamptz,
    source text NOT NULL CHECK (source IN ('ics', 'google')),
    response_status text,
    PRIMARY KEY (owner_id, external_uid, recurrence_key)
);
CREATE INDEX IF NOT EXISTS calendar_external_invitations_event_idx ON calendar_external_invitations(event_id);
COMMIT;

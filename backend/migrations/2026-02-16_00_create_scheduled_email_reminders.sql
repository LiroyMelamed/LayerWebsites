-- Scheduled email reminders table for the notification / reminder system.
-- Stores rows imported from Excel (ClientName + Date) and tracks send status.

BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_email_reminders (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER     NULL REFERENCES users(userid) ON DELETE SET NULL,
    client_name     TEXT        NOT NULL,
    to_email        TEXT        NOT NULL,
    subject         TEXT        NULL,                          -- email subject (can be overridden by template)
    template_key    TEXT        NOT NULL DEFAULT 'GENERAL',    -- identifies the HTML template to use
    template_data   JSONB       NOT NULL DEFAULT '{}',         -- placeholder values for the template
    scheduled_for   TIMESTAMPTZ NOT NULL,                      -- when to send
    status          TEXT        NOT NULL DEFAULT 'PENDING'     -- PENDING | SENT | FAILED | CANCELLED
                    CHECK (status IN ('PENDING','SENT','FAILED','CANCELLED')),
    error           TEXT        NULL,                          -- error message if FAILED
    created_by      INTEGER     NULL,                          -- user who imported / created
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ NULL,                          -- actual send timestamp
    cancelled_at    TIMESTAMPTZ NULL
);

-- Indexes for the scheduler worker (pick PENDING rows due now)
CREATE INDEX IF NOT EXISTS idx_ser_status_scheduled
    ON scheduled_email_reminders (status, scheduled_for)
    WHERE status = 'PENDING';

-- Grants (same pattern as other migrations)
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduled_email_reminders TO %I', role_name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.scheduled_email_reminders_id_seq TO %I', role_name);
        END IF;
    END LOOP;
END $$;

COMMIT;

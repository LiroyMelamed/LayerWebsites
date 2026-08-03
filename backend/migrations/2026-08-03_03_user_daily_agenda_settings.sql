-- Per lawyer/admin daily agenda digest preferences.
CREATE TABLE IF NOT EXISTS user_daily_agenda_settings (
    user_id         INTEGER PRIMARY KEY REFERENCES users(userid) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    channels        TEXT NOT NULL DEFAULT 'email', -- comma list: email, sms
    recipients      TEXT NOT NULL DEFAULT '',      -- phones/emails comma-separated; empty = self
    send_time       TEXT NOT NULL DEFAULT '07:30', -- HH:MM Asia/Jerusalem
    last_sent_date  TEXT NOT NULL DEFAULT '',     -- YYYY-MM-DD Israel
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner', 'morlevy_app', 'ashrafessa_app', 'melamedlaw_app']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_daily_agenda_settings TO %I',
            role_name
        );
    END LOOP;
END $$;

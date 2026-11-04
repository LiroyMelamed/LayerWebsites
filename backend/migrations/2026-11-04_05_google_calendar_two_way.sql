BEGIN;
-- Links survive a local deletion so it can be propagated, including after a crash.
CREATE TABLE IF NOT EXISTS calendar_google_links (
    owner_id integer NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    account_email text NOT NULL,
    remote_id text NOT NULL,
    event_id integer REFERENCES calendar_events(id) ON DELETE SET NULL,
    local_key integer NOT NULL,
    base_local jsonb,
    base_remote jsonb,
    remote_etag text,
    suppressed boolean NOT NULL DEFAULT false,
    conflict jsonb,
    resolution text CHECK (resolution IN ('local','google')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id,account_email,remote_id),
    UNIQUE(owner_id,account_email,local_key)
);
ALTER TABLE user_calendar_tokens ADD COLUMN IF NOT EXISTS google_last_sync_at timestamptz;
ALTER TABLE user_calendar_tokens ADD COLUMN IF NOT EXISTS google_sync_error text;
-- Copy existing dedicated DB application grants, never grant PUBLIC.
DO $$
DECLARE data_owner text; permission record;
BEGIN
    SELECT pg_get_userbyid(relowner) INTO data_owner FROM pg_class WHERE oid='calendar_events'::regclass;
    EXECUTE format('ALTER TABLE calendar_google_links OWNER TO %I',data_owner);
    FOR permission IN SELECT pg_get_userbyid(a.grantee) AS role_name,a.privilege_type
        FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
        WHERE c.oid='calendar_events'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner
        AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
    LOOP
        EXECUTE format('GRANT %s ON calendar_google_links TO %I',permission.privilege_type,permission.role_name);
    END LOOP;
END $$;
COMMIT;

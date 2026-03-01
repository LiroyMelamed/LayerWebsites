-- Stage files: lawyers can attach files to individual case stages.
-- Clients linked to the case can view them.

CREATE TABLE IF NOT EXISTS stage_files (
    id              SERIAL      PRIMARY KEY,
    caseid          INTEGER     NOT NULL REFERENCES cases(caseid) ON DELETE CASCADE,
    stage           INTEGER     NOT NULL CHECK (stage >= 1),
    file_key        TEXT        NOT NULL,           -- R2 storage key
    file_name       VARCHAR(500) NOT NULL,
    file_ext        VARCHAR(20),
    file_mime       VARCHAR(200),
    file_size       BIGINT,
    uploaded_by     INTEGER     NOT NULL REFERENCES users(userid) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_files_caseid ON stage_files(caseid);
CREATE INDEX IF NOT EXISTS idx_stage_files_caseid_stage ON stage_files(caseid, stage);

-- Grant permissions to the app role(s) – works in both dev (liroym) and prod (melamedlaw_app).
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'melamedlaw_app']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stage_files TO %I', role_name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.stage_files_id_seq TO %I', role_name);
        END IF;
    END LOOP;
END $$;

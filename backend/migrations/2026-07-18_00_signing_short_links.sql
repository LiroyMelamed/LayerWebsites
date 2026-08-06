-- Short public signing links: slug → JWT mapping.
-- Keeps existing JWT verification; SMS/email share https://<domain>/s/<slug>.

CREATE TABLE IF NOT EXISTS signing_short_links (
    slug        VARCHAR(16) PRIMARY KEY,
    token       TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signing_short_links_expires_at
    ON signing_short_links (expires_at);

-- Migration often runs as postgres; grant to known tenant app roles (best-effort).
GRANT SELECT, INSERT, UPDATE, DELETE ON signing_short_links TO CURRENT_USER;
DO $$
BEGIN
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON signing_short_links TO morlevy_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON signing_short_links TO ashrafessa_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON signing_short_links TO liroym'; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

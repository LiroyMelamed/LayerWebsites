-- Short public signing links: slug → JWT mapping.
-- Keeps existing JWT verification; SMS/email share https://<domain>/s/<slug>.

CREATE TABLE IF NOT EXISTS signing_short_links (
    slug        VARCHAR(16) PRIMARY KEY,
    token       TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signing_short_links_expires_at
    ON signing_short_links (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON signing_short_links TO CURRENT_USER;
-- Note: on each tenant, also GRANT to the app DB role if different from migration runner
-- e.g. GRANT ... TO ashrafessa_app / morlevy_app / melamedlaw_app;

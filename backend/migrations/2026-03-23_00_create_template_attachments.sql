-- Template attachments: files attached to email templates or reminder templates
CREATE TABLE IF NOT EXISTS template_attachments (
    id SERIAL PRIMARY KEY,
    template_type VARCHAR(20) NOT NULL CHECK (template_type IN ('email', 'reminder')),
    template_key VARCHAR(100) NOT NULL,
    file_key TEXT NOT NULL,            -- R2 object key
    filename VARCHAR(255) NOT NULL,    -- original filename shown in email
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    file_size INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(userid) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_attachments_lookup
    ON template_attachments (template_type, template_key);

-- Grant permissions (role-safe: works on both dev and prod)
DO $$
DECLARE role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.template_attachments TO %I', role_name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.template_attachments_id_seq TO %I', role_name);
        END IF;
    END LOOP;
END $$;

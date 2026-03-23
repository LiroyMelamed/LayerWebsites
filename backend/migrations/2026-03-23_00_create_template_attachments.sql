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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON template_attachments TO neondb_owner;
GRANT USAGE, SELECT ON SEQUENCE template_attachments_id_seq TO neondb_owner;

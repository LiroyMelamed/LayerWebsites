-- Create reminder_templates table for user-created reminder templates
CREATE TABLE IF NOT EXISTS reminder_templates (
    id SERIAL PRIMARY KEY,
    template_key VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    subject_template TEXT NOT NULL DEFAULT 'תזכורת: [[subject]]',
    body_html TEXT NOT NULL DEFAULT 'שלום [[client_name]],<br><br>[[body]]<br><br>בברכה,<br>[[firm_name]]',
    created_by INTEGER REFERENCES users(userid) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON reminder_templates TO liroym;
GRANT USAGE, SELECT ON SEQUENCE reminder_templates_id_seq TO liroym;

-- A draft is based on one published revision. A later publication must not be
-- overwritten by an editor that was opened before it.
ALTER TABLE signing_template_versions ADD COLUMN IF NOT EXISTS base_version_id uuid;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_template_draft_base_fk') THEN
        ALTER TABLE signing_template_versions ADD CONSTRAINT signing_template_draft_base_fk
            FOREIGN KEY (owner_context_id,base_version_id) REFERENCES signing_template_versions(owner_context_id,id);
    END IF;
END $$;

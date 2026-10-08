BEGIN;
ALTER TABLE signing_package_revisions ADD COLUMN IF NOT EXISTS template_version_id uuid;
ALTER TABLE signing_package_revisions ADD COLUMN IF NOT EXISTS authorized_by_userid integer REFERENCES users(userid);
ALTER TABLE signing_package_revisions DROP CONSTRAINT IF EXISTS signing_package_revisions_workflow_state_check;
ALTER TABLE signing_package_revisions ADD CONSTRAINT signing_package_revisions_workflow_state_check CHECK (workflow_state IN
 ('draft','awaiting_approval','authorized_preparing','active','attention','complete','cancelled','superseded','expired','replacement_pending'));
CREATE TABLE IF NOT EXISTS signing_replacement_drafts (
 id uuid PRIMARY KEY,owner_context_id uuid NOT NULL,package_id uuid NOT NULL,source_revision_id uuid NOT NULL,
 created_by integer NOT NULL REFERENCES users(userid),reason text NOT NULL CHECK(length(reason)>0 AND length(reason)<=1000),
 source_state text NOT NULL,stop_current boolean NOT NULL,content jsonb NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published')),replacement_revision_id uuid,
 document_count integer NOT NULL DEFAULT 0 CHECK(document_count>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),published_at timestamptz,
 UNIQUE(owner_context_id,package_id,source_revision_id),
 FOREIGN KEY(owner_context_id,source_revision_id,package_id) REFERENCES signing_package_revisions(owner_context_id,id,package_id),
 FOREIGN KEY(owner_context_id,replacement_revision_id,package_id) REFERENCES signing_package_revisions(owner_context_id,id,package_id)
);
CREATE OR REPLACE FUNCTION signing_v2_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.workflow_state <> 'draft' AND (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.revision_hash <> OLD.revision_hash
 OR NEW.package_id <> OLD.package_id OR NEW.owner_context_id <> OLD.owner_context_id OR NEW.deadline IS DISTINCT FROM OLD.deadline
 OR NEW.revision_no <> OLD.revision_no OR NEW.replaces_revision_id IS DISTINCT FROM OLD.replaces_revision_id
 OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id OR NEW.authorized_by_userid IS DISTINCT FROM OLD.authorized_by_userid) THEN
 RAISE EXCEPTION 'Authorized signing revision is immutable' USING ERRCODE = '23514';
 END IF; RETURN NEW;
END $$;
COMMIT;

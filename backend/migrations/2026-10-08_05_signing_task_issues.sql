BEGIN;
ALTER TABLE signing_tasks DROP CONSTRAINT IF EXISTS signing_tasks_state_check;
ALTER TABLE signing_tasks ADD CONSTRAINT signing_tasks_state_check CHECK (state IN
    ('blocked','ready','accepted','declined','clarification','expired','cancelled'));

ALTER TABLE signing_package_revisions ADD COLUMN IF NOT EXISTS issue_attention_base text CHECK (issue_attention_base IN ('active','attention'));

CREATE TABLE IF NOT EXISTS signing_task_issues (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    task_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('decline','clarify')),
    reason text NOT NULL CHECK (length(reason)<=2000),
    actor_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
    resolution text CHECK (length(resolution) BETWEEN 1 AND 2000),
    resolved_by integer REFERENCES users(userid),
    resolved_at timestamptz,
    UNIQUE(owner_context_id,id),
    FOREIGN KEY(owner_context_id,task_id) REFERENCES signing_tasks(owner_context_id,id),
    CHECK(kind<>'clarify' OR length(reason)>0),
    CHECK((state='resolved')=(resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS signing_task_issues_open ON signing_task_issues(owner_context_id,task_id) WHERE state='open';
CREATE OR REPLACE FUNCTION signing_v2_task_issue_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Signing task issue history is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='resolved' OR NEW.id<>OLD.id OR NEW.owner_context_id<>OLD.owner_context_id
        OR NEW.task_id<>OLD.task_id OR NEW.kind<>OLD.kind OR NEW.reason<>OLD.reason
        OR NEW.actor_key<>OLD.actor_key OR NEW.created_at<>OLD.created_at THEN
        RAISE EXCEPTION 'Signing task issue history is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS signing_task_issues_immutable ON signing_task_issues;
CREATE TRIGGER signing_task_issues_immutable BEFORE UPDATE OR DELETE ON signing_task_issues
    FOR EACH ROW EXECUTE FUNCTION signing_v2_task_issue_immutable();
COMMIT;

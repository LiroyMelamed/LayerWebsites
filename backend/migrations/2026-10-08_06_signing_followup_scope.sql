-- Optional task allowlist for explicitly reviewed follow-ups. Original invitation
-- and download grants retain their existing semantics (NULL).
ALTER TABLE signing_public_grants ADD COLUMN IF NOT EXISTS allowed_task_ids uuid[];
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_grant_task_scope_valid') THEN
        ALTER TABLE signing_public_grants ADD CONSTRAINT signing_grant_task_scope_valid
            CHECK (allowed_task_ids IS NULL OR (purpose='sign' AND cardinality(allowed_task_ids)>0
                AND array_position(allowed_task_ids,NULL) IS NULL));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION signing_guard_grant_task_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.allowed_task_ids IS DISTINCT FROM OLD.allowed_task_ids THEN
        RAISE EXCEPTION 'A published signing grant task scope is immutable';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS signing_grant_task_scope_immutable ON signing_public_grants;
CREATE TRIGGER signing_grant_task_scope_immutable BEFORE UPDATE ON signing_public_grants
    FOR EACH ROW EXECUTE FUNCTION signing_guard_grant_task_scope();

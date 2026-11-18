-- Isolated authoring copies retain exactly the same source bytes, but never
-- overwrite the private source's current mappings or another recipe revision.
BEGIN;
ALTER TABLE signing_word_sources ADD COLUMN IF NOT EXISTS working_copy_id uuid;
ALTER TABLE signing_word_sources ADD COLUMN IF NOT EXISTS parent_source_id uuid;
ALTER TABLE signing_word_sources ADD COLUMN IF NOT EXISTS parent_source_version integer;
DO $$ DECLARE constraint_name text; BEGIN
    FOR constraint_name IN SELECT conname FROM pg_constraint
        WHERE conrelid='signing_word_sources'::regclass AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (owner_context_id, created_by, source_sha256)'
    LOOP EXECUTE format('ALTER TABLE signing_word_sources DROP CONSTRAINT %I', constraint_name); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS signing_word_original_dedup
    ON signing_word_sources(owner_context_id,created_by,source_sha256) WHERE working_copy_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS signing_word_working_copy_dedup
    ON signing_word_sources(owner_context_id,created_by,working_copy_id) WHERE working_copy_id IS NOT NULL;
CREATE OR REPLACE FUNCTION signing_word_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.owner_context_id<>OLD.owner_context_id OR NEW.created_by<>OLD.created_by
        OR NEW.source_sha256<>OLD.source_sha256 OR NEW.object_key<>OLD.object_key OR NEW.bytes<>OLD.bytes
        OR NEW.working_copy_id IS DISTINCT FROM OLD.working_copy_id
        OR NEW.parent_source_id IS DISTINCT FROM OLD.parent_source_id
        OR NEW.parent_source_version IS DISTINCT FROM OLD.parent_source_version THEN
        RAISE EXCEPTION 'Immutable Word original' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
COMMIT;

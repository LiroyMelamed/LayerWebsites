-- Immutable preflight proof and private grant recovery for durable dispatch.
BEGIN;
ALTER TABLE signing_artifacts ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(userid);
ALTER TABLE signing_authorities ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(userid);
ALTER TABLE signing_public_grants ADD COLUMN IF NOT EXISTS encrypted_token jsonb;

CREATE TABLE IF NOT EXISTS signing_preflights (
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    revision_hash text NOT NULL CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
    preview_hash text NOT NULL CHECK (preview_hash ~ '^[a-f0-9]{64}$'),
    manifest jsonb NOT NULL,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_context_id,revision_id),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id)
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_preflights_immutable') THEN
        CREATE TRIGGER signing_preflights_immutable BEFORE UPDATE OR DELETE ON signing_preflights
            FOR EACH ROW EXECUTE FUNCTION signing_v2_immutable();
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS signing_participations_authority ON signing_participations(owner_context_id,authority_id);
DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee <> 'PUBLIC'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT ON signing_preflights TO %I',r.grantee);
    END LOOP;
END $$;
COMMIT;

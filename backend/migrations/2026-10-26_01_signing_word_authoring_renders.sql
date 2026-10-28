BEGIN;
-- Private, immutable original-DOCX authoring views. This does not publish or send
-- a signing revision, modify a Word source, or grant any new application action.
CREATE TABLE IF NOT EXISTS signing_word_authoring_renders (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    source_id uuid NOT NULL,
    source_version integer NOT NULL CHECK (source_version > 0),
    created_by integer NOT NULL REFERENCES users(userid),
    source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    inputs_hash text NOT NULL CHECK (inputs_hash ~ '^[a-f0-9]{64}$'),
    pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
    pdf_object_key text NOT NULL CHECK (length(pdf_object_key) BETWEEN 1 AND 1000),
    pdf_bytes bigint NOT NULL CHECK (pdf_bytes BETWEEN 1 AND 20971520),
    page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 200),
    map_sha256 text NOT NULL CHECK (map_sha256 ~ '^[a-f0-9]{64}$'),
    map_object_key text NOT NULL CHECK (length(map_object_key) BETWEEN 1 AND 1000),
    map_bytes bigint NOT NULL CHECK (map_bytes BETWEEN 1 AND 8388608),
    model_version integer NOT NULL CHECK (model_version=2),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (owner_context_id,source_id) REFERENCES signing_word_sources(owner_context_id,id),
    UNIQUE (owner_context_id,created_by,inputs_hash)
);
CREATE INDEX IF NOT EXISTS signing_word_authoring_renders_private_source
    ON signing_word_authoring_renders(owner_context_id,created_by,source_id,created_at DESC);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_word_authoring_renders_immutable') THEN
        CREATE TRIGGER signing_word_authoring_renders_immutable BEFORE UPDATE OR DELETE ON signing_word_authoring_renders
            FOR EACH ROW EXECUTE FUNCTION signing_word_record_immutable();
    END IF;
END $$;
-- Match incumbent signing table grants; no PUBLIC/new user/permission grant.
DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee<>'PUBLIC'
    LOOP EXECUTE format('GRANT SELECT,INSERT ON TABLE signing_word_authoring_renders TO %I',r.grantee); END LOOP;
END $$;
COMMIT;

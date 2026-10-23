-- Private Word originals and mapping revisions. Filled PDFs are per-use and
-- never become reusable signing-template sources.
BEGIN;

CREATE TABLE IF NOT EXISTS signing_word_sources (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    created_by integer NOT NULL REFERENCES users(userid),
    source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    object_key text NOT NULL CHECK (length(object_key) BETWEEN 1 AND 1000),
    bytes bigint NOT NULL CHECK (bytes BETWEEN 1 AND 20971520),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    bindings_hash text NOT NULL CHECK (bindings_hash ~ '^[a-f0-9]{64}$'),
    roles jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(roles)='array' AND jsonb_array_length(roles)<=40),
    bindings jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(bindings)='array' AND jsonb_array_length(bindings)<=1000),
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,created_by,source_sha256),
    CHECK (pg_column_size(roles)<=32768 AND pg_column_size(bindings)<=1048576)
);

CREATE TABLE IF NOT EXISTS signing_word_source_versions (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    source_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
    bindings_hash text NOT NULL CHECK (bindings_hash ~ '^[a-f0-9]{64}$'),
    roles jsonb NOT NULL CHECK (jsonb_typeof(roles)='array' AND jsonb_array_length(roles)<=40),
    bindings jsonb NOT NULL CHECK (jsonb_typeof(bindings)='array' AND jsonb_array_length(bindings)<=1000),
    created_by integer NOT NULL REFERENCES users(userid),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,source_id,version),
    FOREIGN KEY (owner_context_id,source_id) REFERENCES signing_word_sources(owner_context_id,id),
    CHECK (pg_column_size(roles)<=32768 AND pg_column_size(bindings)<=1048576)
);

CREATE TABLE IF NOT EXISTS signing_word_previews (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    source_id uuid NOT NULL,
    source_version integer NOT NULL CHECK (source_version > 0),
    created_by integer NOT NULL REFERENCES users(userid),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
    inputs_hash text NOT NULL CHECK (inputs_hash ~ '^[a-f0-9]{64}$'),
    values_hash text NOT NULL CHECK (values_hash ~ '^[a-f0-9]{64}$'),
    source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    bindings_hash text NOT NULL CHECK (bindings_hash ~ '^[a-f0-9]{64}$'),
    filled_docx_sha256 text NOT NULL CHECK (filled_docx_sha256 ~ '^[a-f0-9]{64}$'),
    pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
    object_key text NOT NULL CHECK (length(object_key) BETWEEN 1 AND 1000),
    bytes bigint NOT NULL CHECK (bytes BETWEEN 1 AND 20971520),
    page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 200),
    client_id integer REFERENCES users(userid),
    case_id integer REFERENCES cases(caseid),
    converter jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(converter)='object' AND pg_column_size(converter)<=32768),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,created_by,idempotency_key),
    FOREIGN KEY (owner_context_id,source_id) REFERENCES signing_word_sources(owner_context_id,id)
);

CREATE INDEX IF NOT EXISTS signing_word_sources_private_list
    ON signing_word_sources(owner_context_id,created_by,updated_at DESC,id) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS signing_word_previews_private_source
    ON signing_word_previews(owner_context_id,created_by,source_id,created_at DESC);

CREATE OR REPLACE FUNCTION signing_word_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Immutable Word document record' USING ERRCODE='23514';
END $$;
CREATE OR REPLACE FUNCTION signing_word_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.owner_context_id<>OLD.owner_context_id OR NEW.created_by<>OLD.created_by
        OR NEW.source_sha256<>OLD.source_sha256 OR NEW.object_key<>OLD.object_key OR NEW.bytes<>OLD.bytes THEN
        RAISE EXCEPTION 'Immutable Word original' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_word_original_immutable') THEN
        CREATE TRIGGER signing_word_original_immutable BEFORE UPDATE ON signing_word_sources
            FOR EACH ROW EXECUTE FUNCTION signing_word_original_immutable();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_word_versions_immutable') THEN
        CREATE TRIGGER signing_word_versions_immutable BEFORE UPDATE OR DELETE ON signing_word_source_versions
            FOR EACH ROW EXECUTE FUNCTION signing_word_record_immutable();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_word_previews_immutable') THEN
        CREATE TRIGGER signing_word_previews_immutable BEFORE UPDATE OR DELETE ON signing_word_previews
            FOR EACH ROW EXECUTE FUNCTION signing_word_record_immutable();
    END IF;
END $$;

-- Match existing signing DML grants; never create a PUBLIC grant.
DO $$ DECLARE r record; t text; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee<>'PUBLIC'
    LOOP
        FOREACH t IN ARRAY ARRAY['signing_word_sources','signing_word_source_versions','signing_word_previews'] LOOP
            EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I TO %I',t,r.grantee);
        END LOOP;
    END LOOP;
END $$;
COMMIT;

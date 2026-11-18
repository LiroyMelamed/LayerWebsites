-- Reusable, unfilled package sources. Existing templates and all sent packages
-- are unchanged. Office sharing is explicit and never inferred from old rows.
BEGIN;
CREATE TABLE IF NOT EXISTS signing_package_recipes (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    owner_userid integer NOT NULL REFERENCES users(userid),
    visibility text NOT NULL DEFAULT 'office' CHECK (visibility IN ('office','private')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    definition jsonb NOT NULL CHECK (definition->>'schemaVersion'='3' AND pg_column_size(definition)<=1048576),
    definition_hash text NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
    sharing_review_hash text CHECK (sharing_review_hash ~ '^[a-f0-9]{64}$'),
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_context_id,id),
    CHECK (visibility='private' OR (sharing_review_hash IS NOT NULL AND sharing_review_hash=definition_hash))
);
CREATE TABLE IF NOT EXISTS signing_package_recipe_versions (
    owner_context_id uuid NOT NULL,
    recipe_id uuid NOT NULL,
    version integer NOT NULL CHECK(version>0),
    definition jsonb NOT NULL CHECK (definition->>'schemaVersion'='3' AND pg_column_size(definition)<=1048576),
    definition_hash text NOT NULL CHECK(definition_hash ~ '^[a-f0-9]{64}$'),
    created_by integer NOT NULL REFERENCES users(userid),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_context_id,recipe_id,version),
    FOREIGN KEY(owner_context_id,recipe_id) REFERENCES signing_package_recipes(owner_context_id,id)
);
CREATE TABLE IF NOT EXISTS signing_package_preparations (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    recipe_id uuid NOT NULL,
    recipe_version integer NOT NULL,
    created_by integer NOT NULL REFERENCES users(userid),
    request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    origin jsonb NOT NULL,
    definition jsonb NOT NULL CHECK (pg_column_size(definition)<=1048576),
    access_refs jsonb NOT NULL,
    data_values jsonb NOT NULL DEFAULT '{}' CHECK (pg_column_size(data_values)<=1048576),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_context_id,id),
    FOREIGN KEY(owner_context_id,recipe_id,recipe_version) REFERENCES signing_package_recipe_versions(owner_context_id,recipe_id,version)
);
CREATE INDEX IF NOT EXISTS signing_package_recipes_library ON signing_package_recipes(owner_context_id,updated_at DESC) WHERE NOT archived;
CREATE OR REPLACE FUNCTION signing_recipe_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable package source version' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS signing_package_recipe_version_immutable ON signing_package_recipe_versions;
CREATE TRIGGER signing_package_recipe_version_immutable BEFORE UPDATE OR DELETE ON signing_package_recipe_versions
    FOR EACH ROW EXECUTE FUNCTION signing_recipe_version_immutable();
DROP TRIGGER IF EXISTS signing_package_preparation_immutable ON signing_package_preparations;
CREATE TRIGGER signing_package_preparation_immutable BEFORE UPDATE OR DELETE ON signing_package_preparations
    FOR EACH ROW EXECUTE FUNCTION signing_recipe_version_immutable();
DO $$ DECLARE r record; t text; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee<>'PUBLIC'
    LOOP
        FOREACH t IN ARRAY ARRAY['signing_package_recipes','signing_package_recipe_versions','signing_package_preparations'] LOOP
            EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I TO %I',t,r.grantee);
        END LOOP;
    END LOOP;
END $$;
COMMIT;

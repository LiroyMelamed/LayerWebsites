BEGIN;
CREATE TABLE IF NOT EXISTS signing_package_recipe_drafts (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    created_by integer NOT NULL REFERENCES users(userid),
    recipe_id uuid,
    base_version integer NOT NULL DEFAULT 0 CHECK(base_version>=0),
    version integer NOT NULL DEFAULT 1 CHECK(version>0),
    visibility text NOT NULL CHECK(visibility IN ('office','private')),
    definition jsonb NOT NULL CHECK(definition->>'schemaVersion'='3' AND pg_column_size(definition)<=1048576),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((recipe_id IS NULL AND base_version=0) OR (recipe_id IS NOT NULL AND base_version>0)),
    FOREIGN KEY(owner_context_id,recipe_id) REFERENCES signing_package_recipes(owner_context_id,id)
);
CREATE INDEX IF NOT EXISTS signing_package_recipe_drafts_owner ON signing_package_recipe_drafts(owner_context_id,created_by,updated_at DESC);
DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee<>'PUBLIC'
    LOOP EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE signing_package_recipe_drafts TO %I',r.grantee); END LOOP;
END $$;
COMMIT;

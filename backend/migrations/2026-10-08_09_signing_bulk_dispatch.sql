BEGIN;
CREATE TABLE IF NOT EXISTS signing_bulk_requests (
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    created_by integer NOT NULL REFERENCES users(userid),
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    operation_id uuid NOT NULL REFERENCES signing_operations(id),
    PRIMARY KEY(owner_context_id,created_by,idempotency_key)
);
CREATE TABLE IF NOT EXISTS signing_delivery_items (
    owner_context_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    package_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    person_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    profile_version integer NOT NULL,
    binding jsonb NOT NULL,
    state text NOT NULL DEFAULT 'included' CHECK(state IN ('included','cancelled','skipped_completed')),
    error_code text,
    PRIMARY KEY(owner_context_id,delivery_id,profile_id),
    FOREIGN KEY(owner_context_id,delivery_id) REFERENCES signing_deliveries(owner_context_id,id),
    FOREIGN KEY(owner_context_id,package_id) REFERENCES signing_packages(owner_context_id,id),
    FOREIGN KEY(owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    FOREIGN KEY(owner_context_id,profile_id,person_id,revision_id) REFERENCES signing_delivery_profiles(owner_context_id,id,person_id,revision_id)
);
CREATE INDEX IF NOT EXISTS signing_delivery_items_profile ON signing_delivery_items(owner_context_id,profile_id,delivery_id) WHERE state='included';
CREATE UNIQUE INDEX IF NOT EXISTS signing_bulk_operations_request ON signing_operations(owner_context_id,actor_key,request_hash) WHERE kind='bulk_action';
CREATE OR REPLACE FUNCTION signing_delivery_item_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW)-'state'-'error_code') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'error_code') THEN
        RAISE EXCEPTION 'Reviewed delivery bindings are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS signing_delivery_item_immutable ON signing_delivery_items;
CREATE TRIGGER signing_delivery_item_immutable BEFORE UPDATE ON signing_delivery_items
    FOR EACH ROW EXECUTE FUNCTION signing_delivery_item_immutable();
COMMIT;

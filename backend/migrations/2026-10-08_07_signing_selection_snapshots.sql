BEGIN;
CREATE TABLE IF NOT EXISTS signing_selection_snapshots (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    created_by integer NOT NULL REFERENCES users(userid),
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    scope_hash text NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
    selection_hash text NOT NULL CHECK(selection_hash ~ '^[a-f0-9]{64}$'),
    source_filter jsonb NOT NULL,
    items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '10 minutes'),
    UNIQUE(owner_context_id,id),
    UNIQUE(owner_context_id,created_by,idempotency_key),
    CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS signing_selection_actor_expiry ON signing_selection_snapshots(owner_context_id,created_by,expires_at DESC);
CREATE OR REPLACE FUNCTION signing_selection_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Frozen signing selections are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS signing_selection_snapshot_immutable ON signing_selection_snapshots;
CREATE TRIGGER signing_selection_snapshot_immutable BEFORE UPDATE ON signing_selection_snapshots
    FOR EACH ROW EXECUTE FUNCTION signing_selection_snapshot_immutable();
COMMIT;

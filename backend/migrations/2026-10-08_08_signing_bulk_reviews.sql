BEGIN;
CREATE TABLE IF NOT EXISTS signing_bulk_reviews (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    created_by integer NOT NULL REFERENCES users(userid),
    selection_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
    purpose text NOT NULL CHECK(purpose IN ('reminder','resend','completed_copy')),
    channel text CHECK(channel IN ('email','sms')),
    plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    FOREIGN KEY(owner_context_id,selection_id) REFERENCES signing_selection_snapshots(owner_context_id,id),
    UNIQUE(owner_context_id,id),
    UNIQUE(owner_context_id,created_by,idempotency_key),
    CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS signing_bulk_reviews_actor ON signing_bulk_reviews(owner_context_id,created_by,created_at DESC);
DROP TRIGGER IF EXISTS signing_bulk_review_immutable ON signing_bulk_reviews;
CREATE TRIGGER signing_bulk_review_immutable BEFORE UPDATE ON signing_bulk_reviews
    FOR EACH ROW EXECUTE FUNCTION signing_selection_snapshot_immutable();
COMMIT;

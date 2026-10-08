-- An office association, never a grant of package access or signing authority.
-- Nullable for all historical packages; no changes to immutable revisions.
ALTER TABLE signing_packages ADD COLUMN IF NOT EXISTS client_userid integer;
CREATE INDEX IF NOT EXISTS signing_packages_client_context_idx
    ON signing_packages(owner_context_id,client_userid,created_at DESC,id)
    WHERE client_userid IS NOT NULL;

BEGIN;
CREATE TABLE IF NOT EXISTS signing_approval_requests (
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    preparer_userid integer NOT NULL REFERENCES users(userid),
    reviewer_userid integer NOT NULL REFERENCES users(userid),
    solo_profile boolean NOT NULL DEFAULT false,
    state text NOT NULL DEFAULT 'preparing' CHECK (state IN ('preparing','pending','approved','returned')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    reason text,
    decided_at timestamptz,
    PRIMARY KEY (owner_context_id,revision_id),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    CHECK (solo_profile OR preparer_userid <> reviewer_userid)
);
CREATE INDEX IF NOT EXISTS signing_approval_requests_reviewer ON signing_approval_requests(owner_context_id,reviewer_userid,state);
CREATE OR REPLACE FUNCTION signing_approval_request_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW)-'state'-'version'-'reason'-'decided_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'version'-'reason'-'decided_at') THEN
        RAISE EXCEPTION 'Internal approval assignment is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS signing_approval_request_identity_immutable ON signing_approval_requests;
CREATE TRIGGER signing_approval_request_identity_immutable BEFORE UPDATE ON signing_approval_requests
    FOR EACH ROW EXECUTE FUNCTION signing_approval_request_identity_immutable();
COMMIT;

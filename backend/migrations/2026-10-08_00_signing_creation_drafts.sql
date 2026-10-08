-- Private server-side composer recovery. Does not alter published documents.
CREATE TABLE IF NOT EXISTS signing_creation_drafts (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    owner_userid integer NOT NULL REFERENCES users(userid),
    template_version_id uuid NOT NULL,
    case_id integer REFERENCES cases(caseid),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 2097152),
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version > 0),
    state text NOT NULL DEFAULT 'editing' CHECK (state IN ('editing','submitted')),
    submission_id uuid,
    submission_key uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
    UNIQUE (owner_context_id,id),
    FOREIGN KEY (owner_context_id,template_version_id) REFERENCES signing_template_versions(owner_context_id,id),
    FOREIGN KEY (owner_context_id,submission_id) REFERENCES signing_submissions(owner_context_id,id),
    CHECK ((state='submitted') = (submission_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS signing_creation_drafts_owner ON signing_creation_drafts(owner_context_id,owner_userid,updated_at DESC);

BEGIN;

CREATE TABLE IF NOT EXISTS signing_templates (
    id uuid PRIMARY KEY,
    law_firm_tenant_id uuid NULL,
    owner_userid integer NOT NULL REFERENCES users(userid),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    definition jsonb NOT NULL,
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signing_templates_office_idx
    ON signing_templates(law_firm_tenant_id, owner_userid, archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS signing_batches (
    id uuid PRIMARY KEY,
    law_firm_tenant_id uuid NULL,
    owner_userid integer NOT NULL REFERENCES users(userid),
    template_id uuid NULL REFERENCES signing_templates(id),
    template_version integer NULL,
    name text NOT NULL,
    snapshot jsonb NOT NULL,
    request_hash text NOT NULL CHECK (length(request_hash) = 64),
    idempotency_key uuid NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','sending','sent','partial','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_userid, idempotency_key)
);
CREATE INDEX IF NOT EXISTS signing_batches_office_idx
    ON signing_batches(law_firm_tenant_id, owner_userid, created_at DESC);

CREATE TABLE IF NOT EXISTS signing_batch_files (
    batch_id uuid NOT NULL REFERENCES signing_batches(id),
    package_index integer NOT NULL CHECK (package_index >= 0),
    document_index integer NOT NULL CHECK (document_index >= 0),
    signingfileid integer NOT NULL UNIQUE REFERENCES signingfiles(signingfileid) ON DELETE CASCADE,
    PRIMARY KEY(batch_id, package_index, document_index)
);

CREATE TABLE IF NOT EXISTS signing_batch_recipients (
    id uuid PRIMARY KEY,
    batch_id uuid NOT NULL REFERENCES signing_batches(id),
    user_id integer NOT NULL REFERENCES users(userid),
    delivery_method text NOT NULL CHECK (delivery_method IN ('email','phone','both')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain')),
    invited_file_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
    attempted_at timestamptz NULL,
    sent_at timestamptz NULL,
    error_code text NULL,
    UNIQUE(batch_id, user_id)
);

-- A single verified signing session is explicitly bound to the reviewed file set.
CREATE TABLE IF NOT EXISTS signing_batch_sessions (
    id uuid PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES signing_batch_recipients(id),
    document_manifest jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz NULL,
    consent_accepted_at timestamptz NOT NULL DEFAULT now(),
    canonical_challenge_id uuid NULL REFERENCES signing_otp_challenges(challengeid) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS signing_package_completions (
    batch_id uuid NOT NULL REFERENCES signing_batches(id),
    package_index integer NOT NULL,
    recipient_email text NOT NULL,
    status text NOT NULL CHECK(status IN ('sending','sent','uncertain')),
    attempted_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz NULL,
    PRIMARY KEY(batch_id,package_index,recipient_email)
);

CREATE TABLE IF NOT EXISTS signing_batch_reminders (
    id uuid PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES signing_batch_recipients(id),
    invited_at timestamptz NOT NULL,
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL CHECK(status IN ('pending','sending','sent','cancelled','uncertain')),
    attempted_at timestamptz NULL,
    sent_at timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS signing_batch_reminders_pending_idx ON signing_batch_reminders(recipient_id) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS signing_batch_reminders_invitation_idx ON signing_batch_reminders(recipient_id,invited_at);
CREATE INDEX IF NOT EXISTS signing_batch_reminders_due_idx ON signing_batch_reminders(scheduled_for) WHERE status='pending';

-- Match existing application privileges when migrations run as a separate DB owner.
DO $$
DECLARE existing_grant record;
BEGIN
    FOR existing_grant IN SELECT DISTINCT grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles'
          AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE') AND grantee<>'PUBLIC'
    LOOP
        EXECUTE format('GRANT %s ON TABLE public.signing_templates,public.signing_batches,public.signing_batch_files,public.signing_batch_recipients,public.signing_batch_sessions,public.signing_package_completions,public.signing_batch_reminders TO %I',
            existing_grant.privilege_type, existing_grant.grantee);
    END LOOP;
END $$;

COMMIT;

-- Additive expansion only. No legacy workflows or identities are converted.
-- New HTTP routes/workers remain disabled until their release gates pass.
BEGIN;

CREATE TABLE IF NOT EXISTS signing_owner_contexts (
    id uuid PRIMARY KEY,
    deployment_key text NOT NULL CHECK (length(deployment_key) BETWEEN 1 AND 200),
    scope_key text NOT NULL,
    law_firm_tenant_id uuid REFERENCES law_firm_tenants(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deployment_key, scope_key),
    CHECK (scope_key = COALESCE(law_firm_tenant_id::text, 'dedicated'))
);

CREATE TABLE IF NOT EXISTS signing_people (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    linked_userid integer REFERENCES users(userid),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
    identity_key text,
    identity_verified_at timestamptz,
    contact_endpoints jsonb NOT NULL DEFAULT '{}',
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id, id),
    UNIQUE (owner_context_id, linked_userid),
    UNIQUE (owner_context_id, identity_key),
    CHECK ((identity_key IS NULL) = (identity_verified_at IS NULL))
);

CREATE TABLE IF NOT EXISTS signing_parties (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    kind text NOT NULL CHECK (kind IN ('person','legal_entity')),
    person_id uuid,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
    registration jsonb,
    attributes jsonb NOT NULL DEFAULT '{}',
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (owner_context_id, id),
    FOREIGN KEY (owner_context_id, person_id) REFERENCES signing_people(owner_context_id, id),
    CHECK ((kind = 'person') = (person_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS signing_artifacts (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    kind text NOT NULL CHECK (kind IN ('source','prepared','stage','final','evidence','receipt','signature','authority')),
    inputs_hash text NOT NULL CHECK (inputs_hash ~ '^[a-f0-9]{64}$'),
    content_sha256 text CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    object_key text,
    bytes bigint CHECK (bytes >= 0),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','failed')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    ready_at timestamptz,
    UNIQUE (owner_context_id, id),
    UNIQUE (owner_context_id, kind, inputs_hash),
    CHECK (state <> 'ready' OR (object_key IS NOT NULL AND bytes > 0 AND content_sha256 IS NOT NULL AND ready_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS signing_authorities (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    person_id uuid NOT NULL,
    represented_party_id uuid NOT NULL,
    evidence_artifact_id uuid NOT NULL,
    scope jsonb NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked')),
    approved_by integer REFERENCES users(userid),
    approved_at timestamptz,
    revoked_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (owner_context_id, id),
    FOREIGN KEY (owner_context_id, person_id) REFERENCES signing_people(owner_context_id,id),
    FOREIGN KEY (owner_context_id, represented_party_id) REFERENCES signing_parties(owner_context_id,id),
    FOREIGN KEY (owner_context_id, evidence_artifact_id) REFERENCES signing_artifacts(owner_context_id,id),
    CHECK (valid_until IS NULL OR valid_until > valid_from),
    CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

ALTER TABLE signing_templates ADD COLUMN IF NOT EXISTS owner_context_id uuid REFERENCES signing_owner_contexts(id);
CREATE UNIQUE INDEX IF NOT EXISTS signing_templates_context_id ON signing_templates(owner_context_id,id);
CREATE TABLE IF NOT EXISTS signing_template_versions (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    template_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published')),
    definition jsonb NOT NULL,
    definition_hash text NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
    edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version > 0),
    created_by integer NOT NULL REFERENCES users(userid),
    published_by integer REFERENCES users(userid),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,template_id,version),
    FOREIGN KEY (owner_context_id,template_id) REFERENCES signing_templates(owner_context_id,id),
    CHECK (state <> 'published' OR (published_by IS NOT NULL AND published_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS signing_submissions (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    owner_userid integer NOT NULL REFERENCES users(userid),
    template_version_id uuid,
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    package_count integer NOT NULL CHECK (package_count BETWEEN 1 AND 200),
    document_count integer NOT NULL CHECK (document_count BETWEEN 1 AND 2000),
    state text NOT NULL DEFAULT 'authorized_preparing'
        CHECK (state IN ('authorized_preparing','active','attention','complete','cancelled')),
    committed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,owner_userid,idempotency_key),
    FOREIGN KEY (owner_context_id,template_version_id) REFERENCES signing_template_versions(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_packages (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    submission_id uuid,
    external_key text NOT NULL CHECK (length(external_key) BETWEEN 1 AND 200),
    owner_userid integer NOT NULL REFERENCES users(userid),
    case_id integer REFERENCES cases(caseid),
    transaction_ref text,
    active_revision_id uuid,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,submission_id,external_key),
    FOREIGN KEY (owner_context_id,submission_id) REFERENCES signing_submissions(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_package_assignments (
    owner_context_id uuid NOT NULL,
    package_id uuid NOT NULL,
    user_id integer NOT NULL REFERENCES users(userid),
    PRIMARY KEY (owner_context_id,package_id,user_id),
    FOREIGN KEY (owner_context_id,package_id) REFERENCES signing_packages(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_package_revisions (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    package_id uuid NOT NULL,
    revision_no integer NOT NULL CHECK (revision_no > 0),
    replaces_revision_id uuid,
    workflow_state text NOT NULL DEFAULT 'draft' CHECK (workflow_state IN
        ('draft','awaiting_approval','authorized_preparing','active','attention','complete','cancelled','superseded','expired')),
    snapshot jsonb NOT NULL,
    revision_hash text NOT NULL CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
    hash_version text NOT NULL DEFAULT 'sha256:canonical-json-v1',
    preview_hash text CHECK (preview_hash ~ '^[a-f0-9]{64}$'),
    deadline timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,package_id),
    UNIQUE (owner_context_id,package_id,revision_no),
    FOREIGN KEY (owner_context_id,package_id) REFERENCES signing_packages(owner_context_id,id),
    FOREIGN KEY (owner_context_id,replaces_revision_id,package_id)
        REFERENCES signing_package_revisions(owner_context_id,id,package_id)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_packages_active_revision_v2') THEN
        ALTER TABLE signing_packages ADD CONSTRAINT signing_packages_active_revision_v2
            FOREIGN KEY (owner_context_id,active_revision_id,id)
            REFERENCES signing_package_revisions(owner_context_id,id,package_id) DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS signing_participations (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    person_id uuid NOT NULL,
    represented_party_id uuid NOT NULL,
    role_key text NOT NULL,
    occurrence integer NOT NULL CHECK (occurrence >= 0),
    capacity text NOT NULL CHECK (capacity IN ('personal','representative','professional')),
    authority_id uuid,
    authority_version integer,
    identity_snapshot jsonb NOT NULL,
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,revision_id),
    UNIQUE (owner_context_id,revision_id,role_key,occurrence),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    FOREIGN KEY (owner_context_id,person_id) REFERENCES signing_people(owner_context_id,id),
    FOREIGN KEY (owner_context_id,represented_party_id) REFERENCES signing_parties(owner_context_id,id),
    FOREIGN KEY (owner_context_id,authority_id) REFERENCES signing_authorities(owner_context_id,id),
    CHECK ((authority_id IS NULL) = (authority_version IS NULL)),
    CHECK (capacity <> 'representative' OR authority_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS signing_documents (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    document_key text NOT NULL,
    name text NOT NULL,
    source_artifact_id uuid NOT NULL,
    prepared_artifact_id uuid,
    final_artifact_id uuid,
    signingfileid integer UNIQUE REFERENCES signingfiles(signingfileid),
    informational boolean NOT NULL DEFAULT false,
    inclusion_reason jsonb NOT NULL,
    field_bindings jsonb NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','preparing','ready','failed','finalizing','final')),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,revision_id),
    UNIQUE (owner_context_id,revision_id,document_key),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    FOREIGN KEY (owner_context_id,source_artifact_id) REFERENCES signing_artifacts(owner_context_id,id),
    FOREIGN KEY (owner_context_id,prepared_artifact_id) REFERENCES signing_artifacts(owner_context_id,id),
    FOREIGN KEY (owner_context_id,final_artifact_id) REFERENCES signing_artifacts(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_tasks (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    document_id uuid NOT NULL,
    participation_id uuid NOT NULL,
    stage integer NOT NULL CHECK (stage BETWEEN 0 AND 7),
    required boolean NOT NULL DEFAULT true,
    state text NOT NULL DEFAULT 'blocked' CHECK (state IN ('blocked','ready','accepted','declined','expired','cancelled')),
    field_ids jsonb NOT NULL,
    stage_artifact_id uuid,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,participation_id),
    UNIQUE (owner_context_id,document_id,participation_id,stage),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    FOREIGN KEY (owner_context_id,document_id,revision_id) REFERENCES signing_documents(owner_context_id,id,revision_id),
    FOREIGN KEY (owner_context_id,participation_id,revision_id) REFERENCES signing_participations(owner_context_id,id,revision_id),
    FOREIGN KEY (owner_context_id,stage_artifact_id) REFERENCES signing_artifacts(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_delivery_profiles (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    person_id uuid NOT NULL,
    endpoints_snapshot jsonb NOT NULL,
    policy_snapshot jsonb NOT NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    changed_by integer REFERENCES users(userid),
    changed_reason text,
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,person_id),
    UNIQUE (owner_context_id,revision_id,person_id),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    FOREIGN KEY (owner_context_id,person_id) REFERENCES signing_people(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_public_grants (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    person_id uuid NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('sign','collect','download','receipt')),
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,person_id),
    FOREIGN KEY (owner_context_id,person_id) REFERENCES signing_people(owner_context_id,id),
    CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS signing_grant_items (
    owner_context_id uuid NOT NULL,
    grant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    document_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    delivery_profile_id uuid NOT NULL,
    delivery_profile_version integer NOT NULL CHECK (delivery_profile_version > 0),
    PRIMARY KEY (owner_context_id,grant_id,document_id),
    FOREIGN KEY (owner_context_id,grant_id,person_id) REFERENCES signing_public_grants(owner_context_id,id,person_id),
    FOREIGN KEY (owner_context_id,document_id,revision_id) REFERENCES signing_documents(owner_context_id,id,revision_id),
    FOREIGN KEY (owner_context_id,delivery_profile_id,person_id) REFERENCES signing_delivery_profiles(owner_context_id,id,person_id)
);

CREATE TABLE IF NOT EXISTS signing_sessions_v2 (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    person_id uuid NOT NULL,
    grant_id uuid NOT NULL,
    exact_manifest jsonb NOT NULL,
    manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
    consent_snapshot jsonb NOT NULL,
    verified_challenge_id bigint,
    verified_at timestamptz,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,id,person_id),
    FOREIGN KEY (owner_context_id,grant_id,person_id) REFERENCES signing_public_grants(owner_context_id,id,person_id)
);

CREATE TABLE IF NOT EXISTS signing_actions (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    task_id uuid NOT NULL,
    participation_id uuid NOT NULL,
    person_id uuid NOT NULL,
    session_id uuid NOT NULL,
    manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    authority_snapshot jsonb,
    consent_snapshot jsonb NOT NULL,
    values_snapshot jsonb NOT NULL,
    signature_artifact_id uuid,
    accepted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,task_id),
    FOREIGN KEY (owner_context_id,task_id,participation_id) REFERENCES signing_tasks(owner_context_id,id,participation_id),
    FOREIGN KEY (owner_context_id,session_id,person_id) REFERENCES signing_sessions_v2(owner_context_id,id,person_id),
    FOREIGN KEY (owner_context_id,signature_artifact_id) REFERENCES signing_artifacts(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_approvals (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    revision_hash text NOT NULL,
    preview_hash text,
    preparer_userid integer NOT NULL REFERENCES users(userid),
    approver_userid integer NOT NULL REFERENCES users(userid),
    solo_profile boolean NOT NULL DEFAULT false,
    approved_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,revision_id,revision_hash),
    FOREIGN KEY (owner_context_id,revision_id) REFERENCES signing_package_revisions(owner_context_id,id),
    CHECK (solo_profile OR preparer_userid <> approver_userid)
);

CREATE TABLE IF NOT EXISTS signing_operations (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    actor_key text NOT NULL,
    kind text NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    state text NOT NULL CHECK (state IN ('pending','running','complete','partial','failed','uncertain')),
    result jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,actor_key,kind,idempotency_key)
);

CREATE TABLE IF NOT EXISTS signing_jobs (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    kind text NOT NULL CHECK (kind IN ('prepare_document','validate_package','activate_package','render_stage','finalize_document','render_evidence','dispatch_delivery','reconcile_delivery')),
    subject_id uuid NOT NULL,
    dedupe_key text NOT NULL,
    input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','complete','retry','needs_attention','cancelled','uncertain')),
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_until timestamptz,
    leased_by text,
    fencing_token bigint NOT NULL DEFAULT 0,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,dedupe_key),
    CHECK (state <> 'running' OR (lease_until IS NOT NULL AND leased_by IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS signing_job_dependencies (
    owner_context_id uuid NOT NULL,
    job_id uuid NOT NULL,
    depends_on_id uuid NOT NULL,
    PRIMARY KEY (owner_context_id,job_id,depends_on_id),
    FOREIGN KEY (owner_context_id,job_id) REFERENCES signing_jobs(owner_context_id,id),
    FOREIGN KEY (owner_context_id,depends_on_id) REFERENCES signing_jobs(owner_context_id,id),
    CHECK (job_id <> depends_on_id)
);

CREATE TABLE IF NOT EXISTS signing_deliveries (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    profile_version integer NOT NULL,
    grant_id uuid,
    event_key text NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('invitation','reminder','resend','completed_copy','receipt')),
    channel text NOT NULL CHECK (channel IN ('email','sms','manual')),
    target_snapshot jsonb NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','dispatching','provider_accepted','delivered','failed','uncertain','cancelled','skipped_completed')),
    provider_id text,
    attempted_at timestamptz,
    provider_accepted_at timestamptz,
    delivered_at timestamptz,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    UNIQUE (owner_context_id,event_key,profile_id,channel),
    FOREIGN KEY (owner_context_id,profile_id) REFERENCES signing_delivery_profiles(owner_context_id,id),
    FOREIGN KEY (owner_context_id,grant_id) REFERENCES signing_public_grants(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_events_v2 (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    package_id uuid,
    actor_key text NOT NULL,
    kind text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (owner_context_id,package_id) REFERENCES signing_packages(owner_context_id,id)
);

CREATE TABLE IF NOT EXISTS signing_selections (
    id uuid PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    owner_userid integer NOT NULL REFERENCES users(userid),
    filter_snapshot jsonb NOT NULL,
    scope_hash text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id)
);
CREATE TABLE IF NOT EXISTS signing_selection_items (
    owner_context_id uuid NOT NULL,
    selection_id uuid NOT NULL,
    package_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    PRIMARY KEY (owner_context_id,selection_id,package_id),
    FOREIGN KEY (owner_context_id,selection_id) REFERENCES signing_selections(owner_context_id,id),
    FOREIGN KEY (owner_context_id,revision_id,package_id) REFERENCES signing_package_revisions(owner_context_id,id,package_id)
);

ALTER TABLE signingfiles ADD COLUMN IF NOT EXISTS workflow_generation smallint NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS signing_packages_scope_cursor ON signing_packages(owner_context_id,owner_userid,created_at DESC,id);
CREATE INDEX IF NOT EXISTS signing_packages_submission ON signing_packages(owner_context_id,submission_id,id);
CREATE INDEX IF NOT EXISTS signing_packages_case ON signing_packages(owner_context_id,case_id,id);
CREATE INDEX IF NOT EXISTS signing_tasks_person_state ON signing_tasks(owner_context_id,participation_id,state);
CREATE INDEX IF NOT EXISTS signing_tasks_revision_state ON signing_tasks(owner_context_id,revision_id,state);
CREATE INDEX IF NOT EXISTS signing_jobs_ready ON signing_jobs(kind,available_at,created_at) WHERE state IN ('pending','retry');
CREATE INDEX IF NOT EXISTS signing_jobs_expired ON signing_jobs(lease_until) WHERE state='running';
CREATE INDEX IF NOT EXISTS signing_deliveries_profile ON signing_deliveries(owner_context_id,profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS signing_events_package ON signing_events_v2(owner_context_id,package_id,id);

CREATE OR REPLACE FUNCTION signing_v2_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Immutable signing record' USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE FUNCTION signing_v2_template_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.state = 'published' THEN
        RAISE EXCEPTION 'Published signing template is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION signing_v2_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.workflow_state <> 'draft' AND
        (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.revision_hash <> OLD.revision_hash
        OR NEW.package_id <> OLD.package_id OR NEW.owner_context_id <> OLD.owner_context_id
        OR NEW.deadline IS DISTINCT FROM OLD.deadline OR NEW.revision_no <> OLD.revision_no) THEN
        RAISE EXCEPTION 'Authorized signing revision is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['signing_actions','signing_events_v2','signing_approvals'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t || '_immutable') THEN
            EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION signing_v2_immutable()',t || '_immutable',t);
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_template_versions_immutable') THEN
        CREATE TRIGGER signing_template_versions_immutable BEFORE UPDATE OR DELETE ON signing_template_versions
            FOR EACH ROW EXECUTE FUNCTION signing_v2_template_immutable();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='signing_package_revisions_immutable') THEN
        CREATE TRIGGER signing_package_revisions_immutable BEFORE UPDATE ON signing_package_revisions
            FOR EACH ROW EXECUTE FUNCTION signing_v2_revision_immutable();
    END IF;
END $$;

-- Copy the existing application's DML privileges, never grant to PUBLIC.
DO $$ DECLARE r record; t text; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee <> 'PUBLIC'
    LOOP
        FOREACH t IN ARRAY ARRAY['signing_owner_contexts','signing_people','signing_parties','signing_artifacts',
            'signing_authorities','signing_template_versions','signing_submissions','signing_packages',
            'signing_package_assignments','signing_package_revisions','signing_participations','signing_documents',
            'signing_tasks','signing_delivery_profiles','signing_public_grants','signing_grant_items',
            'signing_sessions_v2','signing_actions','signing_approvals','signing_operations','signing_jobs',
            'signing_job_dependencies','signing_deliveries','signing_events_v2','signing_selections','signing_selection_items']
        LOOP
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I',t,r.grantee);
        END LOOP;
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE signing_events_v2_id_seq TO %I',r.grantee);
    END LOOP;
END $$;
COMMIT;

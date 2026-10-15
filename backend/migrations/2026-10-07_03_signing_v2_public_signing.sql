BEGIN;
-- A shared signer of a run gets one grant whose items span every package of that run.
ALTER TABLE signing_public_grants ADD COLUMN IF NOT EXISTS submission_id uuid;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_public_grants_submission') THEN
        ALTER TABLE signing_public_grants ADD CONSTRAINT signing_public_grants_submission
            FOREIGN KEY (owner_context_id,submission_id) REFERENCES signing_submissions(owner_context_id,id);
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS signing_public_grants_submission_person ON signing_public_grants(owner_context_id,submission_id,person_id,purpose)
    WHERE submission_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS signing_grant_items_revision ON signing_grant_items(owner_context_id,revision_id);
CREATE INDEX IF NOT EXISTS signing_participations_person ON signing_participations(owner_context_id,person_id);

-- `bundled`: this intent was covered by an invitation already sent for the same grant and channel.
ALTER TABLE signing_deliveries DROP CONSTRAINT IF EXISTS signing_deliveries_state_check;
ALTER TABLE signing_deliveries ADD CONSTRAINT signing_deliveries_state_check CHECK (state IN
    ('pending','dispatching','provider_accepted','delivered','failed','uncertain','cancelled','skipped_completed','bundled'));
CREATE INDEX IF NOT EXISTS signing_deliveries_grant ON signing_deliveries(owner_context_id,grant_id,channel,purpose) WHERE grant_id IS NOT NULL;

-- A code is bound to one session and therefore to its exact manifest. Only a salted hash is stored.
CREATE TABLE IF NOT EXISTS signing_otp_challenges_v2 (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_context_id uuid NOT NULL REFERENCES signing_owner_contexts(id),
    session_id uuid NOT NULL,
    person_id uuid NOT NULL,
    manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
    channel text NOT NULL CHECK (channel IN ('email','sms')),
    endpoint_hint text NOT NULL,
    code_salt text NOT NULL,
    code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','failed','uncertain','verified','exhausted','superseded')),
    expires_at timestamptz NOT NULL,
    sent_at timestamptz,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_context_id,id),
    FOREIGN KEY (owner_context_id,session_id,person_id) REFERENCES signing_sessions_v2(owner_context_id,id,person_id),
    CHECK (expires_at > created_at),
    CHECK (state <> 'verified' OR verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS signing_otp_challenges_v2_session ON signing_otp_challenges_v2(owner_context_id,session_id,created_at DESC);
CREATE INDEX IF NOT EXISTS signing_otp_challenges_v2_person ON signing_otp_challenges_v2(owner_context_id,person_id,created_at DESC);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_sessions_v2_verified_challenge') THEN
        ALTER TABLE signing_sessions_v2 ADD CONSTRAINT signing_sessions_v2_verified_challenge
            FOREIGN KEY (owner_context_id,verified_challenge_id) REFERENCES signing_otp_challenges_v2(owner_context_id,id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS signing_sessions_v2_grant ON signing_sessions_v2(owner_context_id,grant_id,created_at DESC);

DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='signingfiles' AND privilege_type='INSERT' AND grantee <> 'PUBLIC'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE signing_otp_challenges_v2 TO %I',r.grantee);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE signing_otp_challenges_v2_id_seq TO %I',r.grantee);
    END LOOP;
END $$;
COMMIT;

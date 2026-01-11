-- Court-ready (Israel, non-PKI) evidence hardening: signing policy, hashes, consent, OTP challenges, and append-only audit log.

BEGIN;

-- 1) Signing policy + document evidence fields
ALTER TABLE signingfiles
    ADD COLUMN IF NOT EXISTS requireotp boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS signingpolicyversion text NOT NULL DEFAULT '2026-01-11',
    ADD COLUMN IF NOT EXISTS policyselectedbyuserid integer NULL,
    ADD COLUMN IF NOT EXISTS policyselectedatutc timestamptz NULL,
    ADD COLUMN IF NOT EXISTS otpwaiveracknowledged boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS otpwaiveracknowledgedatutc timestamptz NULL,
    ADD COLUMN IF NOT EXISTS otpwaiveracknowledgedbyuserid integer NULL,

    ADD COLUMN IF NOT EXISTS originalpdfsha256 text NULL,
    ADD COLUMN IF NOT EXISTS presentedpdfsha256 text NULL,
    ADD COLUMN IF NOT EXISTS signedpdfsha256 text NULL,

    ADD COLUMN IF NOT EXISTS originalstoragebucket text NULL,
    ADD COLUMN IF NOT EXISTS originalstoragekey text NULL,
    ADD COLUMN IF NOT EXISTS originalstorageetag text NULL,
    ADD COLUMN IF NOT EXISTS originalstorageversionid text NULL,

    ADD COLUMN IF NOT EXISTS signedstoragebucket text NULL,
    ADD COLUMN IF NOT EXISTS signedstoragekey text NULL,
    ADD COLUMN IF NOT EXISTS signedstorageetag text NULL,
    ADD COLUMN IF NOT EXISTS signedstorageversionid text NULL,

    ADD COLUMN IF NOT EXISTS immutableatutc timestamptz NULL;

-- FK constraints for policy chooser / waiver acknowledger
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'signingfiles_policyselectedbyuserid_fkey'
    ) THEN
        ALTER TABLE signingfiles
            ADD CONSTRAINT signingfiles_policyselectedbyuserid_fkey
            FOREIGN KEY (policyselectedbyuserid) REFERENCES users(userid) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'signingfiles_otpwaiveracknowledgedbyuserid_fkey'
    ) THEN
        ALTER TABLE signingfiles
            ADD CONSTRAINT signingfiles_otpwaiveracknowledgedbyuserid_fkey
            FOREIGN KEY (otpwaiveracknowledgedbyuserid) REFERENCES users(userid) ON DELETE SET NULL;
    END IF;
END $$;

-- Basic integrity checks for sha256 hex strings (64 chars) when present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signingfiles_originalpdfsha256_len_chk') THEN
        ALTER TABLE signingfiles
            ADD CONSTRAINT signingfiles_originalpdfsha256_len_chk
            CHECK (originalpdfsha256 IS NULL OR length(originalpdfsha256) = 64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signingfiles_presentedpdfsha256_len_chk') THEN
        ALTER TABLE signingfiles
            ADD CONSTRAINT signingfiles_presentedpdfsha256_len_chk
            CHECK (presentedpdfsha256 IS NULL OR length(presentedpdfsha256) = 64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signingfiles_signedpdfsha256_len_chk') THEN
        ALTER TABLE signingfiles
            ADD CONSTRAINT signingfiles_signedpdfsha256_len_chk
            CHECK (signedpdfsha256 IS NULL OR length(signedpdfsha256) = 64);
    END IF;
END $$;

-- 2) Per-signature attribution + evidence fields
ALTER TABLE signaturespots
    ADD COLUMN IF NOT EXISTS signerip inet NULL,
    ADD COLUMN IF NOT EXISTS signeruseragent text NULL,
    ADD COLUMN IF NOT EXISTS signingsessionid uuid NULL,
    ADD COLUMN IF NOT EXISTS presentedpdfsha256 text NULL,
    ADD COLUMN IF NOT EXISTS otpverificationid uuid NULL,
    ADD COLUMN IF NOT EXISTS consentid uuid NULL,
    ADD COLUMN IF NOT EXISTS signatureimagesha256 text NULL,
    ADD COLUMN IF NOT EXISTS signaturestorageetag text NULL,
    ADD COLUMN IF NOT EXISTS signaturestorageversionid text NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signaturespots_presentedpdfsha256_len_chk') THEN
        ALTER TABLE signaturespots
            ADD CONSTRAINT signaturespots_presentedpdfsha256_len_chk
            CHECK (presentedpdfsha256 IS NULL OR length(presentedpdfsha256) = 64);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signaturespots_signatureimagesha256_len_chk') THEN
        ALTER TABLE signaturespots
            ADD CONSTRAINT signaturespots_signatureimagesha256_len_chk
            CHECK (signatureimagesha256 IS NULL OR length(signatureimagesha256) = 64);
    END IF;
END $$;

-- 3) Consent persistence
CREATE TABLE IF NOT EXISTS signing_consents (
    consentid uuid PRIMARY KEY,
    signingfileid integer NOT NULL REFERENCES signingfiles(signingfileid) ON DELETE CASCADE,
    signeruserid integer NULL REFERENCES users(userid) ON DELETE SET NULL,
    signingsessionid uuid NOT NULL,
    consentversion text NOT NULL,
    consenttextsha256 text NOT NULL,
    acceptedatutc timestamptz NOT NULL,
    ip inet NULL,
    user_agent text NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS signing_consents_unique
    ON signing_consents(signingfileid, signeruserid, signingsessionid);

-- 4) OTP challenges for signing (NO plaintext OTP)
CREATE TABLE IF NOT EXISTS signing_otp_challenges (
    challengeid uuid PRIMARY KEY,
    signingfileid integer NOT NULL REFERENCES signingfiles(signingfileid) ON DELETE CASCADE,
    signeruserid integer NULL REFERENCES users(userid) ON DELETE SET NULL,
    signingsessionid uuid NOT NULL,
    phone_e164 text NOT NULL,

    presentedpdfsha256 text NOT NULL,

    otp_hash text NOT NULL,
    otp_salt text NOT NULL,

    provider_message_id text NULL,

    sent_at_utc timestamptz NOT NULL,
    expires_at_utc timestamptz NOT NULL,

    attempt_count integer NOT NULL DEFAULT 0,
    locked_until_utc timestamptz NULL,

    verified_at_utc timestamptz NULL,
    verified boolean NOT NULL DEFAULT false,

    request_ip inet NULL,
    request_user_agent text NULL,
    verify_ip inet NULL,
    verify_user_agent text NULL
);

CREATE INDEX IF NOT EXISTS signing_otp_challenges_lookup
    ON signing_otp_challenges(signingfileid, signingsessionid, expires_at_utc);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signing_otp_challenges_presentedpdfsha256_len_chk') THEN
        ALTER TABLE signing_otp_challenges
            ADD CONSTRAINT signing_otp_challenges_presentedpdfsha256_len_chk
            CHECK (length(presentedpdfsha256) = 64);
    END IF;
END $$;

-- 5) Append-only audit log
CREATE TABLE IF NOT EXISTS audit_events (
    eventid uuid PRIMARY KEY,
    occurred_at_utc timestamptz NOT NULL DEFAULT now(),
    event_type text NOT NULL,

    signingfileid integer NULL REFERENCES signingfiles(signingfileid) ON DELETE SET NULL,
    signaturespotid integer NULL REFERENCES signaturespots(signaturespotid) ON DELETE SET NULL,

    actor_userid integer NULL REFERENCES users(userid) ON DELETE SET NULL,
    actor_type text NULL,

    ip inet NULL,
    user_agent text NULL,
    signing_session_id uuid NULL,
    request_id uuid NULL,

    success boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    prev_event_hash text NULL,
    event_hash text NULL
);

CREATE INDEX IF NOT EXISTS audit_events_signingfile_time
    ON audit_events(signingfileid, occurred_at_utc);

CREATE INDEX IF NOT EXISTS audit_events_type_time
    ON audit_events(event_type, occurred_at_utc);

-- Prevent UPDATE/DELETE (append-only at DB level)
CREATE OR REPLACE FUNCTION block_audit_events_modification()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_events_no_update') THEN
        CREATE TRIGGER audit_events_no_update
        BEFORE UPDATE ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION block_audit_events_modification();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_events_no_delete') THEN
        CREATE TRIGGER audit_events_no_delete
        BEFORE DELETE ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION block_audit_events_modification();
    END IF;
END $$;

COMMIT;

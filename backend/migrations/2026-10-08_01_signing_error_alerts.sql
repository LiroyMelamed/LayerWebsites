-- Error events commit with the failed job/delivery. Email delivery has its own outbox.
BEGIN;
CREATE TABLE IF NOT EXISTS signing_error_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_context_id uuid REFERENCES signing_owner_contexts(id),
    source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
    phase text NOT NULL CHECK(length(phase) BETWEEN 1 AND 160),
    error_code text NOT NULL CHECK(error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
    severity text NOT NULL CHECK(severity IN ('retry','needs_attention','uncertain','failed','request')),
    first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    occurrences integer NOT NULL DEFAULT 1,
    batch_id uuid
);
ALTER TABLE signing_error_alerts ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES signing_submissions(id);
CREATE UNIQUE INDEX IF NOT EXISTS signing_error_alerts_dedupe ON signing_error_alerts
    ((COALESCE(owner_context_id,'00000000-0000-0000-0000-000000000000'::uuid)),source_key,phase,error_code,severity);
CREATE INDEX IF NOT EXISTS signing_error_alerts_pending ON signing_error_alerts(first_seen_at) WHERE batch_id IS NULL;
CREATE INDEX IF NOT EXISTS signing_error_alerts_batch ON signing_error_alerts(batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS signing_error_emails (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    recipient_user_id integer REFERENCES users(userid) ON DELETE SET NULL,
    recipient_email text NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','dispatching','provider_accepted','simulated','uncertain','failed','cancelled')),
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    lease_until timestamptz,
    claim_token uuid,
    provider_id text,
    error_code text,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(batch_id,recipient_email)
);
ALTER TABLE signing_error_emails ALTER COLUMN recipient_user_id DROP NOT NULL;
ALTER TABLE signing_error_emails DROP CONSTRAINT IF EXISTS signing_error_emails_recipient_user_id_fkey;
ALTER TABLE signing_error_emails ADD CONSTRAINT signing_error_emails_recipient_user_id_fkey
    FOREIGN KEY(recipient_user_id) REFERENCES users(userid) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS signing_error_emails_pending ON signing_error_emails(available_at) WHERE state='pending';

CREATE OR REPLACE FUNCTION signing_capture_error_alert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    source text;
    phase_name text;
    severity_name text;
    submission uuid;
BEGIN
    IF TG_TABLE_NAME='signing_jobs' THEN
        source := CASE WHEN NEW.kind='dispatch_delivery' THEN 'delivery:'||NEW.subject_id ELSE 'job:'||NEW.id END;
        phase_name := NEW.kind;
        severity_name := NEW.state;
        IF NEW.kind IN ('prepare_document','render_stage','finalize_document') THEN
            SELECT p.submission_id INTO submission FROM signing_documents d JOIN signing_package_revisions r ON r.id=d.revision_id
                JOIN signing_packages p ON p.id=r.package_id WHERE d.owner_context_id=NEW.owner_context_id AND d.id=NEW.subject_id;
        ELSIF NEW.kind IN ('validate_package','activate_package','render_evidence') THEN
            SELECT p.submission_id INTO submission FROM signing_package_revisions r JOIN signing_packages p ON p.id=r.package_id
                WHERE r.owner_context_id=NEW.owner_context_id AND r.id=NEW.subject_id;
        ELSIF NEW.kind='dispatch_delivery' THEN
            SELECT p.submission_id INTO submission FROM signing_deliveries d JOIN signing_delivery_profiles dp ON dp.id=d.profile_id
                JOIN signing_package_revisions r ON r.id=dp.revision_id JOIN signing_packages p ON p.id=r.package_id
                WHERE d.owner_context_id=NEW.owner_context_id AND d.id=NEW.subject_id;
        END IF;
    ELSE
        source := 'delivery:'||NEW.id;
        phase_name := 'dispatch_delivery';
        severity_name := NEW.state;
        SELECT p.submission_id INTO submission FROM signing_delivery_profiles dp JOIN signing_package_revisions r ON r.id=dp.revision_id
            JOIN signing_packages p ON p.id=r.package_id WHERE dp.owner_context_id=NEW.owner_context_id AND dp.id=NEW.profile_id;
    END IF;
    INSERT INTO signing_error_alerts(owner_context_id,source_key,phase,error_code,severity,submission_id)
        VALUES(NEW.owner_context_id,source,phase_name,COALESCE(NEW.error_code,'UNKNOWN_ERROR'),severity_name,submission)
        ON CONFLICT ((COALESCE(owner_context_id,'00000000-0000-0000-0000-000000000000'::uuid)),source_key,phase,error_code,severity)
        DO UPDATE SET last_seen_at=clock_timestamp(),occurrences=signing_error_alerts.occurrences+1;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS signing_job_error_alert ON signing_jobs;
CREATE TRIGGER signing_job_error_alert AFTER UPDATE ON signing_jobs FOR EACH ROW
    WHEN (NEW.state IN ('retry','needs_attention','uncertain') AND NEW.error_code IS NOT NULL
        AND (OLD.state IS DISTINCT FROM NEW.state OR OLD.error_code IS DISTINCT FROM NEW.error_code))
    EXECUTE FUNCTION signing_capture_error_alert();
DROP TRIGGER IF EXISTS signing_delivery_error_alert ON signing_deliveries;
CREATE TRIGGER signing_delivery_error_alert AFTER UPDATE ON signing_deliveries FOR EACH ROW
    WHEN (NEW.state IN ('failed','uncertain') AND
        (OLD.state IS DISTINCT FROM NEW.state OR OLD.error_code IS DISTINCT FROM NEW.error_code))
    EXECUTE FUNCTION signing_capture_error_alert();
COMMIT;

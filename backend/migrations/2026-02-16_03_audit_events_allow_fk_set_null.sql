-- Allow FK-cascade SET NULL updates on audit_events under the same session flag
-- used for retention deletes. Without this, deleting signingfiles/signaturespots
-- fails because ON DELETE SET NULL triggers an UPDATE blocked by the append-only trigger.

BEGIN;

CREATE OR REPLACE FUNCTION public.block_audit_events_modification()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.audit_events_allow_delete', true) = 'true' THEN
            RETURN OLD;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF current_setting('app.audit_events_allow_delete', true) = 'true' THEN
            RETURN NEW;
        END IF;
    END IF;

    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

COMMIT;

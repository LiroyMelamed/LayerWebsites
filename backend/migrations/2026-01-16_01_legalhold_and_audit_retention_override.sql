-- Legal hold fields + allow retention deletion of audit_events under an explicit session flag.
-- Additive, default behavior stays append-only.

BEGIN;

-- Legal hold: stored on signingfiles for this iteration (documents only).
ALTER TABLE public.signingfiles
    ADD COLUMN IF NOT EXISTS legalhold boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS legalholdatutc timestamptz NULL,
    ADD COLUMN IF NOT EXISTS legalholdreason text NULL;

-- audit_events is append-only by default, but retention cleanup must be able to delete.
-- Allow DELETE only when the DB session sets: SET LOCAL app.audit_events_allow_delete = 'true';
CREATE OR REPLACE FUNCTION public.block_audit_events_modification()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.audit_events_allow_delete', true) = 'true' THEN
            RETURN OLD;
        END IF;
    END IF;

    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

COMMIT;

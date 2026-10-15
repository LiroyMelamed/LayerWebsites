-- Grants for court-ready signing evidence tables.
--
-- If migrations were applied with a different DB role than the one the app uses at runtime,
-- the runtime role may not have permissions to write audit/consent/otp evidence.
--
-- This migration grants required privileges to the expected app role(s) when they exist.

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            -- Evidence + enforcement tables
            EXECUTE format('GRANT SELECT, INSERT ON TABLE public.audit_events TO %I', role_name);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signing_consents TO %I', role_name);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signing_otp_challenges TO %I', role_name);
        END IF;
    END LOOP;
END $$;

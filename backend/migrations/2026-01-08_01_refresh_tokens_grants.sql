-- Grants for refresh_tokens table.
--
-- If migrations were applied with a different DB role than the one the app uses at runtime,
-- the runtime role may not have permissions to insert/update the table.
--
-- This migration grants required privileges to the expected app role(s) when they exist.

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.refresh_tokens TO %I', role_name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.refresh_tokens_refresh_token_id_seq TO %I', role_name);
        END IF;
    END LOOP;
END $$;

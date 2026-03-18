-- Fix grants for chatbot and RAG tables to ensure consistency.
-- Uses DO block to conditionally grant based on available roles.

BEGIN;

-- Add NULL guard to email_templates migration (idempotent re-run safety)
-- Already applied by 2026-03-17_00 but ensure available_vars NULL check
UPDATE email_templates
SET available_vars = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(available_vars) AS elem
    WHERE elem <> 'case_number'
)
WHERE available_vars IS NOT NULL
  AND available_vars @> '"case_number"'::jsonb;

-- Ensure grants for chatbot tables, knowledge tables, and stage_files
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym', 'neondb_owner']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            -- chatbot tables
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chatbot_sessions') THEN
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chatbot_sessions TO %I', role_name);
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.chatbot_sessions_id_seq TO %I', role_name);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chatbot_messages') THEN
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chatbot_messages TO %I', role_name);
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.chatbot_messages_id_seq TO %I', role_name);
            END IF;
            -- knowledge RAG tables
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_documents') THEN
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_documents TO %I', role_name);
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.knowledge_documents_id_seq TO %I', role_name);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_chunks') THEN
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_chunks TO %I', role_name);
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.knowledge_chunks_id_seq TO %I', role_name);
            END IF;
            -- stage_files
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stage_files') THEN
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stage_files TO %I', role_name);
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.stage_files_id_seq TO %I', role_name);
            END IF;
            -- reminder_templates
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reminder_templates') THEN
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_templates TO %I', role_name);
                EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.reminder_templates_id_seq TO %I', role_name);
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;

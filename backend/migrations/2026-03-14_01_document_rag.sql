-- Document-based RAG: knowledge_documents + knowledge_chunks with pgvector embeddings.

BEGIN;

-- Enable pgvector extension (requires superuser or rds_superuser on first run)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1) knowledge_documents — metadata for each ingested document
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    source_file TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) knowledge_chunks — text chunks with vector embeddings for similarity search
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id          SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    embedding   vector(1536),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast approximate nearest-neighbour search (IVFFlat)
-- Use cosine distance operator (<=>). Lists = 1 is fine for small datasets; increase for >10k rows.
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
    ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 1);

-- Standard btree index for FK look-ups
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_id_idx
    ON knowledge_chunks (document_id);

COMMIT;

-- Grants (conditional — only grant if role exists)
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['liroym']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_documents TO %I', role_name);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_chunks TO %I', role_name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.knowledge_documents_id_seq TO %I', role_name);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.knowledge_chunks_id_seq TO %I', role_name);
        END IF;
    END LOOP;
END $$;

#!/usr/bin/env node
/**
 * indexDocuments.js — Ingest knowledge documents into pgvector-backed RAG store.
 *
 * Reads .txt and .pdf files from backend/knowledge/, splits them into ~800-char
 * chunks, generates OpenAI embeddings, and upserts into knowledge_chunks.
 *
 * Usage:
 *   node scripts/indexDocuments.js            # ingest all files
 *   node scripts/indexDocuments.js --reset    # drop existing data first
 *
 * Requires:
 *   - CHATBOT_LLM_API_KEY env var (OpenAI key)
 *   - CHATBOT_EMBEDDING_MODEL env var (default: text-embedding-3-small)
 *   - pgvector extension + migration applied
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge');
const EMBEDDING_MODEL = String(process.env.CHATBOT_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
const OPENAI_API_KEY = String(process.env.CHATBOT_LLM_API_KEY || '').trim();
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const CHUNK_SIZE = 800;       // target characters per chunk
const CHUNK_OVERLAP = 100;    // overlap between consecutive chunks
const EMBEDDING_BATCH = 5;    // embeddings per API call (kept small to avoid OOM)

// ── Helpers ───────────────────────────────────────────────────────────

async function extractTextFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
        return fs.readFileSync(filePath, 'utf-8');
    }

    if (ext === '.pdf') {
        // Lazy-require pdf-parse so the rest of the script works without it for .txt files
        let pdfParse;
        try {
            pdfParse = require('pdf-parse');
        } catch {
            console.error('[indexDocuments] pdf-parse not installed. Run: npm install pdf-parse');
            process.exit(1);
        }
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    }

    console.warn(`[indexDocuments] Skipping unsupported file type: ${ext} (${filePath})`);
    return null;
}

/**
 * Split text into chunks of ~CHUNK_SIZE characters with CHUNK_OVERLAP overlap.
 * Tries to break on sentence/paragraph boundaries.
 */
function splitIntoChunks(text) {
    if (!text || text.length === 0) return [];

    // Normalise whitespace
    const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (clean.length <= CHUNK_SIZE) return [clean];

    const chunks = [];
    let start = 0;

    while (start < clean.length) {
        let end = Math.min(start + CHUNK_SIZE, clean.length);

        // Try to break at paragraph or sentence boundary
        if (end < clean.length) {
            const window = clean.slice(start, end);
            // Prefer paragraph break
            const lastParagraph = window.lastIndexOf('\n\n');
            if (lastParagraph > CHUNK_SIZE * 0.4) {
                end = start + lastParagraph + 2;
            } else {
                // Fall back to sentence break (. followed by space or newline)
                const lastSentence = window.search(/\.\s[^\s]/g) !== -1
                    ? start + window.lastIndexOf('. ') + 2
                    : -1;
                if (lastSentence > start + CHUNK_SIZE * 0.4) {
                    end = lastSentence;
                }
            }
        }

        const chunk = clean.slice(start, end).trim();
        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        // Move forward: apply overlap only if there's enough remaining text
        const nextStart = end - CHUNK_OVERLAP;
        if (nextStart <= start || end >= clean.length) {
            start = end; // no overlap for last chunk or if overlap would go backwards
        } else {
            start = nextStart;
        }
    }

    return chunks;
}

/**
 * Generate embeddings for an array of texts using OpenAI API.
 */
async function generateEmbeddings(texts) {
    if (!OPENAI_API_KEY) {
        throw new Error('CHATBOT_LLM_API_KEY is not set');
    }

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts,
        }),
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI embeddings API error ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    // API returns array sorted by index
    return data.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
    const resetMode = process.argv.includes('--reset');

    console.log('[indexDocuments] Starting document ingestion...');
    console.log(`[indexDocuments] Knowledge dir: ${KNOWLEDGE_DIR}`);
    console.log(`[indexDocuments] Embedding model: ${EMBEDDING_MODEL}`);
    console.log(`[indexDocuments] Chunk size: ${CHUNK_SIZE}, overlap: ${CHUNK_OVERLAP}`);

    if (resetMode) {
        console.log('[indexDocuments] --reset flag: clearing existing data...');
        await pool.query('DELETE FROM knowledge_chunks');
        await pool.query('DELETE FROM knowledge_documents');
        console.log('[indexDocuments] Existing data cleared.');
    }

    // Discover files
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
        console.error(`[indexDocuments] Knowledge directory not found: ${KNOWLEDGE_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(KNOWLEDGE_DIR)
        .filter(f => ['.txt', '.pdf'].includes(path.extname(f).toLowerCase()))
        .map(f => path.join(KNOWLEDGE_DIR, f));

    if (files.length === 0) {
        console.warn('[indexDocuments] No .txt or .pdf files found in knowledge directory.');
        process.exit(0);
    }

    console.log(`[indexDocuments] Found ${files.length} file(s) to ingest.`);

    let totalChunks = 0;

    for (const filePath of files) {
        const fileName = path.basename(filePath);
        console.log(`\n[indexDocuments] Processing: ${fileName}`);

        // Check if already ingested (skip unless --reset)
        if (!resetMode) {
            const existing = await pool.query(
                'SELECT id FROM knowledge_documents WHERE source_file = $1',
                [fileName]
            );
            if (existing.rows.length > 0) {
                console.log(`[indexDocuments]   Already ingested (id=${existing.rows[0].id}), skipping. Use --reset to re-ingest.`);
                continue;
            }
        }

        // Extract text
        const text = await extractTextFromFile(filePath);
        if (!text || text.trim().length === 0) {
            console.warn(`[indexDocuments]   No text extracted, skipping.`);
            continue;
        }
        console.log(`[indexDocuments]   Extracted ${text.length} characters.`);

        // Split into chunks
        const chunks = splitIntoChunks(text);
        console.log(`[indexDocuments]   Split into ${chunks.length} chunks.`);

        // Insert document record
        const title = path.basename(fileName, path.extname(fileName));
        const docResult = await pool.query(
            'INSERT INTO knowledge_documents (title, source_file) VALUES ($1, $2) RETURNING id',
            [title, fileName]
        );
        const documentId = docResult.rows[0].id;

        // Generate embeddings in batches and insert chunks
        for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
            const batch = chunks.slice(i, i + EMBEDDING_BATCH);
            console.log(`[indexDocuments]   Embedding batch ${Math.floor(i / EMBEDDING_BATCH) + 1}/${Math.ceil(chunks.length / EMBEDDING_BATCH)} (${batch.length} chunks)...`);

            const embeddings = await generateEmbeddings(batch);

            for (let j = 0; j < batch.length; j++) {
                const embeddingStr = `[${embeddings[j].join(',')}]`;
                await pool.query(
                    'INSERT INTO knowledge_chunks (document_id, content, embedding) VALUES ($1, $2, $3::vector)',
                    [documentId, batch[j], embeddingStr]
                );
            }

            totalChunks += batch.length;

            // Small delay between batches to respect rate limits
            if (i + EMBEDDING_BATCH < chunks.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        console.log(`[indexDocuments]   Done: document_id=${documentId}, ${chunks.length} chunks indexed.`);
    }

    console.log(`\n[indexDocuments] Ingestion complete. Total chunks indexed: ${totalChunks}`);
    await pool.end();
}

main().catch(err => {
    console.error('[indexDocuments] Fatal error:', err);
    process.exit(1);
});

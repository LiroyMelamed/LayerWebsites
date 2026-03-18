/**
 * Knowledge Document Service
 * Handles ingestion, chunking, embedding, and deletion of knowledge documents
 * for the RAG chatbot.
 */
const pool = require('../config/db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const EMBEDDING_MODEL = String(process.env.CHATBOT_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
const OPENAI_API_KEY = String(process.env.CHATBOT_LLM_API_KEY || '').trim();
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBEDDING_BATCH = 5;

// ── Text extraction ─────────────────────────────────────────────────

/**
 * Extract text from a file buffer.
 * Supports .txt and .pdf.
 */
async function extractTextFromBuffer(buffer, originalName) {
    const ext = path.extname(originalName).toLowerCase();

    if (ext === '.txt') {
        return buffer.toString('utf-8');
    }

    if (ext === '.pdf') {
        let PDFParse;
        try {
            ({ PDFParse } = require('pdf-parse'));
        } catch {
            throw new Error('pdf-parse is not installed. Run: npm install pdf-parse');
        }
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        await parser.destroy();
        return fixReversedHebrew(result.text);
    }

    throw new Error(`Unsupported file type: ${ext}`);
}

/**
 * Detect and fix reversed Hebrew text from PDF extraction.
 */
function fixReversedHebrew(text) {
    if (!text || text.length < 50) return text;

    const lines = text.split('\n').filter(l => l.trim().length > 10);
    if (lines.length === 0) return text;

    const sampleSize = Math.min(lines.length, 30);
    let punctAtStart = 0;
    let punctAtEnd = 0;

    for (let i = 0; i < sampleSize; i++) {
        const line = lines[Math.floor(i * lines.length / sampleSize)].trim();
        const words = line.split(/\s+/);
        for (const w of words) {
            if (!w) continue;
            if (/^[?!.,;:)(\]\[]/.test(w)) punctAtStart++;
            if (/[?!.,;:)(\]\[]$/.test(w)) punctAtEnd++;
        }
    }

    const isReversed = punctAtStart > punctAtEnd * 1.5 && punctAtStart > 5;
    if (!isReversed) return text;

    return text.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return '';
        if (/[\u0590-\u05FF]/.test(trimmed)) {
            return trimmed.split(/\s+/).reverse().join(' ');
        }
        return trimmed;
    }).join('\n');
}

// ── Chunking ────────────────────────────────────────────────────────

function splitIntoChunks(text) {
    if (!text || text.length === 0) return [];

    const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (clean.length <= CHUNK_SIZE) return [clean];

    const chunks = [];
    let start = 0;

    while (start < clean.length) {
        let end = Math.min(start + CHUNK_SIZE, clean.length);

        if (end < clean.length) {
            const window = clean.slice(start, end);
            const lastParagraph = window.lastIndexOf('\n\n');
            if (lastParagraph > CHUNK_SIZE * 0.4) {
                end = start + lastParagraph + 2;
            } else {
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

        const nextStart = end - CHUNK_OVERLAP;
        if (nextStart <= start || end >= clean.length) {
            start = end;
        } else {
            start = nextStart;
        }
    }

    return chunks;
}

// ── Embeddings ──────────────────────────────────────────────────────

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
    return data.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * List all knowledge documents.
 */
async function listDocuments() {
    const { rows } = await pool.query(
        `SELECT d.id, d.title, d.source_file, d.created_at,
                COUNT(c.id)::int AS chunk_count
         FROM knowledge_documents d
         LEFT JOIN knowledge_chunks c ON c.document_id = d.id
         GROUP BY d.id
         ORDER BY d.created_at DESC`
    );
    return rows;
}

/**
 * Ingest a new document: extract text, chunk, embed, store.
 * @param {Buffer} fileBuffer - raw file bytes
 * @param {string} originalName - original filename (e.g. "doc.pdf")
 * @param {string} [title] - optional title override
 * @returns {{ documentId, chunkCount }}
 */
async function ingestDocument(fileBuffer, originalName, title) {
    const text = await extractTextFromBuffer(fileBuffer, originalName);
    if (!text || text.trim().length === 0) {
        throw new Error('לא הצלחנו לחלץ טקסט מהמסמך');
    }

    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) {
        throw new Error('המסמך לא הניב קטעי טקסט');
    }

    const docTitle = title || path.basename(originalName, path.extname(originalName));

    // Insert document record
    const docResult = await pool.query(
        'INSERT INTO knowledge_documents (title, source_file) VALUES ($1, $2) RETURNING id',
        [docTitle, originalName]
    );
    const documentId = docResult.rows[0].id;

    try {
        // Generate embeddings in batches and insert chunks
        for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
            const batch = chunks.slice(i, i + EMBEDDING_BATCH);
            const embeddings = await generateEmbeddings(batch);

            for (let j = 0; j < batch.length; j++) {
                const embeddingStr = `[${embeddings[j].join(',')}]`;
                await pool.query(
                    'INSERT INTO knowledge_chunks (document_id, content, embedding) VALUES ($1, $2, $3::vector)',
                    [documentId, batch[j], embeddingStr]
                );
            }

            // Small delay between batches
            if (i + EMBEDDING_BATCH < chunks.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (err) {
        // Clean up on failure
        await pool.query('DELETE FROM knowledge_documents WHERE id = $1', [documentId]);
        throw err;
    }

    console.log(`[knowledgeDoc] Ingested "${docTitle}" → ${chunks.length} chunks (doc_id=${documentId})`);
    return { documentId, chunkCount: chunks.length };
}

/**
 * Delete a document and all its chunks (CASCADE handles chunks).
 */
async function deleteDocument(documentId) {
    const { rowCount } = await pool.query(
        'DELETE FROM knowledge_documents WHERE id = $1',
        [documentId]
    );
    if (rowCount === 0) {
        throw new Error('המסמך לא נמצא');
    }
    console.log(`[knowledgeDoc] Deleted document id=${documentId}`);
}

module.exports = {
    listDocuments,
    ingestDocument,
    deleteDocument,
};

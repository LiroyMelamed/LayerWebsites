#!/usr/bin/env node
/**
 * fixQAChunks.js — Fix reversed Hebrew text in Q&A knowledge chunks
 * and regenerate their embeddings.
 *
 * The Q&A PDF extraction produced reversed word order in Hebrew text.
 * This script fixes each chunk's text and updates its embedding.
 *
 * Usage:
 *   node scripts/fixQAChunks.js           # preview changes (dry run)
 *   node scripts/fixQAChunks.js --apply   # apply changes to DB
 */

const path = require('path');
const pool = require('../config/db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const OPENAI_API_KEY = String(process.env.CHATBOT_LLM_API_KEY || '').trim();
const EMBEDDING_MODEL = String(process.env.CHATBOT_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const QA_DOC_TITLE_PATTERN = 'שאלות ותשובות';

const apply = process.argv.includes('--apply');

/**
 * Fix punctuation placement in Hebrew text from PDF extraction.
 * The PDF extractor placed punctuation at the START of words instead of the END.
 * Word order is correct — only punctuation needs moving.
 * 
 * Examples:
 *   ":לקוח"  → "לקוח:"
 *   ",שלום"  → "שלום,"
 *   "?דין"   → "דין?"
 *   ".מלמד" → "מלמד."
 */
function fixReversedLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Only fix lines containing Hebrew characters
    if (!/[\u0590-\u05FF]/.test(trimmed)) return trimmed;

    // Fix each word: move leading punctuation to end of word
    const words = trimmed.split(/\s+/);
    const fixedWords = words.map(word => {
        // Match leading punctuation (?.!,:;) followed by Hebrew content
        const match = word.match(/^([?!.,;:]+)([\u0590-\u05FF].*)$/);
        if (match) {
            return match[2] + match[1];
        }
        return word;
    });

    return fixedWords.join(' ');
}

/**
 * Fix all reversed Hebrew text in a chunk's content.
 */
function fixChunkContent(content) {
    return content.split('\n').map(fixReversedLine).join('\n');
}

async function generateEmbeddings(texts) {
    if (!OPENAI_API_KEY) throw new Error('CHATBOT_LLM_API_KEY not set');

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Embeddings API error ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

async function main() {
    console.log(`[fixQAChunks] Mode: ${apply ? 'APPLY' : 'DRY RUN (use --apply to commit)'}`);

    // Find Q&A document
    const docResult = await pool.query(
        `SELECT id, title FROM knowledge_documents WHERE title LIKE $1`,
        [`%${QA_DOC_TITLE_PATTERN}%`]
    );

    if (docResult.rows.length === 0) {
        console.error('[fixQAChunks] No Q&A document found!');
        process.exit(1);
    }

    const doc = docResult.rows[0];
    console.log(`[fixQAChunks] Found Q&A document: "${doc.title}" (id=${doc.id})`);

    // Fetch all chunks for this document
    const chunksResult = await pool.query(
        `SELECT id, content FROM knowledge_chunks WHERE document_id = $1 ORDER BY id`,
        [doc.id]
    );

    console.log(`[fixQAChunks] Found ${chunksResult.rows.length} chunks to fix`);

    const updates = [];
    for (const chunk of chunksResult.rows) {
        const fixed = fixChunkContent(chunk.content);
        if (fixed !== chunk.content) {
            updates.push({ id: chunk.id, original: chunk.content, fixed });
        }
    }

    console.log(`[fixQAChunks] ${updates.length} chunks need text fixes`);

    // Show preview of first 3 changes
    for (let i = 0; i < Math.min(3, updates.length); i++) {
        const u = updates[i];
        console.log(`\n--- Chunk ${u.id} (preview) ---`);
        console.log('BEFORE:', u.original.substring(0, 200));
        console.log('AFTER: ', u.fixed.substring(0, 200));
    }

    if (!apply) {
        console.log('\n[fixQAChunks] Dry run complete. Use --apply to commit changes.');
        process.exit(0);
    }

    // Apply changes in batches of 5 (for embedding API rate limits)
    const BATCH_SIZE = 5;
    let processed = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const texts = batch.map(u => u.fixed);

        console.log(`[fixQAChunks] Generating embeddings for batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}...`);
        const embeddings = await generateEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
            const { id, fixed } = batch[j];
            const embeddingStr = `[${embeddings[j].join(',')}]`;

            await pool.query(
                `UPDATE knowledge_chunks SET content = $1, embedding = $2::vector WHERE id = $3`,
                [fixed, embeddingStr, id]
            );
            processed++;
        }

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < updates.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    console.log(`\n[fixQAChunks] Done! Updated ${processed} chunks.`);
    process.exit(0);
}

main().catch(err => {
    console.error('[fixQAChunks] Fatal error:', err);
    process.exit(1);
});

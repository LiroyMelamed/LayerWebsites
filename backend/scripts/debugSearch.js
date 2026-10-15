const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../config/db');

async function main() {
    const question = 'איפה אתם יושבים?';

    const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.CHATBOT_LLM_API_KEY}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: question }),
    });
    const data = await resp.json();
    const embedding = data.data[0].embedding;
    const embStr = `[${embedding.join(',')}]`;

    // Check chunk 542 similarity
    const r1 = await pool.query(
        `SELECT kc.id, 1 - (kc.embedding <=> $1::vector) AS sim, substring(kc.content, 1, 150) AS preview
         FROM knowledge_chunks kc WHERE kc.id = 542`,
        [embStr]
    );
    console.log('Chunk 542 similarity:', r1.rows[0]?.sim);
    console.log('Preview:', r1.rows[0]?.preview);

    // Top 10 by similarity
    const r2 = await pool.query(
        `SELECT kc.id, kd.title, 1 - (kc.embedding <=> $1::vector) AS sim
         FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kd.id = kc.document_id
         ORDER BY kc.embedding <=> $1::vector
         LIMIT 10`,
        [embStr]
    );
    console.log('\nTop 10 by vector similarity:');
    r2.rows.forEach(row => console.log(`  chunk ${row.id} | ${row.title} | sim=${Number(row.sim).toFixed(4)}`));

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

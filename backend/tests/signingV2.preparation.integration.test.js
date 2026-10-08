const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { createPreparationService } = require('../services/signingV2/preparation');
const { RenderPool } = require('../services/signingV2/renderPool');
const jobs = require('../services/signingV2/jobs');
const { bytesHash } = require('../lib/signingV2/canonical');

test('real worker PDF preparation persists verified artifacts and leaves later activation blocked until preflight', { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    assert.equal(process.env.DB_PORT, '55442');
    const pool = require('../config/db'); t.after(() => pool.end());
    const pdf = await PDFDocument.create(); pdf.addPage([595, 842]).drawText('SYNTHETIC ONLY');
    const sourceBytes = Buffer.from(await pdf.save());
    const f = await databaseFixture(pool, { packageCount: 2, documentCount: 3, sourceBytes });
    const objects = new Map();
    let sourceReads = 0;
    const storage = {
        read: async () => { sourceReads += 1; return Buffer.from(sourceBytes); },
        write: async (key, bytes) => { assert.ok(key.startsWith(`signing-v2/${f.contextId}/`)); objects.set(key, Buffer.from(bytes)); },
        verify: async (key, length, hash) => { assert.equal(objects.get(key).length, length); assert.equal(bytesHash(objects.get(key)), hash); },
    };
    const renderer = new RenderPool({ concurrency: 2 }); t.after(() => renderer.close());
    const prepare = createPreparationService({ pool, renderer, storage });
    await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    const leases = await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'synthetic-renderer', kinds: ['prepare_document'], limit: 6, leaseSeconds: 60 });
    assert.equal(leases.length, 6);
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 10);
    try { await Promise.all(leases.map(prepare)); } finally { clearInterval(timer); }
    assert.ok(ticks > 5, 'main event loop remained responsive while workers rendered');
    assert.equal(sourceReads, 1); assert.equal(objects.size, 6);
    const docs = (await pool.query(`SELECT d.state,a.object_key,a.content_sha256,r.snapshot->'data'->>'employeeId' AS employee
        FROM signing_documents d JOIN signing_artifacts a ON a.owner_context_id=d.owner_context_id AND a.id=d.prepared_artifact_id
        JOIN signing_package_revisions r ON r.owner_context_id=d.owner_context_id AND r.id=d.revision_id WHERE d.owner_context_id=$1`, [f.contextId])).rows;
    assert.equal(docs.length, 6);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const document of docs) {
        assert.equal(document.state, 'ready');
        const bytes = objects.get(document.object_key); assert.equal(bytesHash(bytes), document.content_sha256);
        const loaded = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: `${require('node:path').resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts')}/` }).promise;
        const text = (await (await loaded.getPage(1)).getTextContent()).items.map(item => item.str).join('');
        assert.ok(text.includes(document.employee));
        assert.ok(!text.includes(document.employee === '000000000' ? '000000001' : '000000000'));
        await loaded.destroy();
    }
    assert.equal((await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'synthetic-validator', kinds: ['validate_package'], limit: 8 })).length, 2);
    assert.equal((await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'synthetic-activation', kinds: ['activate_package'], limit: 8 })).length, 0);
    assert.equal((await pool.query('SELECT count(*) FROM signing_public_grants WHERE owner_context_id=$1', [f.contextId])).rows[0].count, '0');
    assert.equal((await pool.query("SELECT count(*) FROM signing_deliveries WHERE owner_context_id=$1 AND state<>'pending'", [f.contextId])).rows[0].count, '0');
    await assert.rejects(prepare(leases[0]), { errorCode: 'WORKER_LEASE_LOST' });
});

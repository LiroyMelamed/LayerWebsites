const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { syntheticPdf, fakeProvider } = require('./helpers/signingV2Delivery');
const { previewCreation, createFromRows, listTemplates } = require('../services/signingV2/creation');
const { bytesHash } = require('../lib/signingV2/canonical');

test('creation validates and freezes document data, import provenance and defaults; actual PDFs isolate each row',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const source = await syntheticPdf('SYNTHETIC DATA INPUT');
    const f = await databaseFixture(pool, { sourceBytes: source, documentCount: 3, configure: ({ definition }) => {
        definition.dataKeys.push({ key: 'confirmed', type: 'boolean', defaultValue: false }, { key: 'date', type: 'date' });
        return definition;
    } });
    const fields = (await listTemplates(pool, f.scope)).templates[0].dataKeys;
    assert.equal(fields[0].key, 'employeeId');
    const input = { name: 'Document values', templateVersionId: f.versionId, shared: {}, rows: [1, 2, 3].map(i => ({
        key: `row-${i}`, recipients: { employee: { name: `Synthetic ${i}`, email: `person-${i}@example.invalid` } },
        data: { employeeId: `00000${i}`, salary: '9007199254740993.123456', date: '2028-02-29', confirmed: false },
        dataSources: { employeeId: 'import', salary: 'manual' },
    })) };
    const invalid = structuredClone(input); invalid.rows[0].data.employeeId = 123;
    invalid.rows[1].data.date = '08/10/26'; delete invalid.rows[2].data.employeeId;
    const errors = await previewCreation(pool, f.scope, invalid);
    assert.equal(errors.valid, false);
    assert.deepEqual(errors.errors.map(error => [error.path, error.code]), [['rows.0.data.employeeId', 'INVALID_DATA'], ['rows.1.data.date', 'AMBIGUOUS_DATE'], ['rows.2.data.employeeId', 'DATA_REQUIRED']]);
    const unknown = structuredClone(input); unknown.rows[0].data.unexpected = 'must not disappear';
    assert.equal((await previewCreation(pool, f.scope, unknown)).errors[0].code, 'UNKNOWN_DATA_KEY');
    const preview = await previewCreation(pool, f.scope, input);
    assert.equal(preview.valid, true, JSON.stringify(preview));
    assert.equal(preview.sample[0].data.confirmed, false);
    const changed = structuredClone(input); changed.rows[0].data.salary = '1.00';
    await assert.rejects(createFromRows(pool, f.scope, { ...changed, idempotencyKey: randomUUID(), previewHash: preview.previewHash }, { reserveCapacity: async () => {} }), { errorCode: 'PREVIEW_CHANGED' });
    const key = randomUUID(), approved = { ...input, idempotencyKey: key, previewHash: preview.previewHash };
    const created = await createFromRows(pool, f.scope, approved, { reserveCapacity: async () => {} });
    assert.equal((await createFromRows(pool, f.scope, approved, { reserveCapacity: async () => {} })).submissionId, created.submissionId);
    const snapshots = (await pool.query(`SELECT snapshot FROM signing_package_revisions WHERE owner_context_id=$1 ORDER BY snapshot->'data'->>'employeeId'`, [f.contextId])).rows.map(row => row.snapshot);
    assert.deepEqual(snapshots.map(item => item.data.employeeId), ['000001', '000002', '000003']);
    assert.equal(snapshots[0].data.salary, '9007199254740993.123456');
    assert.equal(snapshots[0].data.confirmed, false);
    assert.deepEqual(snapshots[0].provenance.employeeId, { source: 'import' });
    const defaultInput = structuredClone(input); delete defaultInput.rows[0].data.confirmed;
    assert.equal((await previewCreation(pool, f.scope, defaultInput)).valid, true);

    process.env.SIGNING_V2_ENABLED = 'true'; t.after(() => delete process.env.SIGNING_V2_ENABLED);
    const { createRuntime } = require('../services/signingV2/runtime');
    const { RenderPool } = require('../services/signingV2/renderPool');
    const renderer = new RenderPool({ concurrency: 2 }); t.after(() => renderer.close());
    const objects = new Map([[`synthetic/${f.contextId}/source.pdf`, source]]);
    const storage = { read: async key => Buffer.from(objects.get(key)), write: async (key, bytes) => objects.set(key, Buffer.from(bytes)),
        verify: async (key, size, hash) => { assert.equal(objects.get(key)?.length, size); assert.equal(bytesHash(objects.get(key)), hash); } };
    const runtime = createRuntime({ pool, renderer, storage, provider: fakeProvider(), contextIds: [f.contextId], env: {
        SIGNING_V2_GRANT_KEY: Buffer.alloc(32, 21).toString('base64'), WEBSITE_DOMAIN: 'qa.example.invalid' }, log: { log() {}, error() {} } });
    t.after(() => runtime.stop()); await runtime.drain();
    const documents = (await pool.query(`SELECT r.snapshot->'data'->>'employeeId' AS person,a.object_key FROM signing_documents d
        JOIN signing_package_revisions r ON r.id=d.revision_id JOIN signing_artifacts a ON a.id=d.prepared_artifact_id
        WHERE d.owner_context_id=$1`, [f.contextId])).rows;
    assert.equal(documents.length, 9);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const document of documents) {
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(objects.get(document.object_key)), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: `${require('node:path').resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts')}/` }).promise;
        try { const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => item.str).join('');
            assert.ok(text.includes(document.person)); for (const other of ['000001', '000002', '000003'].filter(value => value !== document.person)) assert.ok(!text.includes(other));
        } finally { await pdf.destroy(); }
    }
});

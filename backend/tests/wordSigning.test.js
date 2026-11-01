'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, degrees } = require('pdf-lib');
const { bytesHash } = require('../lib/signingV2/canonical');
const { createDraft, geometries } = require('../services/signingV2/wordSigning');

const previewId = '11111111-1111-4111-8111-111111111111';
const artifactId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const scope = { contextId: '44444444-4444-4444-8444-444444444444', userId: 7 };
const error = code => value => value.code === code || value.errorCode === code;

async function fixture() {
    const pdf = await PDFDocument.create(); pdf.addPage([200, 300]).setRotation(degrees(90));
    const bytes = Buffer.from(await pdf.save());
    const hash = bytesHash(bytes);
    const origin = { kind: 'word_preview', previewId, sourceId: '55555555-5555-4555-8555-555555555555',
        sourceVersion: 3, sourceHash: 'a'.repeat(64), bindingsHash: 'b'.repeat(64), filledDocxHash: 'c'.repeat(64),
        valuesHash: 'd'.repeat(64), inputsHash: 'e'.repeat(64), pdfHash: hash, authorUserId: scope.userId };
    const material = { preview: { id: previewId, name: 'Synthetic.docx', sourceVersion: 3 }, bytes, origin };
    const files = new Map(), writes = [], queries = [], drafts = [];
    let existing;
    const storage = {
        async write(key, value) { writes.push(key); files.set(key, Buffer.from(value)); },
        async verify(key, size, expected) { assert.equal(files.get(key).length, size); assert.equal(bytesHash(files.get(key)), expected); },
        async read(key) { return Buffer.from(files.get(key)); },
    };
    const pool = { async query(sql, args) {
        queries.push({ sql, args });
        if (sql.includes('word:signingArtifactRead')) return { rows: [existing] };
        assert.ok(sql.includes('word:signingArtifact'));
        existing ||= { id: artifactId, owner_context_id: args[1], inputs_hash: args[2], content_sha256: args[3],
            object_key: args[4], bytes: args[5], metadata: args[6], created_by: args[7] };
        return { rows: [existing] };
    } };
    const templates = { async createDraft(_pool, actor, input) {
        assert.equal(actor, scope); drafts.push(input);
        return { id: input.draftId, template_id: '66666666-6666-4666-8666-666666666666', version: 1,
            edit_version: 1, state: 'draft', definition: input.definition };
    } };
    const word = { async signingMaterial(_db, actor, id) { assert.equal(actor, scope); assert.equal(id, previewId); return material; } };
    const input = { expectedPdfHash: hash, locale: 'he', idempotencyKey: draftId };
    return { pool, storage, templates, word, input, material, files, writes, queries, drafts };
}

test('server-verified final PDF enters an author-bound draft without inferred recipients or stale geometry', async () => {
    const f = await fixture();
    const result = await createDraft(f.pool, scope, previewId, f.input, f);
    assert.equal(result.version.id, draftId); assert.equal(result.source.id, artifactId);
    assert.deepEqual(result.origin, f.material.origin);
    const definition = f.drafts[0].definition;
    assert.deepEqual(definition.documents[0].fields, []);
    assert.equal(definition.roles.length, 1); assert.equal(definition.roles[0].capacity, 'personal');
    assert.equal(definition.roles[0].key, 'first'); assert.equal(definition.roles[0].personId, undefined);
    assert.deepEqual(definition.policy, { otpRequired: true, deliveryMode: 'invite' });
    // Match incumbent source registration's canonical 800-wide visual space.
    assert.equal(result.source.pages.length, 1);
    assert.equal(result.source.pages[0].width, 800);
    assert.ok(Math.abs(result.source.pages[0].height - 800 * 200 / 300) < 1e-9);
    assert.deepEqual(f.queries[0].args[6].wordOrigin, f.material.origin);
    assert.ok(f.writes[0].startsWith(`signing-v2/${scope.contextId}/sources/`));
    assert.equal(f.drafts[0].draftId, f.input.idempotencyKey);
});

test('client-supplied keys or provenance cannot replace the server origin', async () => {
    const f = await fixture();
    await assert.rejects(createDraft(f.pool, scope, previewId, { ...f.input, fileKey: 'users/7/other.pdf' }, f), error('INVALID_WORD_INPUTS'));
    await assert.rejects(createDraft(f.pool, scope, previewId, { ...f.input, origin: {} }, f), error('INVALID_WORD_INPUTS'));
    assert.equal(f.writes.length, 0); assert.equal(f.queries.length, 0);
});

test('a changed reviewed hash fails before source registration', async () => {
    const f = await fixture();
    await assert.rejects(createDraft(f.pool, scope, previewId, { ...f.input, expectedPdfHash: '0'.repeat(64) }, f), error('SOURCE_CHANGED'));
    assert.equal(f.writes.length, 0); assert.equal(f.drafts.length, 0);
});

test('storage readback tampering prevents the draft and artifact row', async () => {
    const f = await fixture(); f.storage.read = async () => Buffer.alloc(f.material.bytes.length);
    await assert.rejects(createDraft(f.pool, scope, previewId, f.input, f), error('ARTIFACT_HASH_MISMATCH'));
    assert.equal(f.queries.length, 0); assert.equal(f.drafts.length, 0);
});

test('duplicate artifact with foreign provenance fails closed', async () => {
    const f = await fixture();
    f.pool.query = async () => ({ rows: [{ id: artifactId, created_by: scope.userId,
        content_sha256: f.input.expectedPdfHash, object_key: f.writes[0], bytes: f.material.bytes.length,
        metadata: { wordOrigin: { ...f.material.origin, authorUserId: 99 } } }] });
    await assert.rejects(createDraft(f.pool, scope, previewId, f.input, f), error('SOURCE_CHANGED'));
    assert.equal(f.drafts.length, 0);
});

test('malformed final PDF cannot establish native page geometry', async () => {
    await assert.rejects(geometries(Buffer.from('not a PDF')), error('INVALID_SOURCE'));
});

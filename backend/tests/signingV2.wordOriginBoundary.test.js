'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const gate = require('../services/signingV2/wordOrigin');
const templates = require('../services/signingV2/templates');
const authoring = require('../services/signingV2/authoring');
const creation = require('../services/signingV2/creation');
const submissions = require('../services/signingV2/submissions');

const contextId = '10000000-0000-4000-8000-000000000001';
const scope = { contextId, userId: 11, tenantId: null, all: true, manage: true, send: true, templateManage: true,
    clientView: true, caseView: true, caseAll: true };
const other = { ...scope, userId: 22 };
const origin = { kind: 'word_preview', previewId: '10000000-0000-4000-8000-000000000002',
    sourceId: '10000000-0000-4000-8000-000000000003', sourceVersion: 2,
    sourceHash: 'a'.repeat(64), bindingsHash: 'b'.repeat(64), filledDocxHash: 'c'.repeat(64),
    valuesHash: 'd'.repeat(64), inputsHash: 'e'.repeat(64), pdfHash: 'f'.repeat(64), authorUserId: 11 };
const sourceId = '10000000-0000-4000-8000-000000000004';
const genericSourceId = '10000000-0000-4000-8000-000000000005';
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.errorCode, code); return true; });
const clone = value => JSON.parse(JSON.stringify(value));
function definition(word = true) {
    return { schemaVersion: 2, name: word ? 'Synthetic private Word document' : 'Synthetic ordinary PDF', locale: 'en',
        ...(word ? { origin: clone(origin) } : {}), dataKeys: [],
        stages: [{ key: 'first', label: 'First', after: null }],
        roles: [{ key: 'signer', label: 'Explicit signer', capacity: 'personal', min: 1, max: 1, stage: 0 }],
        documents: [{ key: 'document', name: 'Synthetic document', sourceArtifactId: word ? sourceId : genericSourceId,
            sourceHash: word ? origin.pdfHash : '1'.repeat(64), fields: [{ id: 'signature', type: 'signature',
                roleKey: 'signer', occurrence: 0, pageNum: 1, x: 10, y: 10, width: 100, height: 40, required: true }] }],
        policy: { otpRequired: true, deliveryMode: 'invite' } };
}
async function fixture(t, withWord = true) {
    const pg = new PGlite(); t.after(() => pg.close());
    await pg.exec(`CREATE TABLE signing_templates(id uuid PRIMARY KEY,owner_context_id uuid,law_firm_tenant_id uuid,
        owner_userid integer,name text,definition jsonb,archived boolean DEFAULT false,lifecycle_version integer DEFAULT 1,
        version integer DEFAULT 1,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE signing_template_versions(id uuid PRIMARY KEY,owner_context_id uuid,template_id uuid,version integer,
        state text DEFAULT 'draft',definition jsonb,definition_hash text,created_by integer,base_version_id uuid,
        edit_version integer DEFAULT 1,published_by integer,published_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE signing_artifacts(id uuid PRIMARY KEY,owner_context_id uuid,created_by integer,kind text,state text,
        content_sha256 text,metadata jsonb,bytes integer,object_key text);
      CREATE TABLE signing_submissions(id uuid,owner_context_id uuid,owner_userid integer,idempotency_key uuid,request_hash text);`);
    await pg.query(`INSERT INTO signing_artifacts VALUES($1,$2,11,'source','ready',$3,$4,8,'synthetic-generic.pdf')`,
        [genericSourceId, contextId, '1'.repeat(64), JSON.stringify({ pages: [{ width: 600, height: 800 }] })]);
    if (withWord) {
        await pg.exec(`CREATE TABLE signing_word_sources(id uuid PRIMARY KEY,owner_context_id uuid,created_by integer,
            version integer,source_sha256 text,bindings_hash text,archived boolean DEFAULT false);
          CREATE TABLE signing_word_previews(id uuid PRIMARY KEY,owner_context_id uuid,created_by integer,source_id uuid,
            source_version integer,source_sha256 text,bindings_hash text,filled_docx_sha256 text,values_hash text,inputs_hash text,pdf_sha256 text,
            client_id integer,case_id integer,converter jsonb DEFAULT '{"accessRefs":{"roleClientIds":{}}}');
          CREATE TABLE users(userid integer PRIMARY KEY,name text,email text,phonenumber text,companyname text,role text,
            law_firm_tenant_id uuid,client_profile jsonb DEFAULT '{}');
          CREATE TABLE cases(caseid integer PRIMARY KEY,casename text,law_firm_tenant_id uuid);
          CREATE TABLE case_users(caseid integer,userid integer);`);
        await pg.query('INSERT INTO signing_word_sources VALUES($1,$2,11,2,$3,$4,false)', [origin.sourceId, contextId, origin.sourceHash, origin.bindingsHash]);
        await pg.query(`INSERT INTO signing_word_previews(id,owner_context_id,created_by,source_id,source_version,source_sha256,
            bindings_hash,filled_docx_sha256,values_hash,inputs_hash,pdf_sha256) VALUES($1,$2,11,$3,2,$4,$5,$6,$7,$8,$9)`,
            [origin.previewId, contextId, origin.sourceId, origin.sourceHash, origin.bindingsHash, origin.filledDocxHash, origin.valuesHash, origin.inputsHash, origin.pdfHash]);
        await pg.query(`INSERT INTO signing_artifacts VALUES($1,$2,11,'source','ready',$3,$4,8,'synthetic-word.pdf')`,
            [sourceId, contextId, origin.pdfHash, JSON.stringify({ pages: [{ width: 600, height: 800 }], wordOrigin: origin })]);
    }
    const pool = { query: (...args) => pg.query(...args), connect: async () => ({ query: (...args) => pg.query(...args), release() {} }) };
    return { pg, pool };
}

test('Word origin uses actual native draft/source SQL and remains author-private despite all-firm management', async t => {
    const { pool } = await fixture(t);
    const draft = await templates.createDraft(pool, scope, { definition: definition(), draftId: randomUUID() });
    assert.deepEqual((await authoring.loadVersion(pool, scope, draft.id)).definition.origin, origin);
    assert.equal((await authoring.catalog(pool, other)).templates.length, 0);
    await rejects(authoring.loadVersion(pool, other, draft.id), 'NOT_FOUND');
    await rejects(templates.loadHead(pool, other, draft.template_id, true), 'NOT_FOUND');
    await rejects(authoring.documentFile(pool, other, draft.id, 'document', { read() { throw new Error('must not read storage'); } }), 'NOT_FOUND');
    await rejects(templates.createDraft(pool, other, { definition: definition() }), 'NOT_FOUND');
    const saved = await templates.saveDraft(pool, scope, draft.template_id, draft.id, definition(), draft.edit_version);
    const published = await templates.publish(pool, scope, draft.template_id, draft.id, saved.edit_version, saved.definition_hash);
    assert.equal((await creation.loadVersion(pool, scope, published.id)).template.id, published.id);
    assert.equal((await creation.listTemplates(pool, other)).templates.length, 0);
    await rejects(creation.loadVersion(pool, other, published.id), 'NOT_FOUND');
    await rejects(submissions.createSubmission(pool, other, { idempotencyKey: randomUUID(), templateVersionId: published.id,
        name: 'Synthetic blocked', packages: [{ externalKey: 'only', roles: {} }] }, { reserveCapacity: async () => { throw new Error('must not reserve'); } }), 'NOT_FOUND');
});

test('lower draft APIs reject stripped, mutated, substituted and fake Word origins before writing', async t => {
    const { pool } = await fixture(t);
    const draft = await templates.createDraft(pool, scope, { definition: definition() });
    const stripped = definition(); delete stripped.origin;
    await rejects(templates.saveDraft(pool, scope, draft.template_id, draft.id, stripped, 1), 'WORD_ORIGIN_REQUIRED');
    const altered = definition(); altered.origin.inputsHash = '9'.repeat(64);
    await rejects(templates.saveDraft(pool, scope, draft.template_id, draft.id, altered, 1), 'WORD_ORIGIN_CHANGED');
    await rejects(templates.saveDraft(pool, scope, draft.template_id, draft.id, definition(false), 1), 'WORD_ORIGIN_REQUIRED');
    const fake = definition(); fake.documents = definition(false).documents;
    await rejects(templates.createDraft(pool, scope, { definition: fake }), 'WORD_ORIGIN_REQUIRED');
    const empty = definition(); empty.documents = [];
    await rejects(templates.createDraft(pool, scope, { definition: empty }), 'WORD_ORIGIN_REQUIRED');
    await rejects(authoring.save(pool, scope, randomUUID(), { expectedVersion: 0, definition: empty }), 'WORD_ORIGIN_REQUIRED');
    await rejects(authoring.save(pool, scope, draft.id, { expectedVersion: 1, definition: stripped }), 'WORD_ORIGIN_REQUIRED');
    assert.equal((await pool.query('SELECT edit_version FROM signing_template_versions WHERE id=$1', [draft.id])).rows[0].edit_version, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_templates')).rows[0].n, 1);
    assert.throws(() => gate.validateWordOrigin({ ...origin, injected: true }), { errorCode: 'INVALID_WORD_ORIGIN' });
});

test('native reads, publication and new sends recheck persisted client, case and role access without requiring upload for reads', async t => {
    const { pool } = await fixture(t);
    await pool.query(`INSERT INTO users(userid,name,role) VALUES(31,'Synthetic selected client','Client'),(32,'Synthetic role client','Client')`);
    await pool.query(`INSERT INTO cases(caseid,casename) VALUES(41,'Synthetic case')`);
    await pool.query(`INSERT INTO case_users VALUES(41,11)`);
    await pool.query(`UPDATE signing_word_previews SET client_id=31,case_id=41,
        converter='{"accessRefs":{"roleClientIds":{"tenant":32}}}' WHERE id=$1`, [origin.previewId]);
    const draft = await templates.createDraft(pool, scope, { definition: definition() });
    const view = { ...scope, send: false, manage: false, templateManage: false, caseAll: false };
    assert.equal((await authoring.loadVersion(pool, view, draft.id)).id, draft.id);
    assert.equal((await templates.loadHead(pool, view, draft.template_id)).id, draft.template_id);
    await rejects(authoring.loadVersion(pool, { ...view, clientView: false }, draft.id), 'NOT_FOUND');
    await rejects(templates.loadHead(pool, { ...view, caseView: false }, draft.template_id), 'NOT_FOUND');
    await pool.query('DELETE FROM case_users WHERE caseid=41');
    await rejects(authoring.loadVersion(pool, view, draft.id), 'NOT_FOUND');
    await pool.query('INSERT INTO case_users VALUES(41,11)');
    await pool.query("UPDATE users SET role='Deleted' WHERE userid=32");
    await rejects(templates.publish(pool, scope, draft.template_id, draft.id, draft.edit_version, draft.definition_hash), 'NOT_FOUND');
    assert.equal((await pool.query('SELECT state FROM signing_template_versions WHERE id=$1', [draft.id])).rows[0].state, 'draft');
    await pool.query("UPDATE users SET role='Client' WHERE userid=32");
    const published = await templates.publish(pool, scope, draft.template_id, draft.id, draft.edit_version, draft.definition_hash);
    await pool.query("UPDATE users SET role='Deleted' WHERE userid=31");
    await rejects(creation.loadVersion(pool, scope, published.id), 'NOT_FOUND');
    assert.equal((await authoring.catalog(pool, scope)).templates.length, 0);
    await rejects(submissions.createSubmission(pool, scope, { idempotencyKey: randomUUID(), templateVersionId: published.id,
        name: 'Synthetic revoked access', packages: [{ externalKey: 'only', roles: {} }] },
    { reserveCapacity: async () => { throw new Error('must not reserve'); } }), 'NOT_FOUND');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n, 0);
});

test('source mapping/version/archive drift blocks new native work and direct submissions, preserving frozen rows', async t => {
    const { pool } = await fixture(t);
    const draft = await templates.createDraft(pool, scope, { definition: definition() });
    const published = await templates.publish(pool, scope, draft.template_id, draft.id, draft.edit_version, draft.definition_hash);
    await pool.query('UPDATE signing_word_sources SET version=3 WHERE id=$1', [origin.sourceId]);
    await rejects(templates.createDraft(pool, scope, { definition: definition() }), 'WORD_SOURCE_CHANGED');
    await rejects(authoring.loadVersion(pool, scope, published.id), 'WORD_SOURCE_CHANGED');
    await rejects(creation.loadVersion(pool, scope, published.id), 'WORD_SOURCE_CHANGED');
    assert.equal((await authoring.catalog(pool, scope)).templates.length, 0);
    assert.equal((await creation.listTemplates(pool, scope)).templates.length, 0);
    await rejects(submissions.createSubmission(pool, scope, { idempotencyKey: randomUUID(), templateVersionId: published.id,
        name: 'Synthetic stale', packages: [{ externalKey: 'only', roles: {} }] }, { reserveCapacity: async () => { throw new Error('must not reserve'); } }), 'WORD_SOURCE_CHANGED');
    await pool.query('UPDATE signing_word_sources SET version=2,archived=true WHERE id=$1', [origin.sourceId]);
    await rejects(gate.assertWordDefinition(pool, scope, definition()), 'WORD_SOURCE_CHANGED');
    assert.equal((await pool.query('SELECT definition_hash FROM signing_template_versions WHERE id=$1', [published.id])).rows[0].definition_hash, published.definition_hash);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n, 0);
});

test('ordinary incomplete/native drafts and all-firm reads remain valid without Word tables', async t => {
    const { pool } = await fixture(t, false);
    const incomplete = await templates.createDraft(pool, scope, { definition: { schemaVersion: 2, name: 'Incomplete ordinary draft' } });
    const saved = await templates.saveDraft(pool, scope, incomplete.template_id, incomplete.id, definition(false), 1);
    const published = await templates.publish(pool, scope, saved.template_id, saved.id, saved.edit_version, saved.definition_hash);
    assert.equal((await authoring.loadVersion(pool, other, published.id)).id, published.id);
    assert.equal((await creation.loadVersion(pool, other, published.id)).template.id, published.id);
    assert.equal((await authoring.catalog(pool, other)).templates.length, 1);
    assert.equal((await creation.listTemplates(pool, other)).templates.length, 1);
    assert.equal(published.definition.name, 'Synthetic ordinary PDF');
});

test('Word package associations stay pinned to the private filled preview in preview, create and direct submission paths', async t => {
    const { pool } = await fixture(t);
    await pool.query(`INSERT INTO users(userid,name,role) VALUES(31,'Synthetic selected client','Client')`);
    await pool.query(`INSERT INTO cases(caseid,casename) VALUES(41,'Synthetic selected case')`);
    await pool.query('UPDATE signing_word_previews SET client_id=31,case_id=41 WHERE id=$1', [origin.previewId]);
    const draft = await templates.createDraft(pool, scope, { definition: definition() });
    const published = await templates.publish(pool, scope, draft.template_id, draft.id, draft.edit_version, draft.definition_hash);
    const matching = { clientId: 31, caseId: 41 };
    assert.deepEqual(await gate.assertWordPackageContext(pool, scope, published.definition, [matching, { ...matching }]), matching);
    for (const item of [{ caseId: 41 }, { clientId: 31 }, { ...matching, clientId: 32 }, { ...matching, caseId: 42 }]) {
        await rejects(gate.assertWordPackageContext(pool, scope, published.definition, [matching, item]), 'WORD_CONTEXT_CHANGED');
    }
    const input = { templateVersionId: published.id, name: 'Synthetic pinned Word', caseId: 42, clientId: 31,
        rows: [{ key: 'only', recipients: { signer: { name: 'Explicit recipient', email: 'recipient@example.invalid',
            channels: ['email'], locale: 'en' } } }] };
    await rejects(creation.previewCreation(pool, scope, input), 'WORD_CONTEXT_CHANGED');
    await rejects(creation.previewCreation(pool, scope, { ...input, caseId: 41, clientId: undefined }), 'WORD_CONTEXT_CHANGED');
    await rejects(creation.createFromRows(pool, scope, { ...input, idempotencyKey: randomUUID() },
        { reserveCapacity: async () => { throw new Error('must not reserve'); } }), 'WORD_CONTEXT_CHANGED');
    await rejects(submissions.createSubmission(pool, scope, { idempotencyKey: randomUUID(), templateVersionId: published.id,
        name: 'Synthetic direct mismatch', packages: [{ externalKey: 'only', ...matching, roles: {} },
            { externalKey: 'swapped', clientId: 32, caseId: 41, roles: {} }] },
    { reserveCapacity: async () => { throw new Error('must not reserve'); } }), 'WORD_CONTEXT_CHANGED');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n, 0);
    await pool.query('UPDATE signing_word_previews SET client_id=NULL,case_id=NULL WHERE id=$1', [origin.previewId]);
    assert.deepEqual(await gate.assertWordPackageContext(pool, scope, published.definition, [{}]), { clientId: null, caseId: null });
    assert.equal(await gate.assertWordPackageContext({ query() { throw new Error('generic flow must not query Word'); } }, scope,
        definition(false), [{ caseId: 99, clientId: 98 }]), null);
});

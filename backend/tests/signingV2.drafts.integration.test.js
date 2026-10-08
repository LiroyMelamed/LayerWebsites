const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

test('private drafts survive stale tabs and process loss before/after commit without duplicate sends',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    await f.pool.query(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-08_00_signing_creation_drafts.sql'), 'utf8'));
    process.env.SIGNING_V2_ENABLED = 'true'; process.env.SIGNING_DEPLOYMENT_KEY = `qa-drafts-${randomUUID()}.invalid`;
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; });
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const legacy = await as(request(f.app).post('/api/signing-templates')).send(f.definition);
    assert.equal(legacy.status, 201);
    const converted = await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.body.template.id}/import`)).send({ locale: 'he' });
    assert.equal(converted.status, 201);
    const contextId = (await f.pool.query('SELECT id FROM signing_owner_contexts WHERE deployment_key=$1', [process.env.SIGNING_DEPLOYMENT_KEY])).rows[0].id;
    const scope = { contextId, userId: f.users[0].userid, tenantId: null, all: true, assignedCases: false, caseView: true, caseAll: true };
    const drafts = require('../services/signingV2/drafts');
    const create = require('../services/signingV2/creation');
    const payload = { request: { name: 'Recoverable synthetic send', templateVersionId: converted.body.versionId,
        shared: { shared: { name: 'Synthetic lawyer', email: 'draft-lawyer@example.invalid' } },
        rows: [{ key: 'client-1', recipients: { first: { name: 'Synthetic client', email: 'draft-client@example.invalid' } } }] },
        editor: { source: 'manual', step: 'recipients' } };
    const id = randomUUID();
    const first = await as(request(f.app).put(`/api/signing-v2/creation/drafts/${id}`)).send({ expectedVersion: 0, payload });
    assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.version, 1);
    const replay = await drafts.saveDraft(f.pool, scope, id, { expectedVersion: 0, payload }); assert.equal(replay.version, 1);
    assert.deepEqual((await drafts.getDraft(f.pool, scope, id)).payload, payload);
    const list = await as(request(f.app).get('/api/signing-v2/creation/drafts'));
    assert.equal(list.status, 200); assert.equal(list.body.rows[0].id, id); assert.equal(JSON.stringify(list.body).includes('draft-client'), false);
    await assert.rejects(drafts.getDraft(f.pool, { ...scope, userId: f.users[4].userid }, id), e => e.errorCode === 'NOT_FOUND');
    await assert.rejects(drafts.getDraft(f.pool, { ...scope, contextId: randomUUID() }, id), e => e.errorCode === 'NOT_FOUND');
    const jwt = require('jsonwebtoken'); const clientToken = jwt.sign({ userid: f.users[1].userid, role: 'Client' }, process.env.JWT_SECRET);
    assert.equal((await request(f.app).get(`/api/signing-v2/creation/drafts/${id}`).set('Authorization', `Bearer ${clientToken}`)).status, 403);
    const edited = structuredClone(payload); edited.request.name = 'Changed draft';
    const oldPreview = await create.previewCreation(f.pool, scope, payload.request);
    const changed = await drafts.saveDraft(f.pool, scope, id, { expectedVersion: 1, payload: edited }); assert.equal(changed.version, 2);
    await assert.rejects(drafts.saveDraft(f.pool, scope, id, { expectedVersion: 1, payload }), e => e.errorCode === 'DRAFT_CHANGED');
    const preview = await create.previewCreation(f.pool, scope, edited.request); assert.equal(preview.valid, true);
    await assert.rejects(drafts.submitDraft(f.pool, scope, id, { expectedVersion: 1, previewHash: preview.previewHash }, { reserveCapacity: async () => {} }), e => e.errorCode === 'DRAFT_CHANGED');
    await assert.rejects(drafts.submitDraft(f.pool, scope, id, { expectedVersion: 2, previewHash: oldPreview.previewHash }, { reserveCapacity: async () => {} }), e => e.errorCode === 'PREVIEW_CHANGED');
    await assert.rejects(drafts.saveDraft(f.pool, scope, randomUUID(), { expectedVersion: 0, payload: { ...payload, editor: { giant: 'x'.repeat(1024*1024) } } }), e => e.errorCode === 'DRAFT_TOO_LARGE');
    const approval = { expectedVersion: 2, previewHash: preview.previewHash };
    const beforePeople = (await f.pool.query('SELECT count(*)::integer n FROM signing_people WHERE owner_context_id=$1', [contextId])).rows[0].n;
    const crash = async point => {
        const child = fork(path.join(__dirname, 'helpers/signingDraftCrashChild.cjs'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
        t.after(() => { if (child.exitCode == null) child.kill('SIGKILL'); });
        const signal = once(child, 'message'); child.send({ scope, id, approval, point });
        const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
        let result;
        try { [result] = await Promise.race([signal, once(child, 'exit').then(() => { throw new Error(`child exited before marker: ${errors.slice(-500)}`); })]); }
        finally { clearTimeout(timer); }
        assert.equal(result.point, point, JSON.stringify(result));
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
        return result;
    };
    await crash('before_commit');
    assert.equal((await drafts.getDraft(f.pool, scope, id)).state, 'editing');
    assert.equal((await f.pool.query('SELECT count(*)::integer n FROM signing_people WHERE owner_context_id=$1', [contextId])).rows[0].n, beforePeople, 'no orphan recipient identities');
    assert.equal((await f.pool.query('SELECT count(*)::integer n FROM signing_submissions WHERE owner_context_id=$1', [contextId])).rows[0].n, 0);
    const committed = await crash('after_commit');
    const restored = await as(request(f.app).get(`/api/signing-v2/creation/drafts/${id}`));
    assert.equal(restored.status, 200); assert.equal(restored.body.state, 'submitted'); assert.equal(restored.body.result.submissionId, committed.submissionId);
    assert.equal(restored.body.result.durable, true);
    const duplicates = await Promise.all([0,1].map(() => as(request(f.app).post(`/api/signing-v2/creation/drafts/${id}/submit`)).send(approval)));
    assert.deepEqual(duplicates.map(r => r.status), [200,200]);
    assert.deepEqual(duplicates.map(r => r.body.result.submissionId), [committed.submissionId, committed.submissionId]);
    assert.equal((await f.pool.query('SELECT count(*)::integer n FROM signing_submissions WHERE owner_context_id=$1', [contextId])).rows[0].n, 1);
    assert.equal((await f.pool.query('SELECT count(*)::integer n FROM signing_packages WHERE submission_id=$1', [committed.submissionId])).rows[0].n, 1);
    await assert.rejects(drafts.saveDraft(f.pool, scope, id, { expectedVersion: 3, payload }), e => e.errorCode === 'DRAFT_ALREADY_SUBMITTED');
    await f.pool.query('UPDATE signing_templates SET archived=true WHERE id=$1', [legacy.body.template.id]);
    assert.equal((await drafts.submitDraft(f.pool, scope, id, approval, { reserveCapacity: async () => {} })).result.submissionId, committed.submissionId);
});

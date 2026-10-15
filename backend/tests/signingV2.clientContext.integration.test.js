const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

test('client entry binds packages without granting identity, access or authority',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    const server = f.app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await f.pool.end(); });
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `client-${randomUUID()}.invalid` });
    const as = (call, token = f.token) => call.set('Authorization', `Bearer ${token}`);
    const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };
    const legacy = ok(await as(request(server).post('/api/signing-templates')).send(f.definition), 201).template;
    const imported = ok(await as(request(server).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({}), 201);
    const contextId = (await f.pool.query('SELECT owner_context_id FROM signing_template_versions WHERE id=$1', [imported.versionId])).rows[0].owner_context_id;
    const scope = { contextId, userId: f.users[0].userid, tenantId: null, all: true, caseAll: true, caseView: true, clientView: true, assignedCases: false };
    const clientId = f.users[1].userid;
    const context = require('../services/signingV2/clientContext');
    const creation = require('../services/signingV2/creation');
    const drafts = require('../services/signingV2/drafts');
    const body = { templateVersionId: imported.versionId, name: 'Synthetic client entry', clientId,
        shared: { shared: { name: 'Explicit synthetic lawyer', email: 'lawyer@example.invalid' } },
        rows: [1, 2].map(i => ({ recipients: { first: { name: `Explicit signer ${i}`, email: `signer${i}@example.invalid` } } })) };
    const counts = async () => (await f.pool.query(`SELECT
        (SELECT count(*)::int FROM signing_people WHERE owner_context_id=$1) AS people,
        (SELECT count(*)::int FROM signing_packages WHERE owner_context_id=$1) AS packages,
        (SELECT count(*)::int FROM signing_jobs WHERE owner_context_id=$1) AS jobs`, [contextId])).rows[0];

    await t.test('client contact endpoint matches directory permissions and never leaks tenant/deleted/admin contacts', async () => {
        const data = ok(await as(request(server).get(`/api/signing-v2/creation/clients/${clientId}`)));
        assert.equal(data.id, clientId); assert.equal(data.email, f.users[1].email);
        assert.equal(data.passwordhash, undefined); assert.equal(data.role, undefined);
        const lawyer = jwt.sign({ userid: f.users[4].userid, role: 'Lawyer' }, process.env.JWT_SECRET);
        assert.equal((await as(request(server).get(`/api/signing-v2/creation/clients/${clientId}`), lawyer)).status, 404);
        for (const restricted of [{ ...scope, clientView: false }, { ...scope, tenantId: randomUUID() }]) {
            await assert.rejects(context.loadClientContext(f.pool, restricted, clientId), { errorCode: 'NOT_FOUND' });
        }
        await assert.rejects(context.loadClientContext(f.pool, scope, f.users[0].userid), { errorCode: 'NOT_FOUND' });
        for (const id of ['1e2', '0', '-1', '2147483648']) assert.equal((await as(request(server).get(`/api/signing-v2/creation/clients/${id}`))).status, 422);
    });
    let created;
    await t.test('review binds client selection; concurrent retry creates one linked batch without changing contacts or signer identities', async () => {
        const before = (await f.pool.query('SELECT * FROM users WHERE userid=$1', [clientId])).rows[0];
        const preview = ok(await as(request(server).post('/api/signing-v2/creation/preview')).send(body));
        assert.equal(preview.valid, true); assert.equal(preview.clientId, clientId);
        assert.equal((await as(request(server).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID())
            .send({ ...body, clientId: f.users[2].userid, previewHash: preview.previewHash })).status, 412);
        const key = randomUUID();
        const replies = await Promise.all([0, 1].map(() => as(request(server).post('/api/signing-v2/creation')).set('Idempotency-Key', key)
            .send({ ...body, previewHash: preview.previewHash })));
        assert.deepEqual(replies.map(r => r.status).sort(), [200, 201]);
        created = replies[0].body;
        assert.equal(created.submissionId, replies[1].body.submissionId);
        assert.deepEqual((await f.pool.query('SELECT client_userid,case_id FROM signing_packages WHERE submission_id=$1', [created.submissionId])).rows,
            [{ client_userid: clientId, case_id: null }, { client_userid: clientId, case_id: null }]);
        const snapshots = (await f.pool.query(`SELECT r.snapshot FROM signing_package_revisions r JOIN signing_packages p ON p.id=r.package_id WHERE p.submission_id=$1`, [created.submissionId])).rows;
        for (const { snapshot } of snapshots) assert.equal(snapshot.participants.some(p => p.identity.email === before.email || p.authorityId), false);
        assert.deepEqual((await f.pool.query('SELECT * FROM users WHERE userid=$1', [clientId])).rows[0], before);
    });
    await t.test('private draft recovery and creation recheck client availability before any new people/jobs', async () => {
        const id = randomUUID(), payload = { request: body, editor: { synthetic: true } };
        const saved = await drafts.saveDraft(f.pool, scope, id, { expectedVersion: 0, payload });
        const preview = await creation.previewCreation(f.pool, scope, body);
        assert.equal((await drafts.getDraft(f.pool, scope, id)).payload.request.clientId, clientId);
        const before = await counts();
        await assert.rejects(drafts.getDraft(f.pool, { ...scope, clientView: false }, id), { errorCode: 'NOT_FOUND' });
        await f.pool.query("UPDATE users SET role='Deleted' WHERE userid=$1", [clientId]);
        await assert.rejects(drafts.getDraft(f.pool, scope, id), { errorCode: 'NOT_FOUND' });
        await assert.rejects(drafts.submitDraft(f.pool, scope, id, { expectedVersion: saved.version, previewHash: preview.previewHash }, { reserveCapacity: async () => {} }), { errorCode: 'NOT_FOUND' });
        await assert.rejects(creation.createFromRows(f.pool, scope, { ...body, previewHash: preview.previewHash, idempotencyKey: randomUUID() }, { reserveCapacity: async () => {} }), { errorCode: 'NOT_FOUND' });
        assert.deepEqual(await counts(), before);
        // Historical association/snapshots remain intact even after account removal.
        assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_packages WHERE submission_id=$1 AND client_userid=$2', [created.submissionId, clientId])).rows[0].n, 2);
        await f.pool.query("UPDATE users SET role='Client' WHERE userid=$1", [clientId]);
        const submitted = await drafts.submitDraft(f.pool, scope, id, { expectedVersion: saved.version, previewHash: preview.previewHash }, { reserveCapacity: async () => {} });
        assert.equal(submitted.state, 'submitted');
        assert.equal((await drafts.getDraft(f.pool, scope, id)).result.submissionId, submitted.result.submissionId);
    });
    await t.test('a committed concurrent client deletion blocks a waiting creation without partial writes', async () => {
        const preview = await creation.previewCreation(f.pool, scope, body), before = await counts();
        const blocker = await f.pool.connect();
        try {
            await blocker.query('BEGIN');
            await blocker.query("UPDATE users SET role='Deleted' WHERE userid=$1", [clientId]);
            const pending = creation.createFromRows(f.pool, scope, { ...body, previewHash: preview.previewHash, idempotencyKey: randomUUID() }, { reserveCapacity: async () => {} });
            const outcome = pending.then(result => ({ result }), error => ({ error }));
            let waiting = false;
            for (let i = 0; i < 100; i++) {
                waiting = (await f.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT userid FROM users WHERE userid=ANY%') AS waiting")).rows[0].waiting;
                if (waiting) break;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            await blocker.query('COMMIT');
            const finished = await outcome;
            assert.equal(waiting, true, 'creation must wait on the client share-lock');
            assert.equal(finished.error?.errorCode, 'NOT_FOUND');
            assert.deepEqual(await counts(), before);
        } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    });
});

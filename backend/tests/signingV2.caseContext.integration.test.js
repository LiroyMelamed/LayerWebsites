const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

test('case send context is permission-scoped, explicit, immutable and rechecked at creation',
    { skip: process.env.LEGAL_DB_QA !== 'true' }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `qa-${randomUUID()}.invalid` });
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const ok = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
    const insertCase = async name => (await f.pool.query(`INSERT INTO cases(casename,casemanagerid,userid,createdat,updatedat,isclosed,istagged)
        VALUES($1,$2,$3,now(),now(),false,false) RETURNING caseid`, [name, f.users[4].userid, f.users[1].userid])).rows[0].caseid;
    const unique = randomUUID();
    const firstCase = await insertCase(`Synthetic ${unique} A`), secondCase = await insertCase(`Synthetic ${unique} B`);
    await f.pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2),($1,$3)', [firstCase, f.users[1].userid, f.users[4].userid]);
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(f.definition), 201).template;
    const imported = ok(await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({}), 201);
    const contextId = (await f.pool.query('SELECT owner_context_id FROM signing_template_versions WHERE id=$1', [imported.versionId])).rows[0].owner_context_id;
    const scope = { contextId, userId: f.users[0].userid, tenantId: null, all: true, caseAll: true, caseView: true, assignedCases: false };
    const service = require('../services/signingV2/caseContext');
    const creation = require('../services/signingV2/creation');
    const person = { name: 'Synthetic client', email: 'client@example.invalid' };
    const body = { templateVersionId: imported.versionId, name: 'Synthetic case send', caseId: firstCase,
        shared: { shared: { name: 'Synthetic representative', email: 'representative@example.invalid' } }, rows: [{ recipients: { first: person } }] };

    await t.test('search and details expose only allowed cases and deduplicate associated contacts', async () => {
        const data = ok(await as(request(f.app).get(`/api/signing-v2/creation/cases/${firstCase}`)), 200);
        assert.equal(data.id, firstCase);
        assert.deepEqual(data.people.map(person => person.id).sort((a,b) => a-b), [f.users[1].userid, f.users[4].userid].sort((a,b) => a-b));
        const restricted = { ...scope, userId: f.users[4].userid, caseAll: false };
        assert.deepEqual((await service.searchCases(f.pool, restricted, unique)).cases.map(row => row.id), [firstCase]);
        await assert.rejects(service.loadCaseContext(f.pool, restricted, secondCase), { errorCode: 'NOT_FOUND' });
        await assert.rejects(service.loadCaseContext(f.pool, { ...scope, caseView: false }, firstCase), { errorCode: 'NOT_FOUND' });
        await assert.rejects(service.loadCaseContext(f.pool, { ...scope, tenantId: randomUUID() }, firstCase), { errorCode: 'NOT_FOUND' });
        assert.deepEqual((await service.searchCases(f.pool, { ...scope, caseView: false }, unique)).cases, []);
        assert.equal((await as(request(f.app).get('/api/signing-v2/creation/cases/1e2'))).status, 422);
    });
    await t.test('preview binds the case, persistence retains it and never edits the case contacts', async () => {
        const before = (await f.pool.query('SELECT name,email,phonenumber FROM users WHERE userid=$1', [f.users[1].userid])).rows[0];
        const preview = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(body), 200);
        assert.equal(preview.valid, true); assert.equal(preview.caseId, firstCase);
        assert.equal((await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID())
            .send({ ...body, caseId: secondCase, previewHash: preview.previewHash })).status, 412);
        const created = ok(await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID()).send({ ...body, previewHash: preview.previewHash }), 201);
        assert.deepEqual((await f.pool.query('SELECT case_id FROM signing_packages WHERE submission_id=$1', [created.submissionId])).rows, [{ case_id: firstCase }]);
        assert.deepEqual((await f.pool.query('SELECT name,email,phonenumber FROM users WHERE userid=$1', [f.users[1].userid])).rows[0], before);
    });
    await t.test('revoked case access is checked again before creating any people or jobs', async () => {
        const restricted = { ...scope, userId: f.users[4].userid, caseAll: false };
        const preview = await creation.previewCreation(f.pool, restricted, body);
        await f.pool.query('DELETE FROM case_users WHERE caseid=$1 AND userid=$2', [firstCase, f.users[4].userid]);
        const count = async () => (await f.pool.query('SELECT count(*)::integer AS n FROM signing_people WHERE owner_context_id=$1', [contextId])).rows[0].n;
        const before = await count();
        await assert.rejects(creation.createFromRows(f.pool, restricted, { ...body, previewHash: preview.previewHash, idempotencyKey: randomUUID() }, { reserveCapacity: async () => {} }), { errorCode: 'NOT_FOUND' });
        assert.equal(await count(), before);
    });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { bytesHash } = require('../lib/signingV2/canonical');

test('native authoring HTTP keeps source PDFs scoped, drafts private and published versions immutable',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    process.env.SIGNING_DEPLOYMENT_KEY = `authoring-${randomUUID()}.invalid`;
    const base = '/api/signing-v2/authoring';
    const as = (call, token = f.token) => call.set('Authorization', `Bearer ${token}`);
    const ok = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
    const admin = (await f.pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Other synthetic admin',$1,'Admin','synthetic') RETURNING userid", [`${randomUUID()}@example.invalid`])).rows[0].userid;
    const adminToken = jwt.sign({ userid: admin, role: 'Admin' }, process.env.JWT_SECRET);
    const clientToken = jwt.sign({ userid: f.users[1].userid, role: 'Client' }, process.env.JWT_SECRET);
    await t.test('feature flag, authentication and office upload permissions remain mandatory', async () => {
        delete process.env.SIGNING_V2_ENABLED;
        assert.equal((await as(request(f.app).get(`${base}/templates`))).status, 404);
        process.env.SIGNING_V2_ENABLED = 'true';
        assert.equal((await request(f.app).get(`${base}/templates`)).status, 401);
        for (const method of ['get', 'put', 'post']) {
            const route = method === 'get' ? '/templates' : method === 'put' ? `/drafts/${randomUUID()}` : '/sources';
            const denied = await as(request(f.app)[method](`${base}${route}`), clientToken).send({ fileKey: f.key });
            assert.equal(denied.status, 403, `${method} ${route}: ${JSON.stringify(denied.body)}`);
        }
    });
    let source;
    await t.test('owned PDF registration validates actual bytes, copies once logically and never returns storage keys', async () => {
        assert.equal((await as(request(f.app).post(`${base}/sources`)).send({ fileKey: `users/${admin}/foreign.pdf` })).status, 422);
        const [first, second] = await Promise.all([0, 1].map(() => as(request(f.app).post(`${base}/sources`)).send({ fileKey: f.key })));
        source = ok(first).source;
        assert.deepEqual(ok(second).source, source);
        assert.equal(source.hash, bytesHash(f.objects.get(f.key)));
        assert.equal(source.pages.length, 2);
        assert.equal(source.pages[0].width, 800); assert.ok(Math.abs(source.pages[0].height - 800 * 550 / 750) < 0.0001);
        assert.equal(source.object_key, undefined);
    });
    const id = randomUUID();
    const incomplete = { schemaVersion: 2, name: 'Native draft / טיוטה', documents: [] };
    let draft;
    await t.test('a repeated creation is one private recoverable draft and other administrators cannot read it', async () => {
        const replies = await Promise.all([0, 1].map(() => as(request(f.app).put(`${base}/drafts/${id}`)).send({ expectedVersion: 0, definition: incomplete })));
        draft = ok(replies[0]).version;
        assert.deepEqual(ok(replies[1]).version, draft);
        assert.equal(draft.editVersion, 1);
        const list = ok(await as(request(f.app).get(`${base}/templates`))).templates;
        assert.equal(list.filter(item => item.id === id).length, 1);
        assert.equal(ok(await as(request(f.app).get(`${base}/versions/${id}`))).version.id, id);
        assert.equal((await as(request(f.app).get(`${base}/versions/${id}`), adminToken)).status, 404);
        assert.equal(ok(await as(request(f.app).get(`${base}/templates`), adminToken)).templates.some(item => item.id === id), false);
        assert.equal((await as(request(f.app).post(`${base}/drafts/${id}/publish`)).send({ expectedVersion: 1, definitionHash: draft.definitionHash })).status, 422);
    });
    const definition = { schemaVersion: 2, name: 'Native actual PDF', locale: 'he',
        dataKeys: [{ key: 'identifier', label: 'תעודת זהות', type: 'identifier', required: true },
            { key: 'amount', type: 'decimal', defaultValue: '9007199254740993.120000' },
            { key: 'consent', type: 'boolean', defaultValue: false }],
        stages: [{ key: 'together', label: 'Together', after: null }, { key: 'later', label: 'Later', after: 'together' }],
        roles: [{ key: 'client', label: 'Client', capacity: 'personal', stage: 0, min: 1, max: 1 },
            { key: 'other', label: 'Other', capacity: 'personal', stage: 0, min: 1, max: 1 },
            { key: 'lawyer', label: 'Lawyer', capacity: 'professional', stage: 1, min: 1, max: 1 }],
        documents: [{ key: 'agreement', name: 'Agreement', sourceArtifactId: source.id, sourceHash: source.hash, fields: [
            { id: 'identifier', type: 'data', dataKey: 'identifier', pageNum: 1, x: 40, y: 40, width: 200, height: 40, fontSize: 14, overflow: 'block' },
            ...['client', 'other', 'lawyer'].map((roleKey, index) => ({ id: `sign${index}`, type: 'signature', roleKey, occurrence: 0,
                pageNum: 2, x: 50, y: 60 + index * 100, width: 200, height: 60, required: true })),
        ] }], policy: { otpRequired: true, deliveryMode: 'invite' } };
    await t.test('concurrent saves use CAS, enforce source scope/hash, and preserve exact data and geometry', async () => {
        const bad = structuredClone(definition); bad.documents[0].sourceArtifactId = randomUUID();
        assert.equal((await as(request(f.app).put(`${base}/drafts/${id}`)).send({ expectedVersion: 1, definition: bad })).status, 404);
        bad.documents[0].sourceArtifactId = source.id; bad.documents[0].sourceHash = 'a'.repeat(64);
        assert.equal((await as(request(f.app).put(`${base}/drafts/${id}`)).send({ expectedVersion: 1, definition: bad })).status, 422);
        const replies = await Promise.all([0, 1].map(() => as(request(f.app).put(`${base}/drafts/${id}`)).send({ expectedVersion: 1, definition })));
        assert.deepEqual(replies.map(r => r.status).sort(), [200, 412]);
        draft = ok(replies.find(r => r.status === 200)).version;
        assert.deepEqual(draft.definition, definition);
        assert.equal((await as(request(f.app).post(`${base}/drafts/${id}/publish`), adminToken).send({ expectedVersion: 2, definitionHash: draft.definitionHash })).status, 404);
    });
    let published;
    await t.test('explicit hash-bound publication freezes the reviewed version without sending', async () => {
        assert.equal((await as(request(f.app).post(`${base}/drafts/${id}/publish`)).send({ expectedVersion: 2, definitionHash: 'a'.repeat(64) })).status, 412);
        published = ok(await as(request(f.app).post(`${base}/drafts/${id}/publish`)).send({ expectedVersion: draft.editVersion, definitionHash: draft.definitionHash })).version;
        assert.equal(published.state, 'published');
        assert.equal(published.definition.dataKeys[1].defaultValue, '9007199254740993.120000');
        assert.equal(published.definition.dataKeys[2].defaultValue, false);
        assert.equal((await as(request(f.app).put(`${base}/drafts/${id}`)).send({ expectedVersion: published.editVersion, definition })).status, 412);
        const download = await as(request(f.app).get(`${base}/versions/${id}/documents/agreement`));
        assert.equal(download.status, 200); assert.equal(bytesHash(download.body), source.hash);
        assert.equal(download.headers['cache-control'], 'private, no-store');
        assert.equal((await as(request(f.app).get(`${base}/versions/${id}/documents/guessed`))).status, 404);
        assert.equal(f.deliveries.length, 0); assert.equal(f.otp.length, 0);
    });
    await t.test('another publication invalidates an older editors base without overwriting either revision', async () => {
        const start = async name => ok(await as(request(f.app).put(`${base}/drafts/${randomUUID()}`)).send({
            expectedVersion: 0, templateId: draft.templateId, baseVersionId: id, definition: { ...definition, name } })).version;
        const [a, b] = await Promise.all([start('Editor A'), start('Editor B')]);
        const responses = await Promise.all([a, b].map(v => as(request(f.app).post(`${base}/drafts/${v.id}/publish`))
            .send({ expectedVersion: v.editVersion, definitionHash: v.definitionHash })));
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 412]);
        const winner = ok(responses.find(r => r.status === 200)).version;
        assert.equal((await as(request(f.app).put(`${base}/drafts/${randomUUID()}`)).send({
            expectedVersion: 0, templateId: draft.templateId, baseVersionId: id, definition })).status, 412);
        assert.deepEqual(ok(await as(request(f.app).get(`${base}/versions/${id}`))).version.definition, published.definition);
        const head = (await f.pool.query('SELECT definition FROM signing_templates WHERE id=$1', [draft.templateId])).rows[0];
        assert.equal(head.definition.name, winner.definition.name);
    });
    await t.test('catalog retains the latest published choice beside private drafts', async () => {
        const list = ok(await as(request(f.app).get(`${base}/templates`))).templates.filter(v => v.templateId === draft.templateId);
        assert.equal(list.filter(v => v.state === 'published').length, 1);
        assert.equal(list.filter(v => v.state === 'draft').length, 1);
        assert.equal(list.every(v => v.canEdit), true);
    });
    await t.test('custom scopes cannot reuse guessed foreign sources or publish without upload permission', async () => {
        const { makePermissions } = require('./helpers/pgTestHarness');
        const createActor = async (actions, dataScope) => {
            const role = (await f.pool.query(`INSERT INTO firm_staff_roles(name,permissions,is_active) VALUES($1,$2,TRUE) RETURNING id`,
                [`Authoring scope ${randomUUID()}`, makePermissions({ signing: { visible: true, actions, dataScope } })])).rows[0];
            const user = (await f.pool.query(`INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Synthetic scoped author',$1,'Lawyer','synthetic',$2) RETURNING userid`,
                [`${randomUUID()}@example.invalid`, role.id])).rows[0];
            return jwt.sign({ userid: user.userid, role: 'Lawyer' }, process.env.JWT_SECRET);
        };
        const scoped = await createActor(['view','upload'], 'assigned_only');
        assert.equal((await as(request(f.app).get(`${base}/versions/${id}`), scoped)).status, 404);
        assert.equal((await as(request(f.app).get(`${base}/versions/${id}/documents/agreement`), scoped)).status, 404);
        assert.equal((await as(request(f.app).put(`${base}/drafts/${randomUUID()}`), scoped).send({ expectedVersion: 0, definition })).status, 404);
        const reader = await createActor(['view'], 'all_firm');
        assert.equal((await as(request(f.app).get(`${base}/versions/${id}`), reader)).status, 200);
        assert.equal((await as(request(f.app).put(`${base}/drafts/${randomUUID()}`), reader).send({ expectedVersion: 0, definition })).status, 403);
        assert.equal((await as(request(f.app).post(`${base}/drafts/${id}/publish`), reader).send({ expectedVersion: 2, definitionHash: published.definitionHash })).status, 403);
        assert.equal(ok(await as(request(f.app).get(`${base}/templates`), reader)).templates.every(v => !v.canEdit), true);
    });
    await t.test('another deployment cannot read versions, PDFs or reuse their sources', async () => {
        const old = process.env.SIGNING_DEPLOYMENT_KEY;
        process.env.SIGNING_DEPLOYMENT_KEY = `foreign-${randomUUID()}.invalid`;
        try {
            assert.equal((await as(request(f.app).get(`${base}/versions/${id}`))).status, 404);
            assert.equal((await as(request(f.app).get(`${base}/versions/${id}/documents/agreement`))).status, 404);
            assert.equal((await as(request(f.app).put(`${base}/drafts/${randomUUID()}`)).send({ expectedVersion: 0, definition })).status, 404);
        } finally { process.env.SIGNING_DEPLOYMENT_KEY = old; }
    });
    await t.test('tampered storage is not served as the reviewed PDF', async () => {
        const row = (await f.pool.query('SELECT object_key FROM signing_artifacts WHERE id=$1', [source.id])).rows[0];
        const original = f.objects.get(row.object_key);
        f.objects.set(row.object_key, Buffer.alloc(original.length, 32));
        assert.equal((await as(request(f.app).get(`${base}/versions/${id}/documents/agreement`))).status, 422);
        f.objects.set(row.object_key, original);
    });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deliveryHarness } = require('./helpers/signingV2Delivery');

test('signing v2 HTTP routes are off by default, scoped to the office and keep targeted sends idempotent',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    delete process.env.SIGNING_V2_ENABLED;
    const pool = require('../config/db'); t.after(() => pool.end());
    const request = require('supertest'); const jwt = require('jsonwebtoken'); const app = require('../app');
    const h = await deliveryHarness(pool, { endpoints: ['ok-0@example.invalid', 'reject-1@example.invalid'] }); t.after(h.close);
    const receipt = await h.submit(); await h.activate(); await h.drain('dispatch_delivery');
    const { byKey, people } = await h.targets(receipt.submissionId);
    const { deployment_key: deploymentKey } = (await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1', [h.f.contextId])).rows[0];
    const token = jwt.sign({ userid: h.f.scope.userId, role: 'Admin' }, process.env.JWT_SECRET);
    const as = (call, bearer = token) => call.set('Authorization', `Bearer ${bearer}`);

    assert.equal((await as(request(app).get('/api/signing-v2/submissions'))).status, 404, 'offices without the flag keep current flows only');
    process.env.SIGNING_V2_ENABLED = 'true'; process.env.SIGNING_DEPLOYMENT_KEY = deploymentKey;
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; });

    assert.equal((await request(app).get('/api/signing-v2/submissions')).status, 401);
    const client = (await pool.query(`INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic client',$1,'Client','synthetic-only') RETURNING userid`,
        [`${randomUUID()}@example.invalid`])).rows[0].userid;
    assert.equal((await as(request(app).get('/api/signing-v2/submissions'), jwt.sign({ userid: client, role: 'Client' }, process.env.JWT_SECRET))).status, 403);

    const list = await as(request(app).get('/api/signing-v2/submissions?state=all'));
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.headers['cache-control'], 'private, no-store');
    assert.deepEqual(list.body.rows.map(row => row.id), [receipt.submissionId]);
    const children = await as(request(app).get(`/api/signing-v2/submissions/${receipt.submissionId}/packages?state=all`));
    assert.equal(children.body.rows.length, 2);
    const detail = await as(request(app).get(`/api/signing-v2/packages/${byKey['employee-1'].id}`));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.deliveries[0].state, 'failed');

    const path = `/api/signing-v2/packages/${byKey['employee-1'].id}/participants/${people['employee-1']}`;
    const preview = await as(request(app).post(`${path}/action-preview`)).send({ purpose: 'resend' });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.eligible, true);
    assert.ok(!JSON.stringify(preview.body).includes('reject-1@example.invalid'), 'the destination is masked');
    assert.equal((await as(request(app).post(`${path}/actions`)).send({ purpose: 'resend', previewHash: preview.body.previewHash })).status, 422,
        'a send without an idempotency key is refused');
    const key = randomUUID();
    const send = () => as(request(app).post(`${path}/actions`)).set('Idempotency-Key', key).send({ purpose: 'resend', previewHash: preview.body.previewHash });
    const [first, second] = await Promise.all([send(), send()]);
    assert.deepEqual([first.status, second.status].sort(), [200, 202], 'double click is one queued operation');
    assert.equal(first.body.operationId, second.body.operationId);
    assert.equal((await as(request(app).get(`/api/signing-v2/operations/${first.body.operationId}`))).body.items[0].state, 'queued',
        'the response reports queueing, not delivery');
    const before = h.provider.calls.length;
    assert.equal(await h.drain('dispatch_delivery'), 1);
    assert.deepEqual(h.provider.calls.slice(before).map(call => [call.endpoint, call.purpose]), [['reject-1@example.invalid', 'resend']]);
    const status = await as(request(app).get(`/api/signing-v2/operations/${first.body.operationId}`));
    assert.equal(status.body.items[0].state, 'failed', 'the synthetic provider rejected it again and that is what is reported');

    process.env.SIGNING_DEPLOYMENT_KEY = `other-${randomUUID()}.invalid`;
    assert.deepEqual((await as(request(app).get('/api/signing-v2/submissions?state=all'))).body.rows, [], 'another office sees nothing');
    assert.equal((await as(request(app).get(`/api/signing-v2/packages/${byKey['employee-1'].id}`))).status, 404);
    assert.equal((await as(request(app).post(`${path}/action-preview`)).send({ purpose: 'resend' })).status, 404);
    assert.equal((await as(request(app).get(`/api/signing-v2/operations/${first.body.operationId}`))).status, 404);
});

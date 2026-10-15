'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const scope = require('../lib/tenant/databaseScope');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';

function setup(t) {
    const restored = [], calls = [];
    function stub(module, exports) {
        const id = require.resolve(module); restored.push([id, require.cache[id]]);
        require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    const service = new Proxy({}, { get: (_, name) => async (...args) => { calls.push({ name, args, scope: scope.current() }); return name === 'snapshot' ? {} : { ok: true }; } });
    stub('../config/db', { query: async (sql, args) => {
        calls.push({ name: 'query', sql, args, scope: scope.current() });
        if (sql.includes('FROM office_integrations')) return { rows: args[0] === '123456789' && args[1] === '987654321' ? [{ id: 'connection-a', law_firm_tenant_id: A }] : [] };
        return { rows: [A, B].includes(args?.[0]) ? [{ id: args[0] }] : [] };
    } });
    stub('../lib/tenant/tenantContext', { isMultiTenantMode: () => true });
    stub('../services/settingsService', { isPlatformAdmin: async id => id === 1 });
    // Authentication is covered elsewhere. Here trusted identity fixtures exercise
    // the real platform-admin and route authorization/scope boundaries.
    stub('../middlewares/authMiddleware', (req, _res, next) => {
        const identity = req.headers['x-test-identity'];
        if (!identity) return next(Object.assign(new Error('unauthorized'), { httpStatus: 401 }));
        req.user = { UserId: identity === 'platform' ? 1 : 2, Role: identity === 'client' ? 'User' : 'Admin' };
        if (identity !== 'platform') req.firmTenantId = A;
        req.isOfficeOwner = identity === 'owner'; next();
    });
    stub('../middlewares/requireFirmAction', () => (_req, _res, next) => next());
    stub('../lib/firmPermissions/caseAccess', { assertCaseRecordAccess: async () => null });
    stub('../services/integrations/runtime', { service, worker: { receiveLifecycle: async (...args) => calls.push({ name: 'lifecycle', args, scope: scope.current() }) }, runOffice: (id, fn) => scope.withOffice(id, fn) });
    const routes = ['../routes/officeIntegrationsRoutes', '../routes/whatsappWebhookRoutes', '../middlewares/requirePlatformAdmin'];
    for (const name of routes) { const id = require.resolve(name); restored.push([id, require.cache[id]]); delete require.cache[id]; }
    const app = express();
    app.use('/webhook', require('../routes/whatsappWebhookRoutes'));
    app.use(express.json()); app.use('/integrations', require('../routes/officeIntegrationsRoutes'));
    app.use((err, _req, res, _next) => res.status(err.httpStatus || 500).json({ code: err.errorCode || 'ERROR' }));
    const oldSecret = process.env.WHATSAPP_META_APP_SECRET, oldVerify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    process.env.WHATSAPP_META_APP_SECRET = 'test-signature-secret'; process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-verify';
    t.after(() => {
        for (const [id, old] of restored.reverse()) { if (old) require.cache[id] = old; else delete require.cache[id]; }
        for (const [key, value] of [['WHATSAPP_META_APP_SECRET', oldSecret], ['WHATSAPP_WEBHOOK_VERIFY_TOKEN', oldVerify]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    });
    return { app, calls };
}
test('only platform admin configures recipients; owner connects own office; staff and clients denied', async t => {
    const { app, calls } = setup(t);
    await request(app).get('/integrations').expect(401);
    for (const who of ['staff', 'client']) await request(app).get('/integrations').set('x-test-identity', who).expect(403);
    await request(app).get(`/integrations?officeId=${B}`).set('x-test-identity', 'owner').expect(403);
    await request(app).put('/integrations/whatsapp').set('x-test-identity', 'owner').send({ enabled: true }).expect(403);
    await request(app).put('/integrations/court').set('x-test-identity', 'owner').send({ enabled: true, syncTime: '08:00' }).expect(403);
    await request(app).get('/integrations/settings').set('x-test-identity', 'owner').expect(200);
    await request(app).put(`/integrations/court?officeId=${B}`).set('x-test-identity', 'platform').send({ enabled: true, syncTime: '09:30' }).expect(200);
    assert.equal(calls.find(c => c.name === 'saveCourt').args[0], B);
    await request(app).post('/integrations/whatsapp/signup').set('x-test-identity', 'owner').expect(200);
    const signup = calls.find(c => c.name === 'startSignup');
    assert.deepEqual(signup.args, [A, 2]); assert.deepEqual(signup.scope, { mode: 'office', tenantId: A });
    await request(app).put(`/integrations/whatsapp?officeId=${B}`).set('x-test-identity', 'platform').send({ enabled: false }).expect(200);
    assert.equal(calls.find(c => c.name === 'saveWhatsapp').args[0], B);
    assert.equal(calls.find(c => c.name === 'saveWhatsapp').scope.tenantId, B);
    await request(app).get('/integrations').set('x-test-identity', 'platform').expect(400);
    await request(app).get('/integrations/cases/1').set('x-test-identity', 'client').expect(403);
});
test('webhook authenticates exact bytes and routes by both verified assets into office scope', async t => {
    const { app, calls } = setup(t);
    await request(app).get('/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'challenge' }).expect(403);
    const challenge = await request(app).get('/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify', 'hub.challenge': 'challenge' }).expect(200);
    assert.equal(challenge.text, 'challenge');
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '987654321', changes: [{ field: 'group_lifecycle_update', value: { metadata: { phone_number_id: '123456789' }, groups: [{ type: 'group_create' }] } }] }] });
    const signature = 'sha256=' + crypto.createHmac('sha256', 'test-signature-secret').update(payload).digest('hex');
    await request(app).post('/webhook').type('json').send(payload).expect(403);
    await request(app).post('/webhook').type('json').set('x-hub-signature-256', signature).send(payload + ' ').expect(403);
    assert.equal(calls.length, 0);
    await request(app).post('/webhook').type('json').set('x-hub-signature-256', signature).send(payload).expect(200);
    const lifecycle = calls.find(c => c.name === 'lifecycle');
    assert.deepEqual(lifecycle.args.slice(0, 4), [A, 'connection-a', '987654321', '123456789']);
    assert.equal(lifecycle.scope.tenantId, A);
    assert.equal(calls.find(c => c.name === 'query').scope.mode, 'system');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const scope = require('../lib/tenant/databaseScope');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';

function setup(t, { multiTenantMode = true } = {}) {
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
    stub('../lib/tenant/tenantContext', { isMultiTenantMode: () => multiTenantMode });
    stub('../services/settingsService', { isPlatformAdmin: async id => id === 1, getSetting: async () => 'MelamedLaw' });
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
    stub('../services/integrations/runtime', { service, worker: { receiveLifecycle: async (...args) => calls.push({ name: 'lifecycle', args, scope: scope.current() }) }, runOffice: (id, fn) => id ? scope.withOffice(id, fn) : scope.withLegacyOffice(fn) });
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
test('office owner manages their own settings without selecting an office; foreign offices and staff are denied', async t => {
    const { app, calls } = setup(t);
    await request(app).get('/integrations').expect(401);
    for (const who of ['staff', 'client']) {
        await request(app).get('/integrations').set('x-test-identity', who).expect(403);
        await request(app).put('/integrations/whatsapp').set('x-test-identity', who).send({ enabled: true }).expect(403);
    }
    await request(app).get(`/integrations?officeId=${B}`).set('x-test-identity', 'owner').expect(403);
    for (const path of ['/whatsapp', '/court']) {
        await request(app).put(`/integrations${path}?officeId=${B}`).set('x-test-identity', 'owner').send({ enabled: true }).expect(403);
    }
    const ownSettings = await request(app).get('/integrations/settings').set('x-test-identity', 'owner').expect(200);
    assert.equal(ownSettings.body.canConfigurePolicy, true);
    assert.deepEqual(calls.find(c => c.name === 'settingsSnapshot').scope, { mode: 'office', tenantId: A });
    await request(app).put('/integrations/whatsapp').set('x-test-identity', 'owner').send({ enabled: true }).expect(200);
    await request(app).put('/integrations/court').set('x-test-identity', 'owner').send({ enabled: true, syncTime: '08:00' }).expect(200);
    for (const name of ['saveWhatsapp', 'saveCourt']) {
        const ownWrite = calls.find(c => c.name === name);
        assert.equal(ownWrite.args[0], A); assert.equal(ownWrite.scope.tenantId, A);
    }
    await request(app).put(`/integrations/court?officeId=${B}`).set('x-test-identity', 'platform').send({ enabled: true, syncTime: '09:30' }).expect(200);
    assert.equal(calls.filter(c => c.name === 'saveCourt').at(-1).args[0], B);
    await request(app).post('/integrations/whatsapp/signup').set('x-test-identity', 'owner').expect(200);
    const signup = calls.find(c => c.name === 'startSignup');
    assert.deepEqual(signup.args, [A, 2]); assert.deepEqual(signup.scope, { mode: 'office', tenantId: A });
    await request(app).put(`/integrations/whatsapp?officeId=${B}`).set('x-test-identity', 'platform').send({ enabled: false }).expect(200);
    assert.equal(calls.filter(c => c.name === 'saveWhatsapp').at(-1).args[0], B);
    assert.equal(calls.filter(c => c.name === 'saveWhatsapp').at(-1).scope.tenantId, B);
    await request(app).get('/integrations').set('x-test-identity', 'platform').expect(400);
    await request(app).get('/integrations/settings').set('x-test-identity', 'platform').expect(400);
    await request(app).get('/integrations/cases/1').set('x-test-identity', 'client').expect(403);
});
test('dedicated office can share the product name but foreign office selectors are rejected', async t => {
    const { app, calls } = setup(t, { multiTenantMode: false });
    const offices = await request(app).get('/integrations/offices').set('x-test-identity', 'platform').expect(200);
    assert.deepEqual(offices.body.context.organization, { key: 'melamedia', name: 'MelaMedia' });
    assert.deepEqual(offices.body.context.project, { key: 'melamedlaw', name: 'MelamedLaw' });
    assert.deepEqual(offices.body.offices, [{ id: 'dedicated', name: 'MelamedLaw' }]);
    await request(app).get('/integrations/settings').set('x-test-identity', 'platform').expect(200);
    assert.equal(calls.find(c => c.name === 'settingsSnapshot').args[0], null);
    for (const officeId of [A, 'MelamedLaw', 'FitBase']) {
        await request(app).put('/integrations/whatsapp').query({ officeId }).set('x-test-identity', 'platform').send({ enabled: true }).expect(404);
    }
    assert.equal(calls.filter(c => c.name === 'saveWhatsapp').length, 0);
});

test('safety controls enforce owner/platform policy and the current office before dispatching an action', async t => {
    const { app, calls } = setup(t);
    for (const operation of ['pause', 'resume']) {
        const url = `/integrations/whatsapp/safety/${operation}`;
        await request(app).post(url).send({ acknowledged: true }).expect(401);
        for (const identity of ['staff', 'client'])
            await request(app).post(url).set('x-test-identity', identity).send({ acknowledged: true }).expect(403);
        await request(app).post(`${url}?officeId=${B}`).set('x-test-identity', 'owner').send({ acknowledged: true }).expect(403);
        assert.equal(calls.filter(c => c.name === 'pauseWhatsapp' || c.name === 'resumeWhatsapp').length, operation === 'pause' ? 0 : 2);
        await request(app).post(url).set('x-test-identity', 'owner').send({ acknowledged: true }).expect(200);
        await request(app).post(`${url}?officeId=${B}`).set('x-test-identity', 'platform').send({ acknowledged: true }).expect(200);
    }
    for (const name of ['pauseWhatsapp', 'resumeWhatsapp']) {
        const writes = calls.filter(c => c.name === name);
        assert.deepEqual(writes.map(c => c.args[0]), [A, B]);
        assert.deepEqual(writes.map(c => c.scope), [{ mode: 'office', tenantId: A }, { mode: 'office', tenantId: B }]);
    }
    assert.deepEqual(calls.find(c => c.name === 'resumeWhatsapp').args, [A, { acknowledged: true }]);
});

test('safety controls in dedicated deployments cannot select another office or silently add acknowledgement', async t => {
    const { app, calls } = setup(t, { multiTenantMode: false });
    for (const operation of ['pause', 'resume']) {
        await request(app).post(`/integrations/whatsapp/safety/${operation}?officeId=${A}`).set('x-test-identity', 'platform').expect(404);
        await request(app).post(`/integrations/whatsapp/safety/${operation}`).set('x-test-identity', 'platform').send({}).expect(200);
    }
    const pause = calls.find(c => c.name === 'pauseWhatsapp'), resume = calls.find(c => c.name === 'resumeWhatsapp');
    assert.deepEqual(pause.args, [null]); assert.deepEqual(resume.args, [null, {}]);
    assert.deepEqual(resume.scope, { mode: 'legacy', tenantId: '' });
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
test('signed QR history receipt persists status only in the matching office and never stores chat content', async t => {
    const { app, calls } = setup(t);
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '987654321', changes: [{ field: 'history', value: { metadata: { phone_number_id: '123456789' }, history: [{ metadata: { progress: 100 }, threads: [{ messages: [{ text: 'Private synthetic content' }] }] }] } }] }] });
    const signature = 'sha256=' + crypto.createHmac('sha256', 'test-signature-secret').update(payload).digest('hex');
    await request(app).post('/webhook').type('json').set('x-hub-signature-256', signature).send(payload).expect(200);
    const writes = calls.filter(c => c.name === 'query' && c.sql.startsWith('UPDATE'));
    assert.equal(writes.length, 1); assert.equal(writes[0].scope.tenantId, A);
    assert.deepEqual(writes[0].args, ['connection-a', '123456789', '987654321', '"complete"', A]);
    assert.ok(!JSON.stringify(calls).includes('Private synthetic content'));
});

test('linked device and permission routes retain owner scope, exact acknowledgement and private QR responses', async t => {
    const { app, calls } = setup(t);
    const actions = [
        ['post', '/whatsapp/linked-device/start', 'startLinkedDevice', { acknowledgeUnofficial: true, acknowledgePermissions: true }],
        ['get', '/whatsapp/linked-device/qr', 'linkedDeviceQr', null],
        ['post', '/whatsapp/linked-device/check', 'checkLinkedDevice', null],
        ['delete', '/whatsapp/linked-device', 'disconnectLinkedDevice', null],
        ['post', '/whatsapp/contacts/permission', 'setWhatsappContactPermission', { phone: '0501111111', allowed: false, evidence: 'Synthetic opt-out' }],
        ['post', '/whatsapp/groups/recheck', 'reviewWhatsappGroups', null],
    ];
    for (const [method, path, name, body] of actions) {
        const make = () => request(app)[method]('/integrations' + path);
        await make().expect(401);
        await make().set('x-test-identity', 'staff').expect(403);
        await make().set('x-test-identity', 'client').expect(403);
        await request(app)[method]('/integrations' + path + '?officeId=' + B).set('x-test-identity', 'owner').expect(403);
        let pending = make().set('x-test-identity', 'owner');
        if (body) pending = pending.send(body);
        const response = await pending.expect(200);
        const call = calls.filter(c => c.name === name).at(-1);
        assert.equal(call.args[0], A); assert.deepEqual(call.scope, { mode: 'office', tenantId: A });
        if (body) assert.deepEqual(call.args[1], body);
        if (name === 'setWhatsappContactPermission') assert.equal(call.args[2], 2);
        if (name === 'linkedDeviceQr' || name === 'startLinkedDevice' || name === 'checkLinkedDevice') assert.equal(response.headers['cache-control'], 'no-store');
    }
    await request(app).post('/integrations/whatsapp/linked-device/start').set('x-test-identity', 'owner').send({}).expect(200);
    assert.deepEqual(calls.filter(c => c.name === 'startLinkedDevice').at(-1).args, [A, {}], 'Route never manufactures acknowledgement');
});

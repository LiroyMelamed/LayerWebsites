'use strict';
// Actual Express routers and current permission/actor/error implementations.
// Authentication, signing policy, services and DB are trusted in-process fixtures.
// No application boot, converter, provider, OTP, real DB or external HTTP occurs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const request = require('supertest');
const requireFirmAction = require('../middlewares/requireFirmAction');
const { actorScope } = require('../services/signingV2/access');
const { runWithTenant } = require('../lib/tenant/tenantContext');
const createWordRouter = require('../routes/signingWordRoutes');
const { requestErrorReporter } = require('../services/signingV2/errorAlerts');
const errorHandler = require('../middlewares/errorHandler');
const { createAppError } = require('../utils/appError');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const RUN = '44444444-4444-4444-8444-444444444444';
const routePath = path.join(__dirname, '../routes/signingV2Routes.js');
const appPath = path.join(__dirname, '../app.js');
const routeSource = () => fs.readFileSync(routePath, 'utf8');
const appSource = () => fs.readFileSync(appPath, 'utf8');
const stageWrites = [
    ['post', '/cases/72/stage-automation/93/preview', 'preview'],
    ['put', '/cases/72/stage-automation/93', 'save'],
    ['post', `/cases/72/stage-automation/runs/${RUN}/retry`, 'retry'],
];

function fixture(t, { enabled = true, signingEnabled = true, wordError } = {}) {
    const restore = new Map();
    for (const [key, value] of Object.entries({ SIGNING_V2_ENABLED: String(enabled),
        SIGNING_DEPLOYMENT_KEY: 'synthetic-feature-entry-only', MULTI_TENANT_MODE: 'true',
        TENANT_DB_ISOLATION_ENABLED: '1', IS_PRODUCTION: 'true' })) {
        restore.set(key, process.env[key]); process.env[key] = value;
    }
    t.after(() => { for (const [key, value] of restore) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    } });
    const calls = [], queries = [], counts = { auth: 0, signingPolicy: 0 };
    const pool = { query: async (sql, values = []) => {
        queries.push({ sql, values });
        if (sql.startsWith('SELECT userid,role,law_firm_tenant_id,firm_staff_role_id FROM users'))
            return { rows: [{ userid: values[0], role: 'Staff', law_firm_tenant_id: values[0] === 8 ? B : A, firm_staff_role_id: 44 }] };
        if (sql.startsWith('INSERT INTO signing_owner_contexts')) return { rows: [{ id: CONTEXT }] };
        if (sql.startsWith('INSERT INTO signing_error_alerts')) return { rows: [], rowCount: 1 };
        throw Error('Unexpected fixture DB operation');
    } };
    const service = name => async (...args) => {
        calls.push({ name, args });
        if (name.startsWith('word.') && wordError) throw wordError;
        return name === 'read.submissions' ? { submissions: [] } : { ok: true };
    };
    const word = Object.fromEntries(['list', 'importSource', 'load', 'save', 'archive', 'preview', 'previewInfo', 'previewPdf']
        .map(name => [name, service('word.' + name)]));
    const stage = Object.fromEntries(['list', 'preview', 'save', 'retry'].map(name => [name, service('stage.' + name)]));
    const auth = (req, _res, next) => {
        counts.auth++;
        const identity = req.get('x-trusted-test-identity');
        if (!identity) return next(createAppError('UNAUTHORIZED', 401));
        const signing = identity === 'edit' ? ['view'] : identity === 'view' ? ['view'] : ['view', 'upload'];
        const cases = ['full', 'foreign', 'unvalidated'].includes(identity) || identity === 'edit' ? ['view', 'edit'] : ['view'];
        req.user = { UserId: identity === 'foreign' ? 8 : 7, Role: 'Staff' };
        req.firmPermissionContextValidated = identity !== 'unvalidated';
        req.firmPermissionMode = 'role'; req.firmStaffRoleId = 44;
        req.firmPermissions = { version: 7, areas: {
            signing: { visible: true, actions: signing, dataScope: 'assigned_only' },
            cases: { visible: true, actions: cases, dataScope: 'assigned_only' },
            clients: { visible: false, actions: [] },
        } };
        req.firmTenantId = A; req.tenant = { id: A };
        runWithTenant(req.tenant, next);
    };
    const signingPolicy = (_req, _res, next) => {
        counts.signingPolicy++;
        next(signingEnabled ? undefined : createAppError('SIGNING_DISABLED', 403));
    };
    const dependencies = {
        express, '../middlewares/authMiddleware': auth,
        '../middlewares/requireFirmAction': requireFirmAction,
        '../middlewares/requireSigningEnabled': { requireSigningEnabledForUser: signingPolicy },
        '../config/db': pool,
        '../services/signingV2/access': { actorScope },
        '../services/signingV2/management': { listSubmissions: service('read.submissions') },
        '../services/signingV2/runtime': { objectStorage: () => { throw Error('No storage allowed'); }, officeQuota: () => { throw Error('No quota side effect allowed'); } },
        '../services/signingV2/caseStageAutomation': stage,
        '../services/signingV2/errorAlerts': { requestErrorReporter },
        '../utils/appError': { createAppError },
        './signingWordRoutes': options => createWordRouter({ ...options, service: word, storage: {},
            convertDocxToPdf: () => { throw Error('No converter allowed'); } }),
    };
    const unusedServices = new Set(['actions', 'selections', 'bulkReview', 'bulkActions', 'creation', 'drafts',
        'caseContext', 'clientContext', 'authoring', 'participantDirectory', 'approvals', 'packageLifecycle',
        'replacement', 'contactChanges', 'authorities']);
    const module = { exports: {} };
    vm.runInNewContext(routeSource(), { module, exports: module.exports, process, Buffer, console,
        require: name => {
            if (Object.hasOwn(dependencies, name)) return dependencies[name];
            if (name.startsWith('../services/signingV2/') && unusedServices.has(name.split('/').pop())) return {};
            if (name === '../lib/signingV2/workbook') return {};
            throw Error('Unexpected router dependency: ' + name);
        } }, { filename: routePath });
    const app = express(); app.use(express.json());
    // Execute the current application's actual mount statement, without booting
    // unrelated application modules, jobs, databases or provider adapters.
    const mount = appSource().split('\n').find(line => line.includes("app.use('/api/signing-v2', require('./routes/signingV2Routes'))"));
    assert.ok(mount, 'current app must mount this exact protected feature router');
    vm.runInNewContext(mount, { app, require: name => {
        assert.equal(name, './routes/signingV2Routes'); return module.exports;
    } });
    app.use(errorHandler);
    return { app, pool, calls, queries, counts };
}

const hit = (app, method, url, identity = 'full', body = {}) => {
    const req = request(app)[method]('/api/signing-v2' + url);
    if (identity) req.set('x-trusted-test-identity', identity);
    return method === 'get' ? req : req.send(body);
};
const serviceCalls = f => f.calls.filter(row => !row.name.startsWith('read.'));

test('feature OFF returns Word and stage 404 before trusted identity, policy, actor or service execution', async t => {
    const f = fixture(t, { enabled: false });
    await hit(f.app, 'get', '/word', null).expect(404);
    await hit(f.app, 'get', '/cases/72/stage-automation').expect(404);
    for (const [method, url] of stageWrites) await hit(f.app, method, url).expect(404);
    assert.deepEqual(f.counts, { auth: 0, signingPolicy: 0 });
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
});

test('enabled Word and stage entries reject unauthenticated requests before policy and service execution', async t => {
    const f = fixture(t);
    await hit(f.app, 'get', '/word', null).expect(401);
    for (const [method, url] of stageWrites) await hit(f.app, method, url, null).expect(401);
    assert.equal(f.counts.signingPolicy, 0);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
});

test('incumbent signing policy rejection still fences both new feature families', async t => {
    const f = fixture(t, { signingEnabled: false });
    await hit(f.app, 'get', '/word').expect(403);
    await hit(f.app, 'put', stageWrites[1][1]).expect(403);
    assert.equal(f.counts.signingPolicy, 2);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
});

test('Word authoring requires upload permission and resolves the current trusted actor rather than body context', async t => {
    const f = fixture(t);
    await hit(f.app, 'get', '/word', 'view').expect(403);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
    await hit(f.app, 'post', '/word', 'upload', { contextId: B, userId: 999, tenantId: B }).expect(201);
    const call = f.calls[0]; assert.equal(call.name, 'word.importSource');
    assert.equal(call.args[0], f.pool);
    assert.equal(call.args[1].userId, 7); assert.equal(call.args[1].contextId, CONTEXT);
    assert.equal(call.args[1].tenantId, A); assert.equal(call.args[1].send, true);
    assert.deepEqual(f.queries.find(row => row.sql.startsWith('INSERT INTO signing_owner_contexts')).values.slice(1),
        ['synthetic-feature-entry-only', A, A]);
});

test('every stage mutation requires signing upload AND case edit before resolving an actor or executing service work', async t => {
    const f = fixture(t);
    for (const [method, url] of stageWrites)
        for (const identity of ['view', 'upload', 'edit']) await hit(f.app, method, url, identity).expect(403);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
    for (const [method, url, name] of stageWrites) {
        await hit(f.app, method, url, 'full', { caseId: 999, descriptionId: 999, contextId: B, expectedVersion: 4 }).expect(200);
        const call = f.calls.at(-1);
        assert.equal(call.name, 'stage.' + name); assert.equal(call.args[0], f.pool);
        assert.equal(call.args[1].contextId, CONTEXT); assert.equal(call.args[1].userId, 7);
        assert.equal(call.args[1].tenantId, A); assert.equal(call.args[2], '72');
        assert.equal(call.args[3], name === 'retry' ? RUN : '93');
    }
});

test('current actor tenant mismatch and unvalidated permission context deny both features despite trusted upload grants', async t => {
    const f = fixture(t);
    for (const identity of ['foreign', 'unvalidated']) {
        await hit(f.app, 'get', '/word', identity).expect(403);
        await hit(f.app, 'post', stageWrites[0][1], identity).expect(403);
    }
    assert.equal(serviceCalls(f).length, 0);
    assert.equal(f.queries.filter(row => row.sql.startsWith('INSERT INTO signing_owner_contexts')).length, 0);
});

test('ordinary read-only signing and stage listing retain view permission without new upload or case-edit requirements', async t => {
    const f = fixture(t);
    const response = await hit(f.app, 'get', '/submissions', 'view').expect(200);
    assert.deepEqual(response.body, { submissions: [] });
    assert.equal(response.headers['cache-control'], 'private, no-store');
    await hit(f.app, 'get', '/cases/72/stage-automation', 'view').expect(200);
    assert.equal(f.calls.at(-1).name, 'stage.list'); assert.equal(f.calls.at(-1).args[2], '72');
    await hit(f.app, 'get', '/word', 'view').expect(403);
    await hit(f.app, 'put', stageWrites[1][1], 'view').expect(403);
    assert.equal(f.calls.filter(row => row.name === 'read.submissions').length, 1);
});

test('Word HTTP operational errors still reach the real sanitized request reporter and central error response', async t => {
    const error = Object.assign(new Error('private synthetic converter stderr'), { name: 'WordTemplateError', code: 'WORD_CONVERSION_BUSY' });
    const f = fixture(t, { wordError: error });
    const response = await hit(f.app, 'post', '/word', 'upload', { secret: 'private synthetic body' }).expect(503);
    assert.equal(response.body.errorCode, 'WORD_CONVERSION_BUSY');
    assert.equal(response.body.messageKey, 'signingWord.requestFailed');
    assert.equal(response.body.details, undefined);
    const alert = f.queries.find(row => row.sql.startsWith('INSERT INTO signing_error_alerts'));
    assert.ok(alert, 'new subrouter errors must retain the incumbent office error reporter');
    assert.equal(alert.values[2], 'WORD_CONVERSION_BUSY');
    assert.match(alert.values[1], /^office:POST:/);
    assert.ok(!JSON.stringify(alert).includes('private synthetic'));
    assert.ok(!JSON.stringify(response.body).includes('converter stderr'));
});

test('normal permission denials are forwarded without generating operational error alerts', async t => {
    const f = fixture(t);
    const response = await hit(f.app, 'post', stageWrites[0][1], 'edit', { private: 'synthetic-only' }).expect(403);
    assert.equal(response.body.errorCode, 'FORBIDDEN');
    assert.equal(f.queries.some(row => row.sql.startsWith('INSERT INTO signing_error_alerts')), false);
});

test('actual app keeps linked raw-HMAC mount before the general JSON parser and retains billing consent routing', () => {
    const source = appSource();
    const linked = source.indexOf("app.use('/api/webhooks/whatsapp-linked', require('./routes/whatsappLinkedWebhookRoutes').createWhatsappLinkedWebhookRouter());");
    const json = source.indexOf('app.use(bodyParser.json({ limit: API_JSON_LIMIT }));');
    const consent = source.indexOf("app.use('/api/billing/system-message-consent', require('./routes/systemMessageConsentRoutes'));");
    assert.ok(linked >= 0 && json > linked, 'raw-body signature router must run before general JSON parsing');
    assert.ok(consent > json, 'the independent consent endpoint must remain mounted');
    const mounts = [], fakeApp = { use: (...args) => mounts.push(args) };
    const lines = source.split('\n').filter(line => line.includes("app.use('/api/webhooks/whatsapp-linked',")
        || line.includes("app.use('/api/billing/system-message-consent',"));
    const linkedRouter = express.Router(), consentRouter = express.Router();
    vm.runInNewContext(lines.join('\n'), { app: fakeApp, require: name => {
        if (name === './routes/whatsappLinkedWebhookRoutes') return { createWhatsappLinkedWebhookRouter: () => linkedRouter };
        if (name === './routes/systemMessageConsentRoutes') return consentRouter;
        throw Error('Unexpected app mount dependency');
    } });
    assert.equal(mounts.length, 2); assert.equal(mounts[0][1], linkedRouter); assert.equal(mounts[1][1], consentRouter);
    // Actual raw-HMAC request behavior is separately exercised by the existing
    // officeIntegrations.linkedWebhook.test.js source-bound integrated receipt.
});

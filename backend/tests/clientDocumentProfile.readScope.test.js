const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
// Optional equivalent installed toolchain for a filesystem-stalled workspace;
// only this test's JWT dependency changes resolution, never application code.
const testRequire = process.env.CLIENT_PROFILE_TEST_MODULE_ROOT
    ? createRequire(path.join(process.env.CLIENT_PROFILE_TEST_MODULE_ROOT, 'package.json')) : require;
const jwt = testRequire('jsonwebtoken');
const { normalizeClientProfile } = require('../utils/clientProfile');
const root = path.resolve(__dirname, '..');
const secret = 'client-profile-local-test-only-no-production-credential';
const tenantA = '00000000-0000-0000-0000-000000000001';
const tenantB = '00000000-0000-0000-0000-000000000002';
const profile = normalizeClientProfile({ identity: { number: '001234567' } });

function fixture(actorPatch = {}, targetPatch = {}, { billingStatus = 0 } = {}) {
    const actor = { userid: 7, role: 'Admin', law_firm_tenant_id: tenantA, ...actorPatch };
    const target = { userid: 42, role: 'User', name: 'Synthetic customer', law_firm_tenant_id: tenantA,
        email: 'legacy invalid email', phonenumber: '0', client_profile: profile, ...targetPatch };
    const calls = [], billingChecks = [];
    const pool = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (/WHERE userid=\$1\s+AND law_firm_tenant_id/.test(sql)) {
            return { rows: params[0] === target.userid && params[1] === target.law_firm_tenant_id
                && !['Admin', 'Deleted'].includes(target.role) ? [target] : [] };
        }
        if (sql.includes('UPDATE users')) {
            const allowed = params[5] === target.userid && params[9] === target.law_firm_tenant_id
                && !['Admin', 'Deleted'].includes(target.role) && params[10] === target.phonenumber
                && params[11] === target.email && params[12] === target.role;
            if (!allowed) return { rows: [], rowCount: 0 };
            Object.assign(target, { name: params[0], email: params[1], phonenumber: params[2] });
            return { rows: [target], rowCount: 1 };
        }
        return { rows: [actor] };
    } };
    const load = (relative, overrides = {}) => {
        const filename = path.join(root, relative), module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, console: { error() {}, warn() {} }, Date, Buffer,
            process: { env: { JWT_SECRET: secret } }, require(id) {
                if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id];
                if (id === '../config/db') return pool;
                if (relative === 'controllers/customerController.js') {
                    if (['../utils/clientProfile', '../utils/paramValidation', '../utils/phoneUtils'].includes(id)) return require(path.resolve(path.dirname(filename), id));
                    return {};
                }
                return id.startsWith('.') ? require(path.resolve(path.dirname(filename), id)) : require(id);
            },
        });
        return module.exports;
    };
    const attach = load('middlewares/attachFirmPermissions.js');
    const auth = load('middlewares/authMiddleware.js', { './attachFirmPermissions': attach, jsonwebtoken: jwt,
        dotenv: { config() {} }, '../utils/rateLimiter': { consume: () => ({ allowed: true }) },
        '../lib/officeRole': { applyLegacyOfficeRole() {} },
        // Tenant status is a fixture too: importing the real service would
        // initialize config/db and load an application .env during this unit test.
        '../lib/tenant/tenantService': { getTenantById: async id => ({
            id, slug: 'fixture-office', isActive: true, ownerUserId: actor.userid,
        }) },
        // Billing behavior has its own suite. Keep the current auth boundary in
        // this route fixture without contacting a real billing database.
        './requireBillingAccess': { requireBillingAccess: (req, _res, next) => {
            billingChecks.push(req.firmTenantId);
            return next(billingStatus ? { httpStatus: billingStatus, errorCode: 'TEST_BILLING_BLOCKED' } : undefined);
        } } });
    const controller = load('controllers/customerController.js');
    const routes = [];
    const router = {};
    for (const method of ['get', 'post', 'put', 'delete']) router[method] = (route, ...handlers) => routes.push({ method, route, handlers });
    const multer = () => ({ single: () => (_req, _res, next) => next() });
    multer.memoryStorage = () => ({});
    load('routes/customerRoutes.js', { express: { Router: () => router }, multer,
        '../controllers/customerController': controller, '../middlewares/authMiddleware': auth });
    const token = jwt.sign({ userid: actor.userid, role: actor.role }, secret, { algorithm: 'HS256', expiresIn: 60 });
    const dispatch = async (method, id = '42', options = {}) => {
        const routeName = method === 'get' ? 'GetCustomer' : 'UpdateCustomer';
        const handlers = routes.find(route => route.method === method && route.route === `/${routeName}/:customerId`).handlers;
        const req = { method: method.toUpperCase(), url: `/${routeName}/${id}`, originalUrl: `/api/Customers/${routeName}/${id}`,
            params: { customerId: id }, query: options.query || {}, body: options.body || {},
            headers: options.token ? { authorization: `Bearer ${options.token}` } : {} };
        const response = { status: 200, headers: {} };
        await new Promise((resolve, reject) => {
            let index = 0;
            const res = { status(value) { response.status = value; return this; },
                setHeader(key, value) { response.headers[key.toLowerCase()] = value; },
                json(body) { response.body = JSON.parse(JSON.stringify(body)); resolve(); return this; } };
            const next = error => {
                if (error) { res.status(error.httpStatus || 500).json({ code: error.errorCode || error.code }); return; }
                const handler = handlers[index++];
                if (!handler) { reject(new Error('Route did not send a response')); return; }
                try { Promise.resolve(handler(req, res, next)).catch(reject); } catch (failure) { reject(failure); }
            };
            next();
        });
        return response;
    };
    return { read: (id, options) => dispatch('get', id, options), update: (id, options) => dispatch('put', id, options),
        token, calls, billingChecks, target };
}

test('exact customer read rejects missing authentication before DB lookup', async () => {
    const f = fixture(); const response = await f.read();
    assert.equal(response.status, 401); assert.equal(f.calls.length, 0);
});
test('customer identity cannot invoke the office clients-view endpoint', async () => {
    const f = fixture({ role: 'User' });
    const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 403); assert.equal(f.calls.length, 1);
});
test('same-tenant authorized read returns exact profile and no-store cache policy', async () => {
    const f = fixture(); const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 200); assert.deepEqual(response.body.ClientProfile, profile);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(Array.from(f.calls.at(-1).params), [42, tenantA]);
});
test('cross-tenant target is absent even when query/body attempts a tenant override', async () => {
    const f = fixture({}, { law_firm_tenant_id: tenantB });
    const response = await f.read('42', { token: f.token, query: { tenantId: tenantB }, body: { firmTenantId: tenantB } });
    assert.equal(response.status, 404); assert.equal(response.body.ClientProfile, undefined);
    assert.equal(f.calls.at(-1).params[1], tenantA);
});
test('dedicated null-tenant admin cannot read a shared tenant customer', async () => {
    const f = fixture({ law_firm_tenant_id: null });
    const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 404); assert.equal(f.calls.at(-1).params[1], null);
});
test('role-mode staff without clients view is denied before exact-data query', async () => {
    const f = fixture({ role: 'Staff', firm_staff_role_id: 8, role_id: 8, role_is_active: true,
        role_tenant_id: tenantA, role_permissions: { version: 7, areas: { clients: { visible: true, actions: [] } } } });
    const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 403); assert.equal(f.calls.length, 1);
});
test('role-mode clients viewer can read only its tenant profile', async () => {
    const f = fixture({ role: 'Staff', firm_staff_role_id: 8, role_id: 8, role_is_active: true,
        role_tenant_id: tenantA, role_permissions: { version: 7, areas: { clients: { visible: true, actions: ['view'] } } } });
    const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 200);
});
for (const role of ['Admin', 'Deleted']) test(`exact customer read does not expose ${role} target profile`, async () => {
    const f = fixture({}, { role });
    const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 404);
});
test('invalid exact ID is rejected before target-data lookup', async () => {
    const f = fixture(); const response = await f.read('0', { token: f.token });
    assert.equal(response.status, 422); assert.equal(f.calls.length, 1);
});


test('the exact profile route honors a billing rejection before any target-data lookup', async () => {
    const f = fixture({}, {}, { billingStatus: 503 });
    const response = await f.read('42', { token: f.token });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'TEST_BILLING_BLOCKED');
    assert.deepEqual(f.billingChecks, [tenantA]);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls.some(call => call.sql.includes('WHERE userid=$1 AND law_firm_tenant_id')), false);
});

const legacyEdit = { name: 'Updated profile', phoneNumber: '0', email: 'legacy invalid email',
    clientProfile: { identity: { type: 'passport', number: '000321-A', country: 'UK' } } };

test('same-tenant admin can preserve an exact legacy contact snapshot through the actual edit route', async () => {
    const f = fixture({}, { role: 'ExternalSigner' });
    const response = await f.update('42', { token: f.token, body: legacyEdit });
    assert.equal(response.status, 200); assert.equal(f.target.role, 'ExternalSigner');
    assert.equal(f.target.phonenumber, '0'); assert.equal(f.target.email, 'legacy invalid email');
    assert.deepEqual(Array.from(f.calls.at(-1).params).slice(9), [tenantA, '0', 'legacy invalid email', 'ExternalSigner']);
});

test('another tenant actor cannot borrow legacy contact values or a body tenant override to edit the target', async () => {
    const f = fixture({ userid: 8, law_firm_tenant_id: tenantB });
    const response = await f.update('42', { token: f.token, body: { ...legacyEdit, firmTenantId: tenantA } });
    assert.equal(response.status, 404); assert.equal(response.body.ClientProfile, undefined);
    assert.equal(f.calls.at(-1).params[1], tenantB);
    assert.equal(f.calls.some(call => call.sql.includes('UPDATE users')), false);
    assert.equal(f.target.name, 'Synthetic customer');
});

test('a clients viewer cannot use the legacy preservation exception to acquire edit permission', async () => {
    const f = fixture({ role: 'Staff', firm_staff_role_id: 8, role_id: 8, role_is_active: true,
        role_tenant_id: tenantA, role_permissions: { version: 7, areas: { clients: { visible: true, actions: ['view'] } } } });
    const response = await f.update('42', { token: f.token, body: legacyEdit });
    assert.equal(response.status, 403); assert.equal(f.calls.length, 1);
});

for (const role of ['Admin', 'Deleted']) test(`edit route still excludes ${role} target when contacts match`, async () => {
    const f = fixture({}, { role });
    const response = await f.update('42', { token: f.token, body: legacyEdit });
    assert.equal(response.status, 404); assert.equal(f.calls.some(call => call.sql.includes('UPDATE users')), false);
});

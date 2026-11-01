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

function fixture(actorPatch = {}, targetPatch = {}) {
    const actor = { userid: 7, role: 'Admin', law_firm_tenant_id: tenantA, ...actorPatch };
    const target = { userid: 42, role: 'User', name: 'Synthetic customer', law_firm_tenant_id: tenantA,
        client_profile: profile, ...targetPatch };
    const calls = [];
    const pool = { query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('WHERE userid=$1 AND law_firm_tenant_id')) {
            return { rows: params[0] === target.userid && params[1] === target.law_firm_tenant_id
                && !['Admin', 'Deleted'].includes(target.role) ? [target] : [] };
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
                    if (id === '../utils/clientProfile' || id === '../utils/paramValidation') return require(path.resolve(path.dirname(filename), id));
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
        '../lib/officeRole': { applyLegacyOfficeRole() {} } });
    const controller = load('controllers/customerController.js');
    const routes = [];
    const router = {};
    for (const method of ['get', 'post', 'put', 'delete']) router[method] = (route, ...handlers) => routes.push({ method, route, handlers });
    const multer = () => ({ single: () => (_req, _res, next) => next() });
    multer.memoryStorage = () => ({});
    load('routes/customerRoutes.js', { express: { Router: () => router }, multer,
        '../controllers/customerController': controller, '../middlewares/authMiddleware': auth });
    const handlers = routes.find(route => route.method === 'get' && route.route === '/GetCustomer/:customerId').handlers;
    const token = jwt.sign({ userid: 7, role: actor.role }, secret, { algorithm: 'HS256', expiresIn: 60 });
    const read = async (id = '42', options = {}) => {
        const req = { method: 'GET', url: `/GetCustomer/${id}`, originalUrl: `/api/Customers/GetCustomer/${id}`,
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
    return { read, token, calls };
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

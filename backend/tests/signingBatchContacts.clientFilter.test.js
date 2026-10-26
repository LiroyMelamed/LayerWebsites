'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const testRequire = process.env.CONTACTS_TEST_MODULE_ROOT
    ? createRequire(path.join(process.env.CONTACTS_TEST_MODULE_ROOT, 'package.json')) : require;
const { PGlite } = testRequire('@electric-sql/pglite');
const tenantA = '00000000-0000-0000-0000-000000000001';
const tenantB = '00000000-0000-0000-0000-000000000002';

async function fixture(t) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`CREATE TABLE users (
        userid serial PRIMARY KEY, name text, email text, phonenumber text,
        role text, law_firm_tenant_id uuid
    )`);
    const roles = ['User', 'Client', 'Staff', 'Admin', 'Lawyer', 'ExternalSigner', 'Deleted'];
    for (const tenant of [tenantA, tenantB, null]) {
        for (const role of roles) {
            await db.query('INSERT INTO users(name,email,phonenumber,role,law_firm_tenant_id) VALUES($1,$2,$3,$4,$5)',
                [`Synthetic ${role}`, `${role}@example.invalid`, '0000000000', role, tenant]);
        }
    }
    const routes = [], middleware = [], calls = [];
    const router = { use: (...handlers) => middleware.push(handlers) };
    for (const method of ['get', 'post']) router[method] = (route, ...handlers) => routes.push({ method, route, handlers });
    const pass = (_req, _res, next) => next();
    const auth = pass, signingGate = () => {};
    const realRequireFirmAction = require('../middlewares/requireFirmAction');
    const overrides = {
        express: { Router: () => router },
        '../middlewares/authMiddleware': auth,
        '../middlewares/requireSigningEnabled': { requireSigningEnabledForUser: signingGate },
        '../middlewares/requireFirmAction': realRequireFirmAction,
        '../config/db': { query: async (sql, params) => {
            calls.push({ sql, params: Array.from(params) });
            return db.query(sql, Array.from(params));
        } },
        '../services/signingTemplateService': { actorScope: async req => ({ tenantId: req.firmTenantId }) },
        '../middlewares/publicOfficeScope': { signingPackage: pass, signingBatch: pass },
        '../services/signingPackageCompletion': { downloadPackage: pass },
    };
    const filename = require.resolve('../routes/signingBatchRoutes');
    const module = { exports: {} };
    vm.compileFunction(fs.readFileSync(filename, 'utf8'), ['require', 'module', 'exports'])
        (id => Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : {}, module, module.exports);
    assert.ok(middleware.some(handlers => handlers[0] === auth && handlers[1] === signingGate),
        'The contacts route remains behind the incumbent authentication and signing gates');
    const handlers = routes.find(route => route.method === 'get' && route.route === '/contacts').handlers;
    async function lookup(query = {}, options = {}) {
        const req = { query, firmTenantId: tenantA, user: { Role: 'Admin' }, ...options };
        let response;
        await new Promise((resolve, reject) => {
            let index = 0;
            const res = { json(body) { response = body; resolve(); return this; } };
            const next = error => {
                if (error) return reject(error);
                const handler = handlers[index++];
                if (!handler) return reject(new Error('Contact lookup did not return a response'));
                try { Promise.resolve(handler(req, res, next)).catch(reject); } catch (failure) { reject(failure); }
            };
            next();
        });
        return response.contacts;
    }
    return { db, calls, lookup };
}

test('client-only contacts include normal User and legacy Client while excluding office and external identities', async t => {
    const f = await fixture(t);
    const clients = await f.lookup({ clients: '1' });
    assert.deepEqual(clients.map(person => person.role).sort(), ['Client', 'User']);
    assert.equal(clients.length, 2, 'Equal names in another tenant and dedicated scope cannot leak');
    assert.deepEqual(f.calls[0].params, [tenantA, '%%', false, true]);
    assert.ok(clients.every(person => Object.keys(person).sort().join(',') === 'email,name,phone,role,userId'));
});

test('all-people lookup preserves staff, admins, lawyers and external signers; lawyer-only scope is unchanged', async t => {
    const f = await fixture(t);
    const people = await f.lookup();
    assert.deepEqual(people.map(person => person.role).sort(), ['Admin', 'Client', 'ExternalSigner', 'Lawyer', 'Staff', 'User']);
    assert.deepEqual((await f.lookup({ lawyer: '1' })).map(person => person.role).sort(), ['Admin', 'Lawyer']);
    assert.deepEqual((await f.lookup({ lawyer: '1', clients: '1' })).map(person => person.role).sort(),
        ['Admin', 'Client', 'Lawyer', 'User']);
});

test('authenticated tenant scope remains mandatory for null, same and foreign tenants', async t => {
    const f = await fixture(t);
    const a = await f.lookup({ clients: '1', tenantId: tenantB }, { body: { tenantId: tenantB } });
    const b = await f.lookup({ clients: '1' }, { firmTenantId: tenantB });
    const dedicated = await f.lookup({ clients: '1' }, { firmTenantId: null });
    const ids = lists => new Set(lists.flat().map(person => person.userId));
    assert.equal(ids([a, b, dedicated]).size, 6);
    assert.equal(a.length, 2); assert.equal(b.length, 2); assert.equal(dedicated.length, 2);
    assert.deepEqual(f.calls.map(call => call.params[0]), [tenantA, tenantB, null]);
    const before = f.calls.length;
    await assert.rejects(f.lookup({ clients: '1' }, { user: { Role: 'User' } }), error => error.httpStatus === 403);
    await assert.rejects(f.lookup({ clients: '1' }, { user: { Role: 'Staff' } }), error => error.httpStatus === 403);
    assert.equal(f.calls.length, before, 'Denied upload permission must never query contacts');
});

test('bounded parameterized search escapes wildcard input, truncates at 100 and retains the 30-result limit', async t => {
    const f = await fixture(t);
    const literal = 'Literal%_\\name';
    await f.db.query('INSERT INTO users(name,role,law_firm_tenant_id) VALUES($1,$2,$3)', [literal, 'User', tenantA]);
    const found = await f.lookup({ q: '  literal%_\\name  ', clients: '1' });
    assert.equal(found.length, 1); assert.equal(found[0].name, literal);
    assert.equal(f.calls.at(-1).params[1], '%literal\\%\\_\\\\name%');
    const hostile = "' OR true -- " + 'z'.repeat(120);
    assert.equal((await f.lookup({ q: hostile, clients: '1' })).length, 0);
    assert.equal(f.calls.at(-1).params[1], `%${hostile.slice(0, 100)}%`);
    assert.ok(!f.calls.at(-1).sql.includes(hostile));
    for (let i = 0; i < 40; i += 1) await f.db.query(
        'INSERT INTO users(name,role,law_firm_tenant_id) VALUES($1,$2,$3)', [`Bounded ${String(i).padStart(2, '0')}`, 'User', tenantA]);
    const bounded = await f.lookup({ q: 'Bounded', clients: '1' });
    assert.equal(bounded.length, 30);
    assert.equal(bounded[0].name, 'Bounded 00'); assert.equal(bounded[29].name, 'Bounded 29');
});

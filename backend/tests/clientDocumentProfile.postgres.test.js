// Explicit opt-in isolated PostgreSQL only; never inherits the application's DB_*.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Client } = require('pg');
const { normalizeClientProfile } = require('../utils/clientProfile');

const socket = process.env.CLIENT_PROFILE_TEST_SOCKET;
const optedIn = ['/tmp/codex-client-profile-55487', '/tmp/codex-client-profile-55488'].includes(socket);
test('client profile migration and controller persist on isolated PostgreSQL', { skip: !optedIn }, async t => {
    const db = new Client({ host: socket, port: socket?.endsWith('55488') ? 55488 : 55487, user: 'client_profile_test_owner', database: 'postgres' });
    await db.connect();
    t.after(() => db.end());
    assert.equal((await db.query('SELECT current_user AS name')).rows[0].name, 'client_profile_test_owner');
    // Minimal legacy users table: no production/customer data or full app schema.
    await db.query(`CREATE TABLE users (
        userid serial PRIMARY KEY, name text, email text, phonenumber text,
        passwordhash text, role text, companyname text, dateofbirth date,
        profilepicurl text, createdat timestamptz,
        law_firm_tenant_id uuid DEFAULT nullif(current_setting('client_profile_test.tenant_id', true), '')::uuid
    )`);
    await db.query(`INSERT INTO users(name,email,role,companyname) VALUES ('Legacy contact','legacy@example.invalid','User','Legacy Company')`);
    const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/2026-10-23_00_client_document_profile.sql'), 'utf8');
    await t.test('additive migration applies twice, preserving legacy columns and using empty profile default', async () => {
        await db.query(sql); await db.query(sql);
        const row = (await db.query('SELECT * FROM users WHERE userid=1')).rows[0];
        assert.equal(row.companyname, 'Legacy Company');
        assert.deepEqual(row.client_profile, {});
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_client_profile_bounded_object'`)).rows[0].n, 1);
    });
    await t.test('database rejects nonobject and oversized raw JSON even outside the API', async () => {
        await assert.rejects(db.query(`UPDATE users SET client_profile='[]'::jsonb WHERE userid=1`), { code: '23514' });
        await assert.rejects(db.query('UPDATE users SET client_profile=$1::jsonb WHERE userid=1', [JSON.stringify({ huge: 'A'.repeat(8192) })]), { code: '23514' });
    });
    const notifications = [];
    const filename = path.resolve(__dirname, '../controllers/customerController.js');
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, console: { error() {}, warn() {} }, Date, Buffer,
        require(id) {
            if (id === '../config/db') return db;
            if (id === '../utils/clientProfile') return require(id);
            if (id === '../utils/phoneUtils') return { formatPhoneNumber: value => value || null };
            if (id === '../utils/paramValidation') return { requireInt: req => Number(req.params.customerId) };
            if (id === '../utils/pagination') return { getPagination: () => ({ enabled: false }) };
            if (id === '../utils/sendMessage') return { getWebsiteDomain: async () => 'example.invalid' };
            if (id === '../lib/firmBranding') return { getLawFirmNameHe: async () => 'Synthetic local firm' };
            if (id === '../services/settingsService') return { getSetting: async (_section, _key, fallback) => fallback };
            if (id === '../utils/templateRenderer') return { renderTemplate: value => value };
            if (id === '../services/notifications/notificationOrchestrator') return { notifyRecipient: async value => notifications.push(value) };
            return {};
        },
    });
    const controller = module.exports;
    const profile = normalizeClientProfile({ partyType: 'organization', identity: { type: 'passport', number: '000ABC123', country: 'UK' },
        organization: { registrationType: 'company', registrationNumber: '005123456', registrationCountry: 'ישראל' },
        address: { line1: 'شارع الاختبار 5', city: 'תל אביב', postalCode: '0012345', country: 'ישראל' } });
    async function call(method, body = {}, id = 1, tenantId = null) {
        const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
            status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
        await controller[method]({ body, query: {}, params: { customerId: String(id) }, user: { UserId: id }, firmTenantId: tenantId }, response);
        return response;
    }
    let id;
    await t.test('actual controller create/readback keeps personal and entity IDs separate with all zeroes', async () => {
        const result = await call('addCustomer', { name: 'أحمد', email: 'local-profile@example.invalid', companyName: 'חברה סינתטית', clientProfile: profile });
        assert.equal(result.statusCode, 201);
        id = result.body.UserId;
        const stored = (await db.query('SELECT * FROM users WHERE userid=$1', [id])).rows[0];
        assert.deepEqual(stored.client_profile, profile);
        assert.equal(stored.companyname, 'חברה סינתטית');
        assert.equal(stored.name, 'أحمد');
        assert.equal(notifications.length, 1);
        const current = await call('getCurrentCustomer', {}, id);
        assert.deepEqual(current.body.ClientProfile, profile);
    });
    await t.test('actual controller legacy update preserves and explicit reset clears the profile', async () => {
        const legacy = await call('updateCustomerById', { name: 'New contact name', email: 'local-profile@example.invalid', companyName: 'חברה סינתטית' }, id);
        assert.equal(legacy.statusCode, 200);
        assert.deepEqual(legacy.body.ClientProfile, profile);
        const reset = await call('updateCustomerById', { name: 'New contact name', email: 'local-profile@example.invalid', clientProfile: null }, id);
        assert.equal(reset.statusCode, 200);
        assert.equal((await db.query('SELECT client_profile FROM users WHERE userid=$1', [id])).rows[0].client_profile.identity.number, '');
        assert.equal(notifications.length, 1);
    });
    await t.test('actual current-profile update persists identifiers under authenticated user only', async () => {
        const result = await call('updateCurrentCustomer', { UserId: 1, Name: 'Contact', Email: 'local-profile@example.invalid', CompanyName: 'Synthetic company', ClientProfile: profile }, id);
        assert.equal(result.statusCode, 200);
        assert.deepEqual((await db.query('SELECT client_profile FROM users WHERE userid=$1', [id])).rows[0].client_profile, profile);
        assert.deepEqual((await db.query('SELECT client_profile FROM users WHERE userid=1')).rows[0].client_profile, {});
    });
    const tenantA = '00000000-0000-0000-0000-000000000001';
    const tenantB = '00000000-0000-0000-0000-000000000002';
    let idA, idB;
    await t.test('creates profiles under trusted tenant only, ignoring client-supplied tenant overrides', async () => {
        const a = await call('addCustomer', { name: 'Contact A', email: 'same-contact@example.invalid', companyName: 'Tenant A Ltd', clientProfile: profile,
            firmTenantId: tenantB, law_firm_tenant_id: tenantB }, 1, tenantA);
        const b = await call('addCustomer', { name: 'Contact B', email: 'same-contact@example.invalid', companyName: 'Tenant B Ltd', clientProfile: profile }, 1, tenantB);
        assert.equal(a.statusCode, 201); assert.equal(b.statusCode, 201);
        idA = a.body.UserId; idB = b.body.UserId;
        assert.equal((await db.query('SELECT law_firm_tenant_id FROM users WHERE userid=$1', [idA])).rows[0].law_firm_tenant_id, tenantA);
        assert.equal((await db.query('SELECT law_firm_tenant_id FROM users WHERE userid=$1', [idB])).rows[0].law_firm_tenant_id, tenantB);
    });
    await t.test('duplicate contacts resolve within the trusted tenant and never include profile identifiers', async () => {
        const duplicate = await call('addCustomer', { name: 'Attempted duplicate', email: 'same-contact@example.invalid', clientProfile: null }, 1, tenantA);
        assert.equal(duplicate.statusCode, 409); assert.equal(duplicate.body.UserId, idA);
        assert.equal(duplicate.body.ClientProfile, undefined);
        const dedicated = await call('addCustomer', { name: 'Dedicated contact', email: 'same-contact@example.invalid', clientProfile: null }, 1, null);
        assert.equal(dedicated.statusCode, 201);
        assert.equal((await db.query('SELECT law_firm_tenant_id FROM users WHERE userid=$1', [dedicated.body.UserId])).rows[0].law_firm_tenant_id, null);
    });
    await t.test('exact profile reads reject cross-tenant and shared-to-dedicated access', async () => {
        const own = await call('getCustomerById', {}, idA, tenantA);
        assert.equal(own.statusCode, 200); assert.deepEqual(own.body.ClientProfile, profile);
        assert.equal((await call('getCustomerById', {}, idB, tenantA)).statusCode, 404);
        assert.equal((await call('getCustomerById', {}, idA, null)).statusCode, 404);
    });
    await t.test('profile-bearing and contact-only updates cannot mutate another tenant or return its identifiers', async () => {
        const body = { name: 'Changed by tenant A', email: 'same-contact@example.invalid', companyName: 'Tenant A Ltd', clientProfile: profile, firmTenantId: tenantB };
        const foreign = await call('updateCustomerById', body, idB, tenantA);
        assert.equal(foreign.statusCode, 404); assert.equal(foreign.body.ClientProfile, undefined);
        const foreignContact = await call('updateCustomerById', { name: 'Contact-only foreign edit', email: 'other@example.invalid' }, idB, tenantA);
        assert.equal(foreignContact.statusCode, 404);
        assert.equal((await db.query('SELECT name FROM users WHERE userid=$1', [idB])).rows[0].name, 'Contact B');
        const own = await call('updateCustomerById', { ...body, email: 'updated-a@example.invalid' }, idA, tenantA);
        assert.equal(own.statusCode, 200); assert.deepEqual(own.body.ClientProfile, profile);
    });
    await t.test('the additive column respects an existing synthetic tenant RLS policy and role grants', async () => {
        // This verifies PostgreSQL column/RLS behavior only, not deployed tenant middleware.
        await db.query(`CREATE ROLE client_profile_scoped NOLOGIN NOSUPERUSER NOBYPASSRLS;
            GRANT USAGE ON SCHEMA public TO client_profile_scoped;
            GRANT SELECT,UPDATE ON users TO client_profile_scoped;
            ALTER TABLE users ENABLE ROW LEVEL SECURITY;
            ALTER TABLE users FORCE ROW LEVEL SECURITY;
            CREATE POLICY synthetic_client_profile_tenant ON users
                USING (law_firm_tenant_id = nullif(current_setting('client_profile_test.tenant_id',true),'')::uuid)
                WITH CHECK (law_firm_tenant_id = nullif(current_setting('client_profile_test.tenant_id',true),'')::uuid);`);
        await db.query("UPDATE users SET law_firm_tenant_id='00000000-0000-0000-0000-000000000001' WHERE userid=$1", [id]);
        await db.query("UPDATE users SET law_firm_tenant_id='00000000-0000-0000-0000-000000000002' WHERE userid=1");
        await db.query('SET ROLE client_profile_scoped');
        await db.query("SELECT set_config('client_profile_test.tenant_id','00000000-0000-0000-0000-000000000001',false)");
        assert.deepEqual((await db.query('SELECT userid FROM users WHERE userid IN (1,$1)', [id])).rows.map(row => row.userid), [id]);
        assert.equal((await db.query('UPDATE users SET client_profile=$1::jsonb WHERE userid=1', [JSON.stringify(profile)])).rowCount, 0);
        assert.equal((await db.query('UPDATE users SET client_profile=$1::jsonb WHERE userid=$2', [JSON.stringify(profile), id])).rowCount, 1);
        await db.query('RESET ROLE');
        await db.query('REVOKE UPDATE ON users FROM client_profile_scoped');
        await db.query('SET ROLE client_profile_scoped');
        await assert.rejects(db.query('UPDATE users SET client_profile=$1::jsonb WHERE userid=$2', [JSON.stringify(profile), id]), { code: '42501' });
        await db.query('RESET ROLE');
    });
});

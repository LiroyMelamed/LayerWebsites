const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeClientProfile, clientProfilePatch } = require('../utils/clientProfile');

const profile = () => ({ version: 1, partyType: 'organization',
    identity: { type: 'passport', number: '000123-A', country: 'United Kingdom' },
    organization: { registrationType: 'company', registrationNumber: '005123456', registrationCountry: 'ישראל' },
    address: { line1: 'شارع الاختبار 5', line2: 'קומה 2', city: 'תל אביב', postalCode: '0012345', country: 'ישראל' } });

test('human identity and organization registration retain independent values and leading zeroes', () => {
    const actual = normalizeClientProfile(profile());
    assert.equal(actual.identity.number, '000123-A');
    assert.equal(actual.organization.registrationNumber, '005123456');
    assert.equal(actual.address.postalCode, '0012345');
    assert.equal(actual.address.line1, 'شارع الاختبار 5');
    assert.equal(actual.organization.name, undefined);
});

test('legacy omission is distinct from explicit null reset; defaults do not invent nationality', () => {
    assert.deepEqual(clientProfilePatch({}), { present: false, value: null });
    const reset = clientProfilePatch({ clientProfile: null });
    assert.equal(reset.present, true);
    assert.equal(reset.value.partyType, 'person');
    assert.equal(reset.value.identity.country, '');
    assert.deepEqual(clientProfilePatch({ ClientProfile: profile() }).value, normalizeClientProfile(profile()));
});

const invalidValues = [
    ['numeric ID', { identity: { number: 123 } }],
    ['oversized ID', { identity: { number: 'A'.repeat(41) } }],
    ['oversized address', { address: { line1: 'A'.repeat(251) } }],
    ['array instead of object', []],
    ['new version', { version: 2 }],
    ['unknown property', { administrator: true }],
    ['unsupported capacity', { partyType: 'attorney' }],
    ['line break in identity', { identity: { number: '01\n02' } }],
    ['bidi override in identity', { identity: { number: '01\u202e02' } }],
    ['organization name duplicate', { organization: { name: 'Duplicate' } }],
];
for (const [label, value] of invalidValues) test(`reject ${label} without exposing its value`, () => {
    assert.throws(() => normalizeClientProfile(value), error => error.code === 'INVALID_CLIENT_PROFILE'
        && error.httpStatus === 400 && error.message === 'Invalid client profile' && typeof error.field === 'string');
});
test('conflicting request spellings are rejected instead of losing data', () => {
    assert.throws(() => clientProfilePatch({ clientProfile: null, ClientProfile: profile() }), { code: 'INVALID_CLIENT_PROFILE' });
});

function harness(initial = {}) {
    let stored = { userid: 42, name: 'Test contact', email: 'contact@example.invalid', phonenumber: null,
        companyname: 'Test Ltd', role: 'ExternalSigner', ...initial };
    const calls = [], notifications = [];
    const pool = { async query(sql, params = []) {
        calls.push({ sql, params });
        if (/SELECT.*FROM users\s+WHERE LOWER\(email\)/s.test(sql) || sql.includes('regexp_replace(phonenumber')) return { rows: [] };
        if (sql.includes('INSERT INTO users')) {
            stored = { ...stored, name: params[0], email: params[1], phonenumber: params[2], role: params[4],
                companyname: params[5], dateofbirth: params[6], client_profile: JSON.parse(params[8]) };
            return { rows: [stored], rowCount: 1 };
        }
        if (sql.includes('UPDATE users') && sql.includes('client_profile = CASE')) {
            stored = { ...stored, name: params[0], email: params[1], phonenumber: params[2], companyname: params[3] };
            if (params[7]) stored.client_profile = JSON.parse(params[8]);
            return { rows: [stored], rowCount: 1 };
        }
        return { rows: [stored], rowCount: 1 };
    } };
    const filename = path.resolve(__dirname, '../controllers/customerController.js');
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, console: { error() {}, warn() {} }, Buffer, Date,
        require(id) {
            if (id === '../config/db') return pool;
            if (id === '../utils/clientProfile') return require(id);
            if (id === '../utils/phoneUtils') return { formatPhoneNumber: value => value || null };
            if (id === '../utils/paramValidation') return { requireInt: req => Number(req.params.customerId) };
            if (id === '../utils/pagination') return { getPagination: () => ({ enabled: false }) };
            if (id === '../utils/sendMessage') return { getWebsiteDomain: async () => 'example.invalid' };
            if (id === '../lib/firmBranding') return { getLawFirmNameHe: async () => 'Test firm' };
            if (id === '../services/settingsService') return { getSetting: async (_section, _key, fallback) => fallback };
            if (id === '../utils/templateRenderer') return { renderTemplate: value => value };
            if (id === '../services/notifications/notificationOrchestrator') return { notifyRecipient: async value => notifications.push(value) };
            return {};
        },
    });
    return { controller: module.exports, calls, notifications, stored: () => stored };
}

async function invoke(controller, method, body = {}, extra = {}) {
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await controller[method]({ body, params: { customerId: '42' }, user: { UserId: 42 }, query: {}, ...extra }, response);
    return response;
}

test('create persists profile; current-self reads it while broad lists omit identity data; transport is fake', async () => {
    const h = harness();
    const created = await invoke(h.controller, 'addCustomer', { name: 'أحمد', email: 'contact@example.invalid', companyName: 'חברה לדוגמה', clientProfile: profile() });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.body.ClientProfile, normalizeClientProfile(profile()));
    assert.equal(h.stored().companyname, 'חברה לדוגמה');
    assert.equal(h.notifications.length, 1);
    const list = await invoke(h.controller, 'getCustomers');
    assert.equal(list.body[0].ClientProfile, undefined);
    const current = await invoke(h.controller, 'getCurrentCustomer');
    assert.deepEqual(current.body.ClientProfile, created.body.ClientProfile);
});

test('legacy create without new fields remains valid', async () => {
    const h = harness();
    const result = await invoke(h.controller, 'addCustomer', { name: 'Existing integration', email: 'contact@example.invalid' });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.ClientProfile.partyType, 'person');
});

test('legacy update preserves profile while explicit reset clears it', async () => {
    const original = normalizeClientProfile(profile());
    const h = harness({ client_profile: original });
    const updated = await invoke(h.controller, 'updateCustomerById', { name: 'Updated', email: 'contact@example.invalid', companyName: 'Company unchanged' });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(h.stored().client_profile, original);
    assert.deepEqual(updated.body.ClientProfile, original);
    const reset = await invoke(h.controller, 'updateCustomerById', { name: 'Updated', email: 'contact@example.invalid', clientProfile: null });
    assert.equal(reset.statusCode, 200);
    assert.equal(h.stored().client_profile.identity.number, '');
});

test('update stores an international passport without coercion and preserves organization separate from contact', async () => {
    const h = harness();
    const updated = await invoke(h.controller, 'updateCustomerById', { name: 'Contact', email: 'contact@example.invalid', companyName: 'Company', clientProfile: profile() });
    assert.equal(updated.statusCode, 200);
    assert.equal(h.stored().client_profile.identity.number, '000123-A');
    assert.equal(h.stored().client_profile.organization.registrationNumber, '005123456');
    assert.equal(h.calls.some(call => call.sql.includes('000123-A')), false);
    assert.equal(h.notifications.length, 0);
});

for (const method of ['addCustomer', 'updateCustomerById', 'updateCurrentCustomer']) test(`${method} rejects invalid profile before any database/transport operation`, async () => {
    const h = harness();
    const result = await invoke(h.controller, method, { name: 'Contact', email: 'contact@example.invalid', clientProfile: { identity: { number: 123 } } });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.field, 'clientProfile.identity.number');
    assert.equal(h.calls.length, 0);
    assert.equal(h.notifications.length, 0);
});

test('organization profile requires the sole incumbent company-name field', async () => {
    const h = harness();
    const result = await invoke(h.controller, 'addCustomer', { name: 'Contact', email: 'contact@example.invalid', clientProfile: profile() });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.field, 'companyName');
    assert.equal(h.calls.length, 0);
});

test('current-profile update targets authenticated identity and leaves omitted profile untouched', async () => {
    const h = harness();
    const result = await invoke(h.controller, 'updateCurrentCustomer', { UserId: 99, Name: 'Contact', Email: 'contact@example.invalid' });
    assert.equal(result.statusCode, 200);
    const call = h.calls.find(item => item.sql.includes('UPDATE users'));
    assert.equal(call.params.at(-1), 42);
    assert.equal(call.sql.includes('client_profile='), false);
});

test('current-profile update binds validated profile without writing a different user ID', async () => {
    const h = harness();
    const result = await invoke(h.controller, 'updateCurrentCustomer', { UserId: 99, Name: 'Contact', Email: 'contact@example.invalid', CompanyName: 'Company', ClientProfile: profile() });
    assert.equal(result.statusCode, 200);
    const call = h.calls.find(item => item.sql.includes('UPDATE users'));
    assert.equal(call.params.at(-1), 42);
    assert.equal(JSON.parse(call.params[5]).identity.number, '000123-A');
    assert.equal(h.notifications.length, 0);
});

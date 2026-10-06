const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, modules = {}, env = {}) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        module, exports: module.exports, process: { env }, global: {},
        console: { warn() {}, error() {}, log() {} },
        require(name) { return modules[name] || {}; },
    }, { filename: file });
    return module.exports;
}

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('existing named production and sandbox credentials remain separate', () => {
    const env = { PROD_TAKBULL_API_KEY: 'prod-key', PROD_TAKBULL_API_SECRET: 'prod-secret', TEST_TAKBULL_API_KEY: 'test-key', TEST_TAKBULL_API_SECRET: 'test-secret' };
    const prod = load('lib/payments/takbullCredentials.js', {}, env);
    assert.equal(prod.getTakbullCredentialsFromEnv().apiKey, 'prod-key');
    for (const mode of ['test', 'sandbox', 'dev']) {
        const sandbox = load('lib/payments/takbullCredentials.js', {}, { ...env, TAKBULL_MODE: mode });
        assert.equal(sandbox.getTakbullCredentialsFromEnv().apiKey, 'test-key');
        assert.equal(sandbox.getTakbullMode(), 'test');
    }
});

test('legacy credentials retain compatibility; incomplete pairs do not become credentials', () => {
    assert.equal(load('lib/payments/takbullCredentials.js').getTakbullCredentialsFromEnv(), null);
    assert.equal(load('lib/payments/takbullCredentials.js', {}, { PROD_TAKBULL_API_KEY: 'only-key' }).getTakbullCredentialsFromEnv(), null);
    const legacy = load('lib/payments/takbullCredentials.js', {}, { TAKBULL_API_KEY: 'synthetic-key', TAKBULL_API_SECRET: 'synthetic-secret' });
    assert.equal(legacy.getTakbullCredentialsFromEnv().mode, 'legacy');
});

test('configured card verification amount remains available without accepting invalid amounts', () => {
    const amount = value => load('lib/payments/takbullCredentials.js', {}, { BILLING_CARD_VERIFICATION_AMOUNT_ILS: value }).resolveSetupAmountIls();
    assert.equal(amount('2.5'), 2.5);
    for (const value of [undefined, '', '0', '-1', 'NaN', 'Infinity']) assert.equal(amount(value), 1);
});

test('checkout confirmation validates the provider return before exposing the refreshed snapshot', async () => {
    const calls = [];
    const controller = load('controllers/billingController.js', {
        '../lib/billing/firmBillingService': {
            async handleTakbullReturn(input) { calls.push(['validate', input.intentId]); },
            async getBillingSnapshot() { calls.push(['snapshot']); return { setupCheckoutAmountIls: 2, takbullMode: 'test' }; },
        },
    });
    const res = response();
    await controller.confirmCheckout({ body: { intentId: 'synthetic-intent' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [['validate', 'synthetic-intent'], ['snapshot']]);
    assert.equal(res.body.billing.setupCheckoutAmountIls, 2);
    assert.equal(res.body.billing.takbullMode, 'test');
});

test('checkout confirmation rejects missing identifiers and failed validation without refreshing', async () => {
    let calls = 0;
    const controller = load('controllers/billingController.js', {
        '../lib/billing/firmBillingService': {
            async handleTakbullReturn() { calls++; throw Error('synthetic validation failure'); },
            async getBillingSnapshot() { throw Error('must not load snapshot'); },
        },
    });
    const missing = response();
    await controller.confirmCheckout({ body: {} }, missing);
    assert.equal(missing.statusCode, 400); assert.equal(calls, 0);
    const failed = response();
    await controller.confirmCheckout({ body: { uniqId: 'synthetic-uniq' } }, failed);
    assert.equal(failed.statusCode, 500); assert.equal(calls, 1);
});

function deletion({ env = {}, denied = false, legal = false, fail = false } = {}) {
    const queries = []; let connections = 0, releases = 0;
    const db = {
        async query(sql, args) {
            queries.push(sql);
            if (sql.includes('SELECT caseid')) assert.equal(args[0], 17);
            if (fail && sql.includes('FOR UPDATE')) throw Error('synthetic query error');
            return { rowCount: 1, rows: [] };
        },
        release() { releases++; },
    };
    const controller = load('controllers/caseController.js', {
        '../config/db': { async connect() { connections++; return db; } },
        '../utils/paramValidation': { requireInt() { return 17; } },
        '../lib/firmPermissions/caseAccess': { async assertCaseRecordAccess() { return denied ? { httpStatus: 403, errorCode: 'DENIED' } : null; } },
        '../utils/legalData': { async caseHasLegalData() { queries.push('LEGAL CHECK'); return legal; } },
        '../utils/errors.he': { getHebrewMessage() { return 'synthetic preservation message'; } },
        '../utils/operationalDashboardCache': { invalidateOperationalDashboardCaches() {} },
    }, env);
    return { controller, queries, counts: () => ({ connections, releases }) };
}

test('case deletion keeps role permission checks ahead of all database mutations', async () => {
    const h = deletion({ denied: true }); const res = response();
    await h.controller.deleteCase({}, res);
    assert.equal(res.statusCode, 403); assert.equal(res.body.code, 'DENIED');
    assert.deepEqual(h.counts(), { connections: 0, releases: 0 });
});

test('production hard deletion remains disabled by default', async () => {
    const h = deletion({ env: { NODE_ENV: 'production' } }); const res = response();
    await h.controller.deleteCase({}, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(h.counts(), { connections: 0, releases: 0 });
});

test('explicit hard-delete permission never overrides linked legal data protection', async () => {
    const h = deletion({ env: { NODE_ENV: 'production', ALLOW_CASE_HARD_DELETE: 'true' }, legal: true });
    const res = response(); await h.controller.deleteCase({}, res);
    assert.equal(res.statusCode, 409); assert.equal(res.body.code, 'CASE_HAS_LEGAL_DATA');
    assert.ok(h.queries[1].includes('FOR UPDATE'));
    assert.deepEqual(h.queries.slice(2), ['LEGAL CHECK', 'ROLLBACK']);
    assert.deepEqual(h.counts(), { connections: 1, releases: 1 });
});

test('an empty case deletes in one locked transaction when explicitly enabled', async () => {
    const h = deletion({ env: { NODE_ENV: 'production', ALLOW_CASE_HARD_DELETE: 'true' } }); const res = response();
    await h.controller.deleteCase({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(h.queries[0], 'BEGIN'); assert.ok(h.queries[1].includes('FOR UPDATE'));
    assert.equal(h.queries[2], 'LEGAL CHECK'); assert.equal(h.queries.at(-1), 'COMMIT');
    assert.deepEqual(h.counts(), { connections: 1, releases: 1 });
});

test('database failure rolls back deletion and releases the connection', async () => {
    const h = deletion({ fail: true }); const res = response();
    await h.controller.deleteCase({}, res);
    assert.equal(res.statusCode, 500); assert.equal(h.queries.at(-1), 'ROLLBACK');
    assert.deepEqual(h.counts(), { connections: 1, releases: 1 });
});

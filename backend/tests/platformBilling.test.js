const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const billing = require('../lib/billing/platformBilling');

const paid = { available: true, billingEnabled: true, status: 'active', package: { total: 123.45, platformId: 'law', resourceId: 'standard' } };
test('monthly and discounted annual subscriptions produce monthly minor units', () => {
    assert.equal(billing.summary(paid).mrrCents, 12345);
    assert.equal(billing.summary({ ...paid, billingInterval: 'yearly', priceYearlyIls: 1200 }).mrrCents, 10000);
    assert.equal(billing.summary(paid).productId, 'layerwebsites');
    assert.ok(Number.isFinite(Date.parse(billing.summary(paid).ts)));
});
test('complimentary, suspended and disabled plans do not report list price as recurring revenue', () => {
    for (const extra of [{ status: 'complimentary' }, { status: 'suspended' }, { billingEnabled: false }, { available: false }]) {
        assert.equal(billing.summary({ ...paid, ...extra }).mrrCents, 0);
    }
    assert.equal(billing.summary({ ...paid, billingEnabled: false }).billingStatus, 'none');
});
test('invalid billing data fails instead of becoming a healthy zero', () => {
    for (const snapshot of [null, { ...paid, status: 'mystery' }, { ...paid, package: { total: 'bad' } }]) {
        assert.throws(() => billing.summary(snapshot));
    }
});
test('payments map real field names, units, enum and timestamp without provider/private fields', () => {
    const result = billing.payments([{ id: 42, amountIls: 12.34, status: 'paid', kind: 'setup', purpose: 'תיאור חופשי', createdAt: '2026-10-01', settledAt: '2026-10-02', transactionId: 'private', errorMessage: 'private' }]);
    assert.deepEqual(result, [{ id: '42', amountCents: 1234, currency: 'ILS', status: 'paid', purpose: 'setup', occurredAt: '2026-10-02T00:00:00.000Z' }]);
    assert.equal(billing.payments([{ id: 'x', amountIls: -5, status: 'refunded', createdAt: '2026-10-01', kind: 'future-kind' }])[0].purpose, 'other');
});
test('missing payment values are rejected rather than silently fabricated', () => {
    assert.throws(() => billing.payments([{ id: 'x', amountIls: undefined, createdAt: '2026-10-01' }]));
    assert.throws(() => billing.payments([{ id: 'x', amountIls: 1, createdAt: 'bad' }]));
});

function routes(service) {
    const handlers = new Map();
    const router = { get: (p, fn) => handlers.set(p, fn), post: () => {} };
    const filename = path.join(__dirname, '../routes/platformRoutes.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module: { exports: {} }, process: { env: { CENTRAL_SERVICE_KEY: 'qa-key' } },
        require: name => {
            if (name === 'express') return { Router: () => router };
            if (name.endsWith('/firmBillingService')) return service;
            if (name.endsWith('/platformBilling')) return billing;
            return {};
        },
    }, { filename });
    return async (route, authorized = true) => {
        const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; } };
        await handlers.get(route)({ headers: { authorization: authorized ? 'Bearer qa-key' : '' }, query: {} }, res);
        return res;
    };
}
test('real route retains authentication and never reads billing for anonymous callers', async () => {
    let calls = 0;
    const call = routes({ getBillingSnapshot: () => { calls++; return paid; } });
    assert.equal((await call('/billing/summary', false)).statusCode, 401);
    assert.equal(calls, 0);
    assert.equal((await call('/billing/summary')).body.mrrCents, 12345);
});
test('real routes expose dependency failures as503 without exception details or fake empty data', async () => {
    const fail = () => { throw Error('private connection details'); };
    const call = routes({ getBillingSnapshot: fail, listPaymentHistory: fail });
    for (const route of ['/billing/summary', '/billing/payments']) {
        const r = await call(route);
        assert.equal(r.statusCode, 503);
        assert.equal(JSON.stringify(r.body), '{"error":"BILLING_UNAVAILABLE"}');
    }
});
test('real payments route returns transformed data and genuine empty history', async () => {
    const call = routes({ listPaymentHistory: async () => [] });
    assert.equal(JSON.stringify((await call('/billing/payments')).body), '{"payments":[]}');
});

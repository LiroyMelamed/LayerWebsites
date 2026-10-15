'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const servicePath = require.resolve('../lib/tenant/signupService');
// No provider or DB connection: retain real HTTP controller, router and limits.
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
    createSignupIntent: async () => ({ id: 'synthetic', slug: 'qa-http', priceMonthlyIls: 532, recurringAmountIls: 532 }),
    getSignupIntent: async () => ({ id: 'synthetic', status: 'pending_payment' }),
    createSignupCheckout: async () => ({ ready: true }),
    syncSignup: async () => {},
    completeSignupWithoutPayment: async () => { throw Object.assign(Error('payment required'), { code: 'PAYMENT_REQUIRED' }); },
} };
process.env.TRUST_PROXY = 'false';
process.env.RATE_LIMIT_SIGNUP_MAX = '2';
const router = require('../routes/publicSignupRoutes');
const { resetStore } = require('../utils/rateLimiter');
const { isExemptPath } = require('../middlewares/requireBillingAccess');

test('status polling cannot exhaust signup creation, checkout or verified-return budgets', async () => {
    resetStore();
    const app = express(); app.use(express.json()); app.use('/api/public/signup', router);
    app.use((err, req, res, next) => res.status(err.status || err.statusCode || err.httpStatus || 500).json({ code: err.code }));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/public/signup`;
    try {
        for (let n = 0; n < 25; n++) assert.equal((await fetch(base + '/synthetic/status')).status, 200);
        assert.equal((await fetch(base + '/start', { method: 'POST' })).status, 201);
        assert.equal((await fetch(base + '/start', { method: 'POST' })).status, 201);
        assert.equal((await fetch(base + '/start', { method: 'POST' })).status, 429);
        assert.equal((await fetch(base + '/synthetic/checkout', { method: 'POST' })).status, 200);
        assert.equal((await fetch(base + '/synthetic/sync', { method: 'POST' })).status, 200);
        assert.equal((await fetch(base + '/synthetic/complete', { method: 'POST' })).status, 402);
    } finally { await new Promise(resolve => server.close(resolve)); resetStore(); }
});

test('billing lock permits public signup and separately authenticated business control only at proper boundaries', () => {
    for (const path of ['/api/public/signup', '/api/public/signup/start', '/api/public/signup/qa/status', '/api/business-control']) assert.equal(isExemptPath({ originalUrl: path }), true);
    for (const path of ['/api/public/signup-evil', '/api/public/signups', '/api/business-control-evil', '/api/Cases']) assert.equal(isExemptPath({ originalUrl: path }), false);
});

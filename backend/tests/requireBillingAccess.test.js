process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const billing = require('../lib/billing/firmBillingService');
const { requireBillingAccess } = require('../middlewares/requireBillingAccess');

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
}

test('requireBillingAccess allows when snapshot not locked', async () => {
    const orig = billing.getBillingSnapshot;
    billing.getBillingSnapshot = async () => ({ locked: false, status: 'active' });
    try {
        let nextCalled = false;
        const req = { originalUrl: '/api/Cases', path: '/api/Cases' };
        const res = mockRes();
        await requireBillingAccess(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    } finally {
        billing.getBillingSnapshot = orig;
    }
});

test('requireBillingAccess returns a neutral 503 without financial details when locked', async () => {
    const orig = billing.getBillingSnapshot;
    billing.getBillingSnapshot = async () => ({
        locked: true,
        status: 'past_due',
        payUrl: '/pay',
        graceUntil: null,
    });
    try {
        let nextCalled = false;
        const req = { originalUrl: '/api/Cases', path: '/api/Cases' };
        const res = mockRes();
        await requireBillingAccess(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body?.errorCode, 'SERVICE_TEMPORARILY_UNAVAILABLE');
        for (const key of ['status', 'payUrl', 'graceUntil', 'billingLocked']) assert.equal(res.body?.[key], undefined);
        assert.ok(!JSON.stringify(res.body).includes('תשלום'));
    } finally {
        billing.getBillingSnapshot = orig;
    }
});

test('requireBillingAccess fails closed when snapshot throws', async () => {
    const orig = billing.getBillingSnapshot;
    billing.getBillingSnapshot = async () => {
        throw new Error('db timeout');
    };
    try {
        let nextCalled = false;
        const req = { originalUrl: '/api/Cases', path: '/api/Cases' };
        const res = mockRes();
        await requireBillingAccess(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body?.errorCode, 'SERVICE_TEMPORARILY_UNAVAILABLE');
        assert.ok(!String(res.body?.message || '').includes('db timeout'));
    } finally {
        billing.getBillingSnapshot = orig;
    }
});

test('requireBillingAccess still exempts auth paths when snapshot throws', async () => {
    const orig = billing.getBillingSnapshot;
    billing.getBillingSnapshot = async () => {
        throw new Error('db timeout');
    };
    try {
        let nextCalled = false;
        const req = { originalUrl: '/api/Auth/RequestOtp', path: '/api/Auth/RequestOtp' };
        const res = mockRes();
        await requireBillingAccess(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    } finally {
        billing.getBillingSnapshot = orig;
    }
});


test('only session identity lookup remains available for owner recovery navigation', () => {
    const {isExemptPath}=require('../middlewares/requireBillingAccess');
    assert.equal(isExemptPath({originalUrl:'/api/staff/session-scope'}),true);
    assert.equal(isExemptPath({originalUrl:'/api/staff/roles'}),false);
});

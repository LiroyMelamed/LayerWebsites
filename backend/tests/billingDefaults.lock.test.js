const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getTenantSlug,
    defaultComplimentaryUntil,
    defaultBillingEnabled,
} = require('../lib/billing/tenantBillingDefaults');
const { isExemptPath } = require('../middlewares/requireBillingAccess');
const { nationalLast9, excludedSeatPhones } = require('../lib/limits/seatExclusions');

test('tenant defaults: ashrafessa complimentary through 31/12/2026', () => {
    const prev = { ...process.env };
    process.env.FIRM_NAME = 'AshrafEssa';
    process.env.COMPANY_NAME = 'AshrafEssa';
    process.env.RUNTIME_TENANT = 'ashrafessa';
    delete process.env.FIRM_DEFAULT_UNLIMITED_UNTIL_UTC;
    delete process.env.BILLING_CHARGES_ENABLED;
    try {
        assert.equal(getTenantSlug(), 'ashrafessa');
        assert.equal(defaultBillingEnabled(), true);
        const until = defaultComplimentaryUntil();
        assert.ok(until);
        assert.equal(
            until.toISOString(),
            new Date('2026-12-31T21:59:59.999+02:00').toISOString()
        );
    } finally {
        Object.assign(process.env, prev);
    }
});

test('tenant defaults: melamedlaw complimentary through 01/09/2026', () => {
    process.env.FIRM_NAME = 'MelamedLaw';
    process.env.COMPANY_NAME = 'MelamedLaw';
    process.env.RUNTIME_TENANT = 'melamedlaw';
    delete process.env.FIRM_DEFAULT_UNLIMITED_UNTIL_UTC;
    try {
        assert.equal(getTenantSlug(), 'melamedlaw');
        const until = defaultComplimentaryUntil();
        assert.ok(until);
        assert.equal(
            until.toISOString(),
            new Date('2026-09-01T23:59:59.999+03:00').toISOString()
        );
    } finally {
        delete process.env.RUNTIME_TENANT;
    }
});

test('tenant defaults: melamedia is unbilled', () => {
    process.env.FIRM_NAME = 'Melamedia';
    process.env.RUNTIME_TENANT = 'melamedia';
    delete process.env.BILLING_CHARGES_ENABLED;
    try {
        assert.equal(defaultBillingEnabled(), false);
    } finally {
        delete process.env.RUNTIME_TENANT;
        delete process.env.FIRM_NAME;
    }
});

test('billing lock exempts auth, webhooks, billing, public signing', () => {
    const exempt = [
        '/api/Auth/RequestOtp',
        '/api/webhooks/payments/takbull',
        '/api/billing/checkout',
        '/api/SigningFiles/public/abc',
        '/api/platform-settings/public',
        '/health',
        '/api/calendar/invite/tok',
    ];
    for (const p of exempt) {
        assert.equal(isExemptPath({ originalUrl: p, path: p }), true, p);
    }
    assert.equal(isExemptPath({ originalUrl: '/api/Cases', path: '/api/Cases' }), false);
});

test('excluded seat phones include owner 0507299064 as last-9 507299064', () => {
    assert.equal(nationalLast9('0507299064'), '507299064');
    assert.equal(nationalLast9('+972507299064'), '507299064');
    assert.equal(nationalLast9('972507299064'), '507299064');
    assert.ok(excludedSeatPhones().includes('507299064'));
});

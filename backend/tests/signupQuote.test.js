'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PRICING } = require('../lib/billing/pricingPackage');
const { quoteSignup, renewalAmount, CONSENT_VERSION } = require('../lib/billing/signupQuote');

test('all 90 allowed signup choices use final prices and the existing annual discount', () => {
    let combinations = 0;
    for (const platform of PRICING.platforms.filter(p => p.id !== 'none')) for (const resource of PRICING.resources) for (const signing of PRICING.signing) for (const billingInterval of ['monthly', 'yearly']) {
        const q = quoteSignup({ platformId: platform.id, resourceId: resource.id, signingId: signing.id, billingInterval });
        const monthly = 296 + platform.amount + resource.amount + signing.amount;
        const expectedNet = billingInterval === 'yearly' ? Math.round(monthly * 12 * 0.9) : monthly;
        assert.equal(q.netAmountIls, expectedNet);
        assert.equal(q.vatPercent, 0);
        assert.equal(Math.round(q.recurringAmountIls * 100), Math.round(expectedNet * 100));
        combinations++;
    }
    assert.equal(combinations, 90);
});
test('website plus basic resources costs ₪532 final; historical system-only contracts remain unchanged', () => {
    const q = quoteSignup({ platformId: 'site', resourceId: 'basic', signingId: 'none', billingInterval: 'monthly' });
    assert.equal(q.recurringAmountIls, 532);
    const account = { billing_interval: 'monthly', price_monthly_ils: 380 };
    const newAgreement = { consent_version: CONSENT_VERSION, recurring_amount_ils: '532.00' };
    assert.equal(renewalAmount({ billing_interval: 'monthly', price_monthly_ils: 532 }, newAgreement), 532);
    assert.equal(renewalAmount({}, newAgreement), 532);
    assert.equal(renewalAmount(account, { consent_version: 'signup-1ils-3months-v1' }), 380);
    assert.equal(renewalAmount({ ...account, billing_interval: 'yearly' }, { consent_version: 'signup-1ils-3months-v1' }), 4104);
});
test('accepted plan changes use the agreed billing row, not an obsolete signup or live catalogue price', () => {
    const agreement = { consent_version: CONSENT_VERSION, recurring_amount_ils: '532.00' };
    assert.equal(renewalAmount({ billing_interval: 'monthly', price_monthly_ils: '700' }, agreement), 700);
    assert.equal(renewalAmount({ billing_interval: 'yearly', price_monthly_ils: '700' }, agreement), 7560);
});
test('invalid choices and missing new contract charge fail closed', () => {
    const valid = { platformId: 'site', resourceId: 'basic', signingId: 'none', billingInterval: 'monthly' };
    assert.throws(() => quoteSignup({ ...valid, platformId: 'none' }), { code: 'INVALID_PACKAGE' });
    for (const key of Object.keys(valid)) {
        assert.throws(() => quoteSignup({ ...valid, [key]: 'untrusted' }), { code: 'INVALID_PACKAGE' });
    }
    for (const amount of [null, 0, -1, 'NaN']) assert.throws(() => renewalAmount({}, { consent_version: CONSENT_VERSION, recurring_amount_ils: amount }));
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    evaluatePackageChange,
    disabledOptionsForUsage,
    resolvePricingLineItems,
    quotasForPackage,
    recommendCheapestPackage,
    RESOURCE_SMS_MONTHLY_QUOTA,
    yearlyTotalIls,
    yearlySavingsIls,
    normalizeBillingInterval,
} = require('../lib/billing/pricingPackage');

test('evaluatePackageChange blocks cheaper signing when documents exceed pack', () => {
    const ev = evaluatePackageChange({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '1500' },
        next: { platformId: 'site_app', resourceId: 'pro', signingId: '500' },
        usage: { documents: { createdThisMonth: 600 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
    });
    assert.equal(ev.allowed, false);
    assert.ok(ev.blocks.some((b) => b.field === 'signingId'));
});

test('evaluatePackageChange allows upgrade even when over current quota', () => {
    const ev = evaluatePackageChange({
        current: { platformId: 'site_app', resourceId: 'basic', signingId: '500' },
        next: { platformId: 'site_app', resourceId: 'pro', signingId: '1500' },
        usage: { documents: { createdThisMonth: 600 }, seats: { used: 3 }, storage: { bytesTotal: 0 } },
    });
    assert.equal(ev.allowed, true);
    assert.equal(ev.priceIncreased, true);
});

test('evaluatePackageChange blocks platform downgrade from site_app', () => {
    const ev = evaluatePackageChange({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '500' },
        next: { platformId: 'site', resourceId: 'pro', signingId: '500' },
        usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
    });
    assert.equal(ev.allowed, false);
    assert.ok(ev.blocks.some((b) => b.field === 'platformId'));
});

test('evaluatePackageChange blocks resource downgrade when seats exceed', () => {
    const ev = evaluatePackageChange({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '500' },
        next: { platformId: 'site_app', resourceId: 'basic', signingId: '500' },
        usage: { documents: { createdThisMonth: 0 }, seats: { used: 4 }, storage: { bytesTotal: 0 } },
    });
    assert.equal(ev.allowed, false);
    assert.ok(ev.blocks.some((b) => b.field === 'resourceId'));
});

test('disabledOptionsForUsage marks cheaper signing packs', () => {
    const disabled = disabledOptionsForUsage({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '1500' },
        usage: { documents: { createdThisMonth: 600 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
    });
    assert.ok(disabled.signingIds.includes('500'));
    assert.ok(!disabled.signingIds.includes('1500'));
});

test('resolvePricingLineItems default site_app + pro + 500 totals 972', () => {
    const resolved = resolvePricingLineItems({
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '500',
    });
    assert.equal(resolved.total, 296 + 296 + 211 + 169);
    assert.equal(resolved.displayName, 'פרו · אתר + אפליקציה · 500 חתימות');
    const q = quotasForPackage(resolved);
    assert.equal(q.usersQuota, 5);
    assert.equal(q.storageMbQuota, 1024);
    assert.equal(q.documentsMonthlyQuota, 500);
    assert.equal(q.otpSmsMonthlyQuota, 2000);
});

test('enterprise SMS monthly quota is 5000 not unlimited', () => {
    assert.equal(RESOURCE_SMS_MONTHLY_QUOTA.enterprise, 5000);
    const q = quotasForPackage({ resourceId: 'enterprise', signingId: '500' });
    assert.equal(q.otpSmsMonthlyQuota, 5000);
});

test('recommendCheapestPackage: MelamedLaw-shaped usage needs enterprise 1353', () => {
    const rec = recommendCheapestPackage({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '500' },
        usage: {
            documents: { createdThisMonth: 74 },
            seats: { used: 8 },
            storage: { bytesTotal: 280.4 * 1024 * 1024 },
            sms: { sentThisMonth: 421 },
        },
    });
    assert.equal(rec.recommended.platformId, 'site_app');
    assert.equal(rec.recommended.resourceId, 'enterprise');
    assert.equal(rec.recommended.signingId, '500');
    assert.equal(rec.recommended.total, 296 + 296 + 592 + 169);
    assert.equal(rec.changed, true);
});

test('recommendCheapestPackage: MorLevi-shaped usage fits basic 845', () => {
    const rec = recommendCheapestPackage({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '500' },
        usage: {
            documents: { createdThisMonth: 0 },
            seats: { used: 0 },
            storage: { bytesTotal: 0 },
            sms: { sentThisMonth: 10 },
        },
    });
    assert.equal(rec.recommended.platformId, 'site_app');
    assert.equal(rec.recommended.resourceId, 'basic');
    assert.equal(rec.recommended.signingId, '500');
    assert.equal(rec.recommended.total, 296 + 296 + 84 + 169);
    assert.equal(rec.changed, true);
});

test('recommendCheapestPackage: SMS above pro cap 2000 needs enterprise', () => {
    const rec = recommendCheapestPackage({
        current: { platformId: 'site_app', resourceId: 'pro', signingId: '500' },
        usage: {
            documents: { createdThisMonth: 0 },
            seats: { used: 1 },
            storage: { bytesTotal: 0 },
            sms: { sentThisMonth: 2001 },
        },
    });
    assert.equal(rec.recommended.resourceId, 'enterprise');
    assert.equal(rec.recommended.total, 296 + 296 + 592 + 169);
});

test('yearly billing is 10% off 12 months, rounded', () => {
    assert.equal(normalizeBillingInterval('yearly'), 'yearly');
    assert.equal(normalizeBillingInterval('YEARLY'), 'yearly');
    assert.equal(normalizeBillingInterval('monthly'), 'monthly');
    assert.equal(normalizeBillingInterval(null), 'monthly');

    assert.equal(yearlyTotalIls(1353), 14612);
    assert.equal(yearlySavingsIls(1353), 1624);
    assert.equal(yearlyTotalIls(972), 10498);
    assert.equal(yearlySavingsIls(972), 1166);
    assert.equal(yearlyTotalIls(845), 9126);
    assert.equal(yearlySavingsIls(845), 1014);

    const enterprise = resolvePricingLineItems({
        platformId: 'site_app',
        resourceId: 'enterprise',
        signingId: '500',
    });
    assert.equal(enterprise.total, 1353);
    assert.equal(enterprise.yearlyTotal, 14612);
    assert.equal(enterprise.yearlySavings, 1624);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    evaluatePackageChange,
    disabledOptionsForUsage,
    resolvePricingLineItems,
    quotasForPackage,
    recommendCheapestPackage,
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

test('resolvePricingLineItems default site_app + pro + 500 totals 826', () => {
    const resolved = resolvePricingLineItems({
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '500',
    });
    assert.equal(resolved.total, 249 + 299 + 149 + 129);
    assert.equal(resolved.displayName, 'פרו · אתר + אפליקציה · 500 חתימות');
    const q = quotasForPackage(resolved);
    assert.equal(q.usersQuota, 5);
    assert.equal(q.storageMbQuota, 1024);
    assert.equal(q.documentsMonthlyQuota, 500);
});

test('recommendCheapestPackage: MelamedLaw-shaped usage needs enterprise 1076', () => {
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
    assert.equal(rec.recommended.total, 249 + 299 + 399 + 129);
    assert.equal(rec.changed, true);
});

test('recommendCheapestPackage: MorLevi-shaped usage fits basic 677', () => {
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
    assert.equal(rec.recommended.total, 249 + 299 + 0 + 129);
    assert.equal(rec.changed, true);
});

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const billing = require('../lib/billing/firmBillingService');

test('parseIntentPackageSnapshot reads platform/resource/signing ids', () => {
    const parsed = billing.parseIntentPackageSnapshot({
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '1500',
        billingInterval: 'monthly',
    });
    assert.deepEqual(parsed, {
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '1500',
        billingInterval: 'monthly',
    });
});

test('applyIntentPackageSnapshot updates billing row from intent snapshot', async () => {
    const stubs = {
        updateBilling: billing.updateBilling,
        syncTenantSubscription: billing.syncTenantSubscription,
    };
    const updates = [];
    billing.updateBilling = async (payload) => {
        updates.push(payload);
    };
    billing.syncTenantSubscription = async () => {};

    try {
        const applied = await billing.applyIntentPackageSnapshot({
            package_snapshot: {
                platformId: 'site_app',
                resourceId: 'pro',
                signingId: '1500',
                billingInterval: 'monthly',
            },
        });
        assert.equal(applied, true);
        assert.equal(updates.length, 1);
        assert.equal(updates[0].platform_id, 'site_app');
        assert.equal(updates[0].resource_id, 'pro');
        assert.equal(updates[0].signing_id, '1500');
    } finally {
        billing.updateBilling = stubs.updateBilling;
        billing.syncTenantSubscription = stubs.syncTenantSubscription;
    }
});

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const billing = require('../lib/billing/firmBillingService');

const baseRow = {
    platformId: 'site_app',
    resourceId: 'basic',
    signingId: '500',
    billingInterval: 'monthly',
    billingEnabled: true,
    status: 'active',
    complimentaryUntil: '2020-01-01T00:00:00.000Z',
    graceUntil: null,
    lastPaymentError: null,
};

test('savePackage does not persist package before failed upgrade charge', async () => {
    const stubs = {
        ensureBillingRow: billing.ensureBillingRow,
        getBillingRow: billing.getBillingRow,
        getActiveCard: billing.getActiveCard,
        chargeSavedCard: billing.chargeSavedCard,
        updateBilling: billing.updateBilling,
        syncTenantSubscription: billing.syncTenantSubscription,
        createCheckout: billing.createCheckout,
        getBillingSnapshot: billing.getBillingSnapshot,
    };

    let updateCalled = false;
    let chargeCalled = false;

    billing.ensureBillingRow = async () => ({ ...baseRow });
    billing.getBillingRow = async () => ({ ...baseRow });
    billing.getActiveCard = async () => ({ tokenEncrypted: 'enc' });
    billing.chargeSavedCard = async () => {
        chargeCalled = true;
        return { ok: false, snapshot: { status: 'past_due' } };
    };
    billing.updateBilling = async () => {
        updateCalled = true;
    };
    billing.syncTenantSubscription = async () => {};
    billing.createCheckout = async () => ({ intentId: 99, redirectUrl: 'https://pay.example' });
    billing.getBillingSnapshot = async () => ({ status: 'past_due', package: { total: 100 } });

    try {
        const result = await billing.savePackage({
            platformId: 'site_app',
            resourceId: 'pro',
            signingId: '1500',
            usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
        });
        assert.equal(chargeCalled, true);
        assert.equal(updateCalled, false);
        assert.ok(result.checkout);
    } finally {
        Object.assign(billing, stubs);
    }
});

test('savePackage persists only after successful upgrade charge', async () => {
    const stubs = {
        ensureBillingRow: billing.ensureBillingRow,
        getBillingRow: billing.getBillingRow,
        getActiveCard: billing.getActiveCard,
        chargeSavedCard: billing.chargeSavedCard,
        updateBilling: billing.updateBilling,
        syncTenantSubscription: billing.syncTenantSubscription,
        getBillingSnapshot: billing.getBillingSnapshot,
    };

    let updateCalled = false;
    const updateOrder = [];

    billing.ensureBillingRow = async () => ({ ...baseRow });
    billing.getBillingRow = async () => ({ ...baseRow });
    billing.getActiveCard = async () => ({ tokenEncrypted: 'enc' });
    billing.chargeSavedCard = async () => {
        updateOrder.push('charge');
        return { ok: true, snapshot: { status: 'active' } };
    };
    billing.updateBilling = async () => {
        updateOrder.push('update');
        updateCalled = true;
    };
    billing.syncTenantSubscription = async () => {
        updateOrder.push('sync');
    };
    billing.getBillingSnapshot = async () => ({ status: 'active', package: { total: 200 } });

    try {
        const result = await billing.savePackage({
            platformId: 'site_app',
            resourceId: 'pro',
            signingId: '1500',
            usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
        });
        assert.equal(result.charged, true);
        assert.equal(updateCalled, true);
        assert.deepEqual(updateOrder, ['charge', 'update', 'sync']);
    } finally {
        Object.assign(billing, stubs);
    }
});

test('savePackage throws when persist fails after successful charge', async () => {
    const stubs = {
        ensureBillingRow: billing.ensureBillingRow,
        getBillingRow: billing.getBillingRow,
        getActiveCard: billing.getActiveCard,
        chargeSavedCard: billing.chargeSavedCard,
        updateBilling: billing.updateBilling,
        syncTenantSubscription: billing.syncTenantSubscription,
        getBillingSnapshot: billing.getBillingSnapshot,
    };

    billing.ensureBillingRow = async () => ({ ...baseRow });
    billing.getBillingRow = async () => ({ ...baseRow });
    billing.getActiveCard = async () => ({ tokenEncrypted: 'enc' });
    billing.chargeSavedCard = async () => ({ ok: true, snapshot: { status: 'active' } });
    billing.updateBilling = async () => {
        throw new Error('disk full');
    };
    billing.syncTenantSubscription = async () => {};
    billing.getBillingSnapshot = async () => ({ status: 'active' });

    try {
        await assert.rejects(
            () => billing.savePackage({
                platformId: 'site_app',
                resourceId: 'pro',
                signingId: '1500',
                usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
            }),
            (err) => err && err.code === 'PACKAGE_PERSIST_AFTER_CHARGE',
        );
    } finally {
        Object.assign(billing, stubs);
    }
});

test('savePackage no-card upgrade opens checkout with pending package snapshot', async () => {
    const stubs = {
        ensureBillingRow: billing.ensureBillingRow,
        getBillingRow: billing.getBillingRow,
        getActiveCard: billing.getActiveCard,
        createCheckout: billing.createCheckout,
        getBillingSnapshot: billing.getBillingSnapshot,
        updateBilling: billing.updateBilling,
    };

    let checkoutArgs = null;
    billing.ensureBillingRow = async () => ({ ...baseRow });
    billing.getBillingRow = async () => ({ ...baseRow });
    billing.getActiveCard = async () => null;
    billing.createCheckout = async (args) => {
        checkoutArgs = args;
        return { intentId: 1, redirectUrl: 'https://pay.example' };
    };
    billing.getBillingSnapshot = async () => ({ status: 'past_due', package: { total: 100 } });
    billing.updateBilling = async () => {
        throw new Error('must not persist before checkout payment');
    };

    try {
        const result = await billing.savePackage({
            platformId: 'site_app',
            resourceId: 'pro',
            signingId: '1500',
            usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
        });
        assert.ok(result.checkout);
        assert.ok(checkoutArgs?.pendingPackage);
        assert.equal(checkoutArgs.pendingPackage.platformId, 'site_app');
        assert.equal(checkoutArgs.pendingPackage.resourceId, 'pro');
        assert.equal(checkoutArgs.pendingPackage.signingId, '1500');
    } finally {
        Object.assign(billing, stubs);
    }
});

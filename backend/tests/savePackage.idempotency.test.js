process.env.NODE_ENV = 'test';
process.env.TAKBULL_API_KEY = 'test-key';
process.env.TAKBULL_API_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const pool = require('../config/db');
const secrets = require('../lib/billing/secrets');
const billing = require('../lib/billing/firmBillingService');
const verifier = require('../lib/payments/verifySignupPayment');
let activeMockState = null;

test.beforeEach(t => {
    const previous = verifier.verifyChargedTransaction;
    const previousFetch = global.fetch;
    global.fetch = async () => { throw Error('UNEXPECTED_EXTERNAL_NETWORK'); };
    verifier.verifyChargedTransaction = async (_credentials, transactionId, amount) => {
        const intent = activeMockState?.intents.find(row => row.takbull_transaction_id === transactionId);
        assert.ok(intent, 'Independent verification must bind the persisted provider transaction');
        assert.equal(Number(intent.amount_ils), amount);
        activeMockState.verifications.push({ transactionId, amount });
        return true;
    };
    t.after(() => { verifier.verifyChargedTransaction = previous; global.fetch = previousFetch; });
});

const baseBillingRow = {
    id: 1,
    platform_id: 'site_app',
    resource_id: 'basic',
    signing_id: '500',
    price_monthly_ils: 100,
    billing_interval: 'monthly',
    billing_enabled: true,
    status: 'active',
    complimentary_until: '2020-01-01T00:00:00.000Z',
    grace_until: null,
    renews_at: '2030-01-01T00:00:00.000Z',
    last_payment_error: null,
    last_failed_at: null,
    last_paid_at: null,
    law_firm_tenant_id: null,
    updated_at: new Date(),
};

function mapBillingForSelect(row) {
    return row ? { ...row } : undefined;
}

function createBillingPoolMock() {
    const state = {
        billingRow: { ...baseBillingRow },
        intents: [],
        events: [],
        verifications: [],
        advisoryQueue: Promise.resolve(),
    };
    activeMockState = state;

    function routeQuery(sql, params) {
        const s = String(sql).replace(/\s+/g, ' ').trim();

        if (s.startsWith('SELECT * FROM firm_billing')) {
            return { rows: [mapBillingForSelect(state.billingRow)] };
        }

        if (s.startsWith('UPDATE firm_billing SET')) {
            const assignments = s.match(/([a-z_]+) = \$\d+/g) || [];
            for (const part of assignments) {
                const m = part.match(/([a-z_]+) = \$(\d+)/);
                if (!m || m[1] === 'updated_at') continue;
                const idx = Number(m[2]) - 1;
                state.billingRow[m[1]] = params[idx];
            }
            state.billingRow.updated_at = new Date();
            return { rows: [], rowCount: 1 };
        }

        if (s.includes('FROM firm_payment_methods')) {
            return {
                rows: [{
                    id: 1,
                    last4: '4242',
                    exp_month: 12,
                    exp_year: 2030,
                    card_brand: 'visa',
                    token_encrypted: 'enc',
                    is_active: true,
                }],
            };
        }

        if (s.startsWith('INSERT INTO firm_payment_intents')) {
            const intent = {
                id: params[0],
                kind: params[1],
                status: 'pending',
                amount_ils: params[2],
                currency: 'ILS',
                order_reference: params[3],
                purpose: params[4],
                package_snapshot: JSON.parse(params[5]),
                takbull_transaction_id: null,
                settled_at: null,
                created_at: new Date(),
                updated_at: new Date(),
                law_firm_tenant_id: params[6] ?? null,
            };
            state.intents.push(intent);
            return { rows: [intent] };
        }

        if (s.startsWith('SELECT * FROM firm_payment_intents') && s.includes('WHERE id=$1')) {
            const match = state.intents.find(row => row.id === params[0]
                && (row.law_firm_tenant_id ?? null) === (params[1] ?? null));
            return { rows: match ? [{ ...match }] : [], rowCount: match ? 1 : 0 };
        }

        if (s.includes('FROM firm_payment_intents') && s.includes('FOR UPDATE')) {
            const key = params[0];
            const pending = [...state.intents]
                .reverse()
                .find((i) => i.status === 'pending'
                    && (i.kind === 'upgrade' || i.kind === 'annual')
                    && i.package_snapshot?.upgradeOperationKey === key);
            return { rows: pending ? [pending] : [] };
        }

        if (s.startsWith('SELECT id FROM firm_payment_intents') && s.includes("status='pending'")) {
            const rows = state.intents.filter(row => row.status === 'pending' && row.kind !== 'setup'
                && !row.signup_intent_id && (row.law_firm_tenant_id ?? null) === (params[0] ?? null));
            return { rows, rowCount: rows.length };
        }

        if (s.includes("status = 'succeeded'") && s.includes('upgradeOperationKey')) {
            const key = params[0];
            const minCreated = params[1];
            const match = [...state.intents]
                .reverse()
                .find((i) => i.status === 'succeeded'
                    && (i.kind === 'upgrade' || i.kind === 'annual')
                    && i.package_snapshot?.upgradeOperationKey === key
                    && new Date(i.created_at) >= new Date(minCreated));
            return { rows: match ? [match] : [] };
        }

        if (s.startsWith('UPDATE firm_payment_intents') && /SET status\s*=\s*'succeeded'/.test(s) && s.includes('RETURNING *')) {
            const intent = state.intents.find(row => row.id === params[0]);
            if (!intent || intent.status !== 'pending') return { rows: [], rowCount: 0 };
            intent.status = 'succeeded';
            intent.takbull_transaction_id = params[1];
            intent.settled_at = new Date();
            return { rows: [{ ...intent }], rowCount: 1 };
        }

        if (s.startsWith('UPDATE firm_payment_intents') && /takbull_transaction_id\s*=\s*\$2/.test(s)) {
            const intent = state.intents.find((i) => i.id === params[0]);
            if (intent) intent.takbull_transaction_id = params[1];
            return { rows: [], rowCount: 1 };
        }

        if (s.includes("SET status = 'succeeded'") && s.includes('RETURNING id')) {
            const intent = state.intents.find((i) => i.id === params[0]);
            if (intent && intent.status !== 'succeeded') {
                intent.status = 'succeeded';
                intent.settled_at = new Date();
                if (params[1]) intent.takbull_transaction_id = params[1];
                return { rows: [{ id: intent.id }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        }

        if (s.includes("SET status = 'failed'")) {
            const intent = state.intents.find((i) => i.id === params[0]);
            if (intent && intent.status === 'pending') intent.status = 'failed';
            return { rows: [], rowCount: 1 };
        }

        if (s.includes("SET status = 'cancelled'") && s.includes("status = 'pending'")) {
            return { rows: [], rowCount: 0 };
        }

        if (s.includes('FROM firm_payment_intents') && s.includes('ORDER BY created_at DESC')) {
            return { rows: state.intents.slice().reverse().slice(0, params[0] || 25) };
        }

        if (s.startsWith('INSERT INTO firm_payment_events')) {
            state.events.push({ intentId: params[0], eventType: params[1] });
            return { rows: [] };
        }

        if (s.includes('firm_payment_methods') && s.includes('INSERT')) {
            return { rows: [] };
        }

        return { rows: [], rowCount: 0 };
    }

    const orig = { connect: pool.connect.bind(pool), query: pool.query.bind(pool) };

    pool.query = async (sql, params) => routeQuery(sql, params);

    pool.connect = async () => {
        let advisoryRelease = null;
        const client = {
            query: async (sql, params) => {
                const s = String(sql);
                if (s === 'BEGIN') return { rows: [] };
                if (s === 'COMMIT') {
                    if (advisoryRelease) {
                        advisoryRelease();
                        advisoryRelease = null;
                    }
                    return { rows: [] };
                }
                if (s === 'ROLLBACK') {
                    if (advisoryRelease) {
                        advisoryRelease();
                        advisoryRelease = null;
                    }
                    return { rows: [] };
                }
                if (s.includes('pg_advisory_xact_lock')) {
                    let release;
                    const gate = new Promise((r) => { release = r; });
                    const prev = state.advisoryQueue;
                    state.advisoryQueue = prev.then(() => gate);
                    await prev;
                    advisoryRelease = release;
                    return { rows: [] };
                }
                return routeQuery(sql, params);
            },
            release() {},
        };
        return client;
    };

    return {
        state,
        restore() {
            pool.connect = orig.connect;
            pool.query = orig.query;
            activeMockState = null;
        },
    };
}

function upgradeArgs() {
    return {
        kind: 'upgrade',
        amountOverride: 200,
        skipEmail: true,
        upgradeOperation: {
            targetPackage: {
                platformId: 'site_app',
                resourceId: 'pro',
                signingId: '1500',
            },
            interval: 'monthly',
        },
    };
}

function installChargeStub() {
    let calls = 0;
    billing.setChargeTakbullTokenForTests(async ({ orderReference }) => {
        calls += 1;
        return {
            ok: true,
            transactionInternalNumber: `txn-${calls}-${orderReference}`,
            token: null,
        };
    });
    return {
        getCalls: () => calls,
        restore() {
            billing.setChargeTakbullTokenForTests(null);
        },
    };
}

test('buildUpgradeOperationKey is stable for the same logical upgrade', () => {
    const a = billing.buildUpgradeOperationKey({
        tenantId: null,
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '1500',
        billingInterval: 'monthly',
        amountIls: 200,
    });
    const b = billing.buildUpgradeOperationKey({
        tenantId: null,
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '1500',
        billingInterval: 'monthly',
        amountIls: 200,
    });
    assert.equal(a, b);
    assert.notEqual(a, billing.buildUpgradeOperationKey({
        tenantId: null,
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '1500',
        billingInterval: 'monthly',
        amountIls: 201,
    }));
});

test('saved-card upgrade charges once then retry recovers without second provider charge', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    const origDecrypt = secrets.decryptSecret;
    secrets.decryptSecret = () => 'token';

    try {
        const first = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(first.ok, true);
        assert.equal(first.charged, true);
        assert.equal(chargeStub.getCalls(), 1);
        assert.equal(billing.getChargeProviderCallCountForTests(), 1);
        assert.equal(poolMock.state.verifications.length, 1);

        poolMock.state.billingRow.platform_id = 'site_app';
        poolMock.state.billingRow.resource_id = 'basic';
        poolMock.state.billingRow.signing_id = '500';

        const second = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(second.ok, true);
        assert.equal(second.recovered, true);
        assert.equal(second.charged, false);
        assert.equal(chargeStub.getCalls(), 1);
        assert.equal(billing.getChargeProviderCallCountForTests(), 1);
        assert.equal(poolMock.state.billingRow.resource_id, 'pro');
        assert.equal(poolMock.state.billingRow.signing_id, '1500');
        assert.equal(poolMock.state.intents.filter(row => row.status === 'succeeded').length, 1);
    } finally {
        secrets.decryptSecret = origDecrypt;
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('failed charge allows a fresh provider charge on retry', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    let calls = 0;
    billing.setChargeTakbullTokenForTests(async () => {
        calls += 1;
        return {
            ok: false,
            internalDescription: 'declined',
            internalCode: 1,
            transactionInternalNumber: `fail-${calls}`,
        };
    });
    const origDecrypt = secrets.decryptSecret;
    secrets.decryptSecret = () => 'token';

    try {
        const first = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(first.ok, false);
        assert.equal(calls, 1);

        billing.setChargeTakbullTokenForTests(async () => {
            calls += 1;
            return {
                ok: true,
                transactionInternalNumber: `ok-${calls}`,
                token: null,
            };
        });

        const second = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(second.ok, true);
        assert.equal(second.charged, true);
        assert.equal(calls, 2);
        assert.equal(billing.getChargeProviderCallCountForTests(), 2);
    } finally {
        billing.setChargeTakbullTokenForTests(null);
        secrets.decryptSecret = origDecrypt;
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('concurrent upgrade requests produce at most one provider charge', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    const origDecrypt = secrets.decryptSecret;
    secrets.decryptSecret = () => 'token';

    try {
        const [a, b] = await Promise.all([
            billing.chargeSavedCard(upgradeArgs()),
            billing.chargeSavedCard(upgradeArgs()),
        ]);
        assert.ok(a.ok || b.ok);
        assert.equal(chargeStub.getCalls(), 1);
        assert.equal(billing.getChargeProviderCallCountForTests(), 1);
        assert.equal(poolMock.state.billingRow.resource_id, 'pro');
    } finally {
        secrets.decryptSecret = origDecrypt;
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('an uncertain provider response keeps a committed reservation and blocks a second charge', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    let calls = 0;
    billing.setChargeTakbullTokenForTests(async () => { calls++; throw Error('SYNTHETIC_PROVIDER_TIMEOUT'); });
    try {
        await assert.rejects(billing.chargeSavedCard(upgradeArgs()), /SYNTHETIC_PROVIDER_TIMEOUT/);
        assert.equal(poolMock.state.intents.length, 1);
        assert.equal(poolMock.state.intents[0].status, 'pending');
        assert.equal(poolMock.state.intents[0].takbull_transaction_id, null);
        const retry = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(retry.pending, true);
        assert.equal(retry.charged, false);
        assert.equal(calls, 1);
        assert.equal(billing.getChargeProviderCallCountForTests(), 1);
        assert.equal(poolMock.state.billingRow.resource_id, 'basic');
    } finally {
        billing.setChargeTakbullTokenForTests(null);
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('a recorded provider transaction is independently verified on recovery instead of charging again', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    const verified = verifier.verifyChargedTransaction;
    verifier.verifyChargedTransaction = async () => { throw Error('SYNTHETIC_VERIFICATION_UNAVAILABLE'); };
    try {
        await assert.rejects(billing.chargeSavedCard(upgradeArgs()), /SYNTHETIC_VERIFICATION_UNAVAILABLE/);
        assert.equal(poolMock.state.intents.length, 1);
        assert.equal(poolMock.state.intents[0].status, 'pending');
        assert.ok(poolMock.state.intents[0].takbull_transaction_id);
        assert.equal(poolMock.state.billingRow.resource_id, 'basic');
        verifier.verifyChargedTransaction = verified;
        const recovered = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(recovered.finalizedPending, true);
        assert.equal(recovered.charged, false);
        assert.equal(chargeStub.getCalls(), 1);
        assert.equal(poolMock.state.verifications.length, 1);
        assert.equal(poolMock.state.intents[0].status, 'succeeded');
        assert.equal(poolMock.state.billingRow.resource_id, 'pro');
    } finally {
        verifier.verifyChargedTransaction = verified;
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('historical succeeded intent for a different package is not reused', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    const origDecrypt = secrets.decryptSecret;
    secrets.decryptSecret = () => 'token';

    const oldKey = billing.buildUpgradeOperationKey({
        tenantId: null,
        platformId: 'site_app',
        resourceId: 'enterprise',
        signingId: '5000',
        billingInterval: 'monthly',
        amountIls: 500,
    });

    poolMock.state.intents.push({
        id: crypto.randomUUID(),
        kind: 'upgrade',
        status: 'succeeded',
        amount_ils: 500,
        order_reference: 'lw-old',
        package_snapshot: {
            platformId: 'site_app',
            resourceId: 'enterprise',
            signingId: '5000',
            billingInterval: 'monthly',
            upgradeOperationKey: oldKey,
        },
        takbull_transaction_id: 'old-txn',
        settled_at: new Date(),
        created_at: new Date(),
    });

    try {
        const result = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(result.ok, true);
        assert.equal(result.charged, true);
        assert.equal(chargeStub.getCalls(), 1);
    } finally {
        secrets.decryptSecret = origDecrypt;
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('already-applied package returns success without charging', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    poolMock.state.billingRow.platform_id = 'site_app';
    poolMock.state.billingRow.resource_id = 'pro';
    poolMock.state.billingRow.signing_id = '1500';

    try {
        const result = await billing.chargeSavedCard(upgradeArgs());
        assert.equal(result.ok, true);
        assert.equal(result.alreadyApplied, true);
        assert.equal(chargeStub.getCalls(), 0);
        assert.equal(billing.getChargeProviderCallCountForTests(), 0);
    } finally {
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('savePackage retry after PACKAGE_PERSIST passes upgradeOperation and avoids duplicate charge stub', async () => {
    const stubs = {
        ensureBillingRow: billing.ensureBillingRow,
        getBillingRow: billing.getBillingRow,
        getActiveCard: billing.getActiveCard,
        chargeSavedCard: billing.chargeSavedCard,
        updateBilling: billing.updateBilling,
        syncTenantSubscription: billing.syncTenantSubscription,
        getBillingSnapshot: billing.getBillingSnapshot,
    };

    const baseRow = {
        platformId: 'site_app',
        resourceId: 'basic',
        signingId: '500',
        billingInterval: 'monthly',
        billingEnabled: true,
        status: 'active',
        complimentaryUntil: '2020-01-01T00:00:00.000Z',
    };

    let chargeCalls = 0;
    let lastUpgradeOp = null;
    let persistFails = true;

    billing.ensureBillingRow = async () => ({ ...baseRow });
    billing.getBillingRow = async () => ({ ...baseRow });
    billing.getActiveCard = async () => ({ tokenEncrypted: 'enc' });
    billing.chargeSavedCard = async (args) => {
        chargeCalls += 1;
        lastUpgradeOp = args.upgradeOperation;
        if (chargeCalls === 1) {
            return { ok: true, charged: true, snapshot: { status: 'active' } };
        }
        return { ok: true, recovered: true, charged: false, snapshot: { status: 'active' } };
    };
    billing.updateBilling = async () => {
        if (persistFails) throw new Error('sync down');
    };
    billing.syncTenantSubscription = async () => {};
    billing.getBillingSnapshot = async () => ({ status: 'active', package: { total: 200 } });

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
        assert.equal(chargeCalls, 1);
        assert.ok(lastUpgradeOp?.targetPackage);
        assert.equal(lastUpgradeOp.targetPackage.resourceId, 'pro');

        persistFails = false;
        const retry = await billing.savePackage({
            platformId: 'site_app',
            resourceId: 'pro',
            signingId: '1500',
            usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
        });
        assert.equal(chargeCalls, 2);
        assert.equal(retry.recovered, true);
        assert.equal(retry.charged, false);
    } finally {
        Object.assign(billing, stubs);
    }
});

test('repeated retries after paid-unapplied state still produce only one total charge', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    const origDecrypt = secrets.decryptSecret;
    secrets.decryptSecret = () => 'token';

    try {
        await billing.chargeSavedCard(upgradeArgs());
        poolMock.state.billingRow.platform_id = 'site_app';
        poolMock.state.billingRow.resource_id = 'basic';
        poolMock.state.billingRow.signing_id = '500';

        await billing.chargeSavedCard(upgradeArgs());
        await billing.chargeSavedCard(upgradeArgs());
        assert.equal(chargeStub.getCalls(), 1);
        assert.equal(billing.getChargeProviderCallCountForTests(), 1);
    } finally {
        secrets.decryptSecret = origDecrypt;
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('an existing pending intent without a known outcome remains reserved across retries', async () => {
    billing.resetChargeProviderCallCountForTests();
    const poolMock = createBillingPoolMock();
    const chargeStub = installChargeStub();
    const origDecrypt = secrets.decryptSecret;
    secrets.decryptSecret = () => 'token';

    const operationKey = billing.buildUpgradeOperationKey({
        tenantId: null,
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '1500',
        billingInterval: 'monthly',
        amountIls: 200,
    });

    poolMock.state.intents.push({
        id: crypto.randomUUID(),
        kind: 'upgrade',
        status: 'pending',
        amount_ils: 200,
        order_reference: 'lw-upgrade-pendingreuse',
        package_snapshot: {
            platformId: 'site_app',
            resourceId: 'pro',
            signingId: '1500',
            billingInterval: 'monthly',
            upgradeOperationKey: operationKey,
        },
        takbull_transaction_id: null,
        created_at: new Date(),
    });

    try {
        const result = await billing.chargeSavedCard(upgradeArgs());
        const repeated = await billing.chargeSavedCard(upgradeArgs());
        for (const outcome of [result, repeated]) {
            assert.equal(outcome.ok, false);
            assert.equal(outcome.pending, true);
            assert.equal(outcome.charged, false);
            assert.equal(outcome.intentId, poolMock.state.intents[0].id);
        }
        assert.equal(chargeStub.getCalls(), 0);
        assert.equal(billing.getChargeProviderCallCountForTests(), 0);
        assert.equal(poolMock.state.intents.filter((i) => i.status === 'pending').length, 1);
        assert.equal(poolMock.state.billingRow.resource_id, 'basic');
    } finally {
        secrets.decryptSecret = origDecrypt;
        chargeStub.restore();
        poolMock.restore();
        billing.resetChargeProviderCallCountForTests();
    }
});

test('complimentary interval-only savePackage does not pass upgradeOperation to charge', async () => {
    const stubs = {
        ensureBillingRow: billing.ensureBillingRow,
        getBillingRow: billing.getBillingRow,
        getActiveCard: billing.getActiveCard,
        chargeSavedCard: billing.chargeSavedCard,
        updateBilling: billing.updateBilling,
        syncTenantSubscription: billing.syncTenantSubscription,
        getBillingSnapshot: billing.getBillingSnapshot,
    };

    let chargeCalled = false;
    billing.ensureBillingRow = async () => ({
        platformId: 'site_app',
        resourceId: 'basic',
        signingId: '500',
        billingInterval: 'monthly',
        billingEnabled: true,
        status: 'complimentary',
        complimentaryUntil: '2099-01-01T00:00:00.000Z',
    });
    billing.getBillingRow = billing.ensureBillingRow;
    billing.getActiveCard = async () => ({ tokenEncrypted: 'enc' });
    billing.chargeSavedCard = async () => {
        chargeCalled = true;
        return { ok: true };
    };
    billing.updateBilling = async () => {};
    billing.syncTenantSubscription = async () => {};
    billing.getBillingSnapshot = async () => ({ status: 'complimentary' });

    try {
        await billing.savePackage({
            platformId: 'site_app',
            resourceId: 'basic',
            signingId: '500',
            billingInterval: 'monthly',
            usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } },
        });
        assert.equal(chargeCalled, false);
    } finally {
        Object.assign(billing, stubs);
    }
});

for (const mode of ['pending', 'atomic']) {
    test(`savePackage ${mode === 'pending' ? 'blocks fallback checkout for an unresolved payment' : 'does not persist an already atomic upgrade a second time'}`, async () => {
        const names = ['ensureBillingRow', 'getBillingRow', 'getActiveCard', 'chargeSavedCard',
            'createCheckout', 'updateBilling', 'syncTenantSubscription', 'getBillingSnapshot'];
        const originals = Object.fromEntries(names.map(name => [name, billing[name]]));
        const row = {
            platformId: 'site_app', resourceId: 'basic', signingId: '500', billingInterval: 'monthly',
            billingEnabled: true, status: 'active', complimentaryUntil: '2020-01-01T00:00:00.000Z',
        };
        const snapshot = { status: 'active', package: { platformId: 'site_app', resourceId: 'pro', signingId: '1500' } };
        const calls = { charge: 0, checkout: 0, persist: 0, subscription: 0, snapshot: 0 };
        billing.ensureBillingRow = async () => row;
        billing.getBillingRow = async () => row;
        billing.getActiveCard = async () => ({ tokenEncrypted: 'synthetic-card' });
        billing.chargeSavedCard = async () => {
            calls.charge++;
            return mode === 'pending' ? { ok: false, pending: true, charged: false }
                : { ok: true, charged: true, appliedAtomically: true, snapshot };
        };
        billing.createCheckout = async () => { calls.checkout++; throw Error('UNEXPECTED_SECOND_PAYMENT'); };
        billing.updateBilling = async () => { calls.persist++; throw Error('UNEXPECTED_SECOND_PACKAGE_PERSIST'); };
        billing.syncTenantSubscription = async () => { calls.subscription++; throw Error('UNEXPECTED_SECOND_SUBSCRIPTION_PERSIST'); };
        billing.getBillingSnapshot = async () => { calls.snapshot++; return snapshot; };
        try {
            const operation = billing.savePackage({ platformId: 'site_app', resourceId: 'pro', signingId: '1500',
                usage: { documents: { createdThisMonth: 0 }, seats: { used: 1 }, storage: { bytesTotal: 0 } } });
            if (mode === 'pending') await assert.rejects(operation, { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
            else {
                const result = await operation;
                assert.equal(result.saved, true);
                assert.equal(result.charged, true);
                assert.equal(result.snapshot, snapshot);
            }
            assert.deepEqual(calls, { charge: 1, checkout: 0, persist: 0, subscription: 0, snapshot: 0 });
        } finally { Object.assign(billing, originals); }
    });
}

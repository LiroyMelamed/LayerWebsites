'use strict';

// Exercise real billing SQL against disposable PostgreSQL, with provider reads,
// charges, email and signup provisioning replaced at their module boundaries.
// By default, PGlite leases serialize transactions like a pg pool with max=1.
// BILLING_TEST_POSTGRES=1 uses the fixed disposable localhost QA database and a
// real multi-connection pool, including the actual PostgreSQL account/advisory
// locks. It never imports application DB configuration or environment files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

const OFFICE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SETUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AT = new Date('2026-11-01T12:00:00Z');
const filename = path.join(__dirname, '../lib/billing/firmBillingService.js');
const localRequire = createRequire(filename);

async function testDatabase(t) {
    if (process.env.BILLING_TEST_POSTGRES !== '1') {
        const db = new PGlite();
        t.after(() => db.close());
        return { db, postgres: false };
    }
    const { Pool } = require('pg');
    const connection = { host: '127.0.0.1', port: 55449, user: 'billing_qa',
        database: 'billing_card_setup_qa', ssl: false, connectionTimeoutMillis: 3000 };
    const admin = new Pool({ ...connection, max: 1 });
    const schema = 'card_setup_' + crypto.randomUUID().replaceAll('-', '');
    await admin.query(`CREATE SCHEMA ${schema}`);
    const raw = new Pool({ ...connection, max: 8, options: `-c search_path=${schema}` });
    const db = { query: raw.query.bind(raw), exec: raw.query.bind(raw), connect: raw.connect.bind(raw) };
    t.after(async () => {
        await raw.end();
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
    });
    return { db, postgres: true };
}

async function fixture(t, { tenantId = null, mode = 'success', status = 'past_due', amount = 1353,
    renewsAt = '2026-10-01T12:00:00Z', complimentaryUntil = null, billingEnabled = true,
    autoRenew = true, interval = 'monthly', signup = false } = {}) {
    let currentNow = new Date(AT);
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [currentNow])); }
        static now() { return +currentNow; }
    }
    const { db, postgres } = await testDatabase(t);
    await db.exec(`
        CREATE TABLE firm_billing(id integer PRIMARY KEY,law_firm_tenant_id uuid UNIQUE,
            platform_id text,resource_id text,signing_id text,price_monthly_ils numeric,
            billing_interval text,status text,billing_enabled boolean,auto_renew boolean,
            complimentary_until timestamptz,renews_at timestamptz,grace_until timestamptz,
            last_payment_error text,last_failed_at timestamptz,last_paid_at timestamptz,
            updated_at timestamptz DEFAULT now());
        CREATE TABLE firm_payment_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,kind text,status text,
            amount_ils numeric,currency text DEFAULT 'ILS',purpose text,order_reference text UNIQUE,
            takbull_uniq_id text,takbull_transaction_id text,signup_intent_id uuid,signup_cycle_at timestamptz,
            package_snapshot jsonb DEFAULT '{}'::jsonb,error_message text,settled_at timestamptz,
            created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
        CREATE TABLE firm_payment_methods(id serial PRIMARY KEY,law_firm_tenant_id uuid,provider text,
            token_encrypted text,last4 text,exp_month text,exp_year text,card_brand text,is_active boolean,
            updated_at timestamptz DEFAULT now());
        CREATE TABLE firm_payment_events(id serial PRIMARY KEY,intent_id uuid,event_type text,payload jsonb);
        CREATE TABLE users(userid integer PRIMARY KEY,law_firm_tenant_id uuid,name text,email text,
            phonenumber text,role text);
        CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,owner_user_id integer);
        CREATE TABLE tenant_subscriptions(tenant_id integer PRIMARY KEY,plan_key text,status text,
            starts_at timestamptz,updated_at timestamptz,created_at timestamptz);
        CREATE TABLE signup_intents(id uuid,law_firm_tenant_id uuid,status text,consent_version text,
            recurring_amount_ils numeric);
        CREATE TABLE synthetic_notice(intent_id uuid PRIMARY KEY,amount_ils numeric);
    `);
    await db.query(`INSERT INTO firm_billing(id,law_firm_tenant_id,platform_id,resource_id,signing_id,
        price_monthly_ils,billing_interval,status,billing_enabled,auto_renew,complimentary_until,renews_at,
        grace_until,last_payment_error,last_failed_at)
        VALUES(1,$1,'site','basic','none',$2,$3,$4,$5,$6,$7,$8,'2026-11-02T12:00:00Z','original failure','2026-10-31T12:00:00Z')`,
    [tenantId, amount, interval, status, billingEnabled, autoRenew, complimentaryUntil, renewsAt]);
    await db.query(`INSERT INTO users VALUES(91,$1,'Synthetic owner','owner@example.invalid','0500000000','Admin')`, [tenantId]);
    if (tenantId) await db.query('INSERT INTO law_firm_tenants VALUES($1,91)', [tenantId]);
    await db.query(`INSERT INTO firm_payment_methods(law_firm_tenant_id,provider,token_encrypted,last4,is_active)
        VALUES($1,'takbull','enc:v1:old-card','0000',true)`, [tenantId]);
    await db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,
        order_reference,takbull_uniq_id,signup_intent_id,package_snapshot)
        VALUES($1,$2,'setup','pending',1,'setup-order','hosted-setup',$3,$4)`,
    [SETUP, tenantId, signup ? crypto.randomUUID() : null,
        JSON.stringify({ platformId: 'site_app', resourceId: 'enterprise', signingId: 'unlimited', billingInterval: 'yearly' })]);
    await db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,
        order_reference) VALUES($1,$2,'renewal','pending',999,'other-office-order')`, [FOREIGN, OTHER]);

    // No external query can escape or reuse an active transaction.
    let tail = Promise.resolve();
    const lease = async () => {
        const before = tail;
        let release;
        tail = new Promise(resolve => { release = resolve; });
        await before;
        return release;
    };
    const trace = [];
    const query = async (sql, params) => {
        if (!postgres && /pg_advisory_xact_lock/.test(sql)) return { rows: [{}], rowCount: 1 };
        const result = await db.query(sql, params);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    const pool = {
        async connect() {
            if (postgres) {
                const client = await db.connect();
                return { query: async (sql, params) => { trace.push(String(sql)); return client.query(sql, params); },
                    release: () => client.release() };
            }
            const unlock = await lease();
            return { query: async (sql, params) => { trace.push(String(sql)); return query(sql, params); }, release: unlock };
        },
        async query(sql, params) {
            if (postgres) { trace.push(String(sql)); return query(sql, params); }
            const unlock = await lease();
            try { trace.push(String(sql)); return await query(sql, params); }
            finally { unlock(); }
        },
    };
    const charges = [], hosted = [], reads = [], notices = [], dispatchAccounts = [], emails = [], signups = [];
    const hostedOrders = new Map();
    let credentialsEnabled = true;
    let missingToken = false, verificationFailure = false, chargeVerificationFailure = false, chargeMode = mode;
    const charge = async input => {
        charges.push(input);
        // The durable reservation and successful setup must be committed before
        // reaching the provider, while the unpaid account still retains its debt.
        dispatchAccounts.push((await db.query('SELECT * FROM firm_billing WHERE id=1')).rows[0]);
        const reserved = (await db.query("SELECT * FROM firm_payment_intents WHERE kind<>'setup' AND law_firm_tenant_id IS NOT DISTINCT FROM $1", [tenantId])).rows;
        assert.equal(reserved.filter(row => row.status === 'pending').length, 1);
        if (chargeMode === 'timeout') throw Error('SYNTHETIC_TIMEOUT');
        if (chargeMode === 'malformed') return {};
        if (chargeMode === 'ambiguous') return { ok: false, internalCode: 99, definitiveFailure: false };
        if (chargeMode === 'decline') return { ok: false, internalCode: 5, definitiveFailure: true, internalDescription: 'SYNTHETIC_DECLINE' };
        return { ok: true, transactionInternalNumber: 'charged-transaction-' + charges.length,
            document: { created: true, id: 'synthetic-document', uniqId: 'synthetic-document-uniq', number: 'T-123', deliveryStatus: 'unknown' } };
    };
    const verifyHostedPayment = async (_credentials, reference, order, expected, _fetcher, requireToken) => {
        reads.push({ kind: 'hosted', reference, order, expected, requireToken });
        if (verificationFailure) throw Error('SYNTHETIC_VERIFICATION_FAILURE');
        if (reference === 'hosted-setup') {
            assert.equal(order, 'setup-order'); assert.equal(expected, 1); assert.equal(requireToken, true);
            return { transactionId: 'verified-setup-transaction', tokenInfo: missingToken ? null : { token: 'verified-card', last4Digits: '1234' } };
        }
        const hostedOrder = hostedOrders.get(reference);
        assert.ok(hostedOrder?.paid, 'Only independently confirmed hosted orders can settle');
        assert.equal(order, hostedOrder.orderReference); assert.equal(expected, hostedOrder.amount);
        assert.equal(requireToken, false);
        return { transactionId: 'verified-' + reference, tokenInfo: null };
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, Buffer, URL, Date: Clock, setTimeout, clearTimeout,
        process: { env: { NODE_ENV: 'test', MULTI_TENANT_MODE: tenantId ? 'true' : 'false' } },
        console: { warn() {}, error() {}, log() {} },
        require(name) {
            if (name === '../../config/db') return pool;
            if (name === './secrets') return { encryptSecret: value => 'enc:v1:' + value, decryptSecret: value => value.replace(/^enc:v1:/, '') };
            if (name === './billingEmails') return { sendFailedPaymentEmails: async input => { emails.push(input); } };
            if (name === '../tenant/tenantContext') return { getCurrentTenantId: () => tenantId };
            if (name === './selfServiceRenewal') return { signupRenewal: { renew: async () => ({ handled: false }) } };
            if (name === '../tenant/signupService') return { completeSignupFromPaymentIntent: async (id, token) => { signups.push({ id, token }); return { synthetic: true }; } };
            if (name === '../payments/verifySignupPayment') return {
                verifyHostedPayment,
                verifySignupPayment: (...args) => verifyHostedPayment(...args.slice(0, 3), 1, undefined, true),
                verifyChargedTransaction: async (_credentials, transaction, expected) => {
                    reads.push({ kind: 'charge', transaction, expected });
                    if (verificationFailure || chargeVerificationFailure) throw Error('SYNTHETIC_VERIFICATION_FAILURE');
                    assert.ok(transaction.startsWith('charged-transaction-')); assert.equal(expected, charges[0].amount);
                    return true;
                },
            };
            if (name === '../systemMessages') return { enqueuePaymentReceived: async (client, { intent }) => {
                notices.push(intent.id); assert.notEqual(intent.kind, 'setup');
                await client.query('INSERT INTO synthetic_notice VALUES($1,$2) ON CONFLICT DO NOTHING', [intent.id, intent.amount_ils]);
            } };
            if (name === '../payments/takbullClient') return {
                getTakbullCredentialsFromEnv: () => credentialsEnabled ? { apiKey: 'synthetic', apiSecret: 'synthetic' } : null,
                getTakbullMode: () => 'test', resolveSetupAmountIls: () => 1, chargeTakbullToken: charge,
                createTakbullPaymentPage: async input => {
                    hosted.push(input); const uniqId = 'new-page-' + hosted.length;
                    hostedOrders.set(uniqId, { ...input, paid: false });
                    return { uniqId, redirectUrl: 'https://synthetic.invalid/checkout' };
                },
                validateTakbullNotification: async (_credentials, reference) => ({ ok: true,
                    paid: reference === 'hosted-setup' || hostedOrders.get(reference)?.paid === true,
                    token: 'untrusted-callback-card', raw: { TransactionId: 'untrusted-callback-id' } }),
                extractTokenFromValidated: () => null,
            };
            return localRequire(name);
        },
    }, { filename });
    const billing = module.exports;
    return { db, pool, billing, trace, charges, hosted, reads, notices, dispatchAccounts, emails, signups,
        setMode(value) { chargeMode = value; },
        setCredentials(value) { credentialsEnabled = value; },
        markHostedPaid(reference) { assert.ok(hostedOrders.has(reference)); hostedOrders.get(reference).paid = true; },
        missingToken(value) { missingToken = value; },
        failVerification(value) { verificationFailure = value; },
        failChargeVerification(value) { chargeVerificationFailure = value; },
        advanceTo(value) { currentNow = new Date(value); },
        intent: async () => (await pool.query('SELECT * FROM firm_payment_intents WHERE id=$1', [SETUP])).rows[0],
        notify: () => billing.handleTakbullNotification({ uniqId: 'hosted-setup' }),
        state: async () => ({
            account: (await pool.query('SELECT * FROM firm_billing WHERE id=1')).rows[0],
            intents: (await pool.query('SELECT * FROM firm_payment_intents ORDER BY created_at,id')).rows,
            cards: (await pool.query('SELECT * FROM firm_payment_methods ORDER BY id')).rows,
            events: (await pool.query('SELECT * FROM firm_payment_events ORDER BY id')).rows,
            notices: (await pool.query('SELECT * FROM synthetic_notice')).rows,
        }),
    };
}

function debtFields(row) {
    return { status: row.status, renewsAt: String(row.renews_at), grace: String(row.grace_until),
        lastPaid: String(row.last_paid_at), monthly: Number(row.price_monthly_ils),
        platform: row.platform_id, resource: row.resource_id, signing: row.signing_id,
        interval: row.billing_interval, autoRenew: row.auto_renew };
}

for (const tenantId of [null, OFFICE]) {
    test(`${tenantId ? 'scoped legacy' : 'dedicated legacy'} card save collects the stored debt once, separately from ₪1`, async t => {
        const f = await fixture(t, { tenantId });
        const before = await f.state();
        await f.notify();
        assert.equal(f.charges.length, 1); assert.equal(f.charges[0].amount, 1353);
        assert.equal(f.charges[0].cardExternalToken, 'verified-card');
        assert.equal(f.charges[0].customerEmail, 'owner@example.invalid');
        assert.deepEqual(debtFields(f.dispatchAccounts[0]), debtFields(before.account), 'Setup cannot activate, reprice or renew the unpaid subscription');
        const paid = await f.state();
        assert.equal(paid.account.status, 'active'); assert.ok(+paid.account.renews_at > +AT);
        assert.equal(Number(paid.account.price_monthly_ils), 1353); assert.equal(paid.account.platform_id, 'site');
        assert.equal(paid.account.grace_until, null); assert.equal(paid.notices.length, 1);
        assert.equal(paid.intents.find(row => row.id === FOREIGN).status, 'pending');
        const collected = paid.intents.find(row => row.kind !== 'setup' && row.id !== FOREIGN);
        assert.equal(collected.status, 'succeeded'); assert.equal(collected.package_snapshot.cardSetupIntentId, SETUP);
        assert.equal(paid.events.filter(row => row.event_type === 'card_verified').length, 1);
        assert.equal(paid.events.filter(row => row.event_type === 'payment_succeeded').length, 1);
        await f.notify(); await f.billing.handleTakbullReturn({ intentId: SETUP });
        await f.billing.chargeSavedCard({ kind: 'retry' });
        assert.equal(f.charges.length, 1); assert.equal((await f.state()).notices.length, 1);
    });
}

for (const options of [
    { amount: 0 },
    { status: 'active', renewsAt: '2026-12-01T12:00:00Z' },
    { status: 'complimentary', complimentaryUntil: '2026-12-01T12:00:00Z' },
    { billingEnabled: false },
    { autoRenew: false, status: 'active', renewsAt: '2026-10-01T12:00:00Z' },
]) {
    test(`card verification leaves nonbillable subscription unchanged: ${JSON.stringify(options)}`, async t => {
        const f = await fixture(t, options);
        await f.billing.getBillingSnapshot(); // Normalize pre-existing complimentary/grace state.
        const before = await f.state();
        await f.notify(); const after = await f.state();
        assert.equal(f.charges.length, 0); assert.equal(after.notices.length, 0);
        assert.deepEqual(debtFields(after.account), debtFields(before.account));
        assert.equal(after.intents.find(row => row.id === SETUP).status, 'succeeded');
        assert.equal(after.cards.filter(row => row.is_active).length, 1);
        assert.equal(after.cards.find(row => row.is_active).last4, '1234');
    });
}

test('one definite decline retains debt/grace and callback replay never retries that setup attempt', async t => {
    const f = await fixture(t, { mode: 'decline', status: 'suspended' });
    const before = await f.state();
    await f.notify(); const failed = await f.state();
    assert.equal(f.charges.length, 1); assert.equal(failed.account.status, 'suspended');
    assert.equal(String(failed.account.grace_until), String(before.account.grace_until));
    assert.equal(String(failed.account.renews_at), String(before.account.renews_at));
    assert.equal(failed.account.last_paid_at, null); assert.equal(failed.notices.length, 0);
    assert.equal(failed.intents.find(row => row.id === SETUP).status, 'succeeded');
    assert.equal(failed.intents.filter(row => row.status === 'failed').length, 1);
    await f.notify(); assert.equal(f.charges.length, 1);
});

for (const mode of ['timeout', 'ambiguous', 'malformed']) {
    test(`${mode} charge outcome retains a reservation and prevents alternate charges or checkout`, async t => {
        const f = await fixture(t, { mode });
        const before = await f.state();
        await f.notify(); const unknown = await f.state();
        const reserved = unknown.intents.filter(row => row.kind !== 'setup' && row.id !== FOREIGN);
        assert.equal(reserved.length, 1); assert.equal(reserved[0].status, 'pending');
        assert.deepEqual(debtFields(unknown.account), debtFields(before.account));
        assert.equal(unknown.notices.length, 0);
        await f.notify(); await f.billing.chargeSavedCard({ kind: 'retry' });
        await assert.rejects(f.billing.createCheckout({ kind: 'retry' }), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
        assert.equal(f.charges.length, 1); assert.equal(f.hosted.length, 0);
    });
}

test('an existing unresolved payment survives setup and blocks a second collection', async t => {
    const f = await fixture(t);
    const existing = crypto.randomUUID();
    await f.pool.query(`INSERT INTO firm_payment_intents(id,kind,status,amount_ils,order_reference)
        VALUES($1,'renewal','pending',1353,'unresolved-original')`, [existing]);
    const before = await f.state(); await f.notify(); const after = await f.state();
    assert.equal(f.charges.length, 0);
    assert.equal(after.intents.find(row => row.id === existing).status, 'pending');
    assert.deepEqual(debtFields(after.account), debtFields(before.account));
});

test('concurrent setup callbacks, explicit retry and maintenance dispatch at most one subscription charge', async t => {
    const f = await fixture(t, { status: 'active', renewsAt: '2026-10-01T12:00:00Z' });
    await Promise.all([f.notify(), f.notify(), f.billing.chargeSavedCard({ kind: 'retry' }), f.billing.runBillingMaintenance({ now: AT })]);
    assert.equal(f.charges.length, 1);
    const after = await f.state();
    assert.equal(after.intents.filter(row => row.status === 'succeeded' && row.kind !== 'setup').length, 1);
    assert.equal(after.notices.length, 1);
});

test('unverified setup or missing trusted token cannot save a callback card or collect debt', async t => {
    const f = await fixture(t);
    const before = await f.state(); f.missingToken(true);
    await assert.rejects(f.notify(), /CARD_VERIFICATION_REQUIRED/);
    const after = await f.state();
    assert.equal(f.charges.length, 0); assert.deepEqual(after.cards, before.cards);
    assert.deepEqual(debtFields(after.account), debtFields(before.account));
    assert.equal(after.intents.find(row => row.id === SETUP).status, 'pending');
    f.missingToken(false); f.failVerification(true);
    await assert.rejects(f.notify(), /SYNTHETIC_VERIFICATION_FAILURE/);
    assert.equal(f.charges.length, 0);
});

test('initial signup payment provisions the signup without entering card debt collection', async t => {
    const f = await fixture(t, { signup: true });
    await f.billing.settleSuccessfulPayment({ intent: await f.intent(), transactionId: 'signup-transaction', tokenInfo: { token: 'signup-card' } });
    assert.equal(f.signups.length, 1); assert.equal(f.charges.length, 0);
    assert.equal(f.signups[0].id, SETUP);
});


test('a setup saved before the next bill cannot authorize that later bill when its callback replays', async t => {
    const f = await fixture(t, { status: 'active', renewsAt: '2026-12-01T12:00:00Z' });
    await f.notify();
    const first = await f.state();
    assert.equal(f.charges.length, 0);
    assert.equal(first.intents.find(row => row.id === SETUP).package_snapshot.cardCollectionDue, false);
    f.advanceTo('2026-12-02T12:00:00Z');
    await f.notify();
    assert.equal(f.charges.length, 0);
    assert.equal(String((await f.state()).account.renews_at), String(first.account.renews_at));
});

test('pre-fix succeeded setup without collection authorization cannot start a historical live bill', async t => {
    const f = await fixture(t);
    await f.pool.query("UPDATE firm_payment_intents SET status='succeeded' WHERE id=$1", [SETUP]);
    await f.notify();
    assert.equal(f.charges.length, 0);
    assert.equal((await f.state()).account.status, 'past_due');
});

test('a successful charge with unverifiable outcome remains reserved until its same transaction verifies', async t => {
    const f = await fixture(t); f.failChargeVerification(true);
    await f.notify();
    const pending = (await f.state()).intents.find(row => row.kind !== 'setup' && row.id !== FOREIGN);
    assert.equal(pending.status, 'pending'); assert.equal(pending.takbull_transaction_id, 'charged-transaction-1');
    assert.equal((await f.state()).account.status, 'past_due');
    await f.notify(); assert.equal(f.charges.length, 1);
    f.failChargeVerification(false); await f.notify();
    assert.equal(f.charges.length, 1); assert.equal((await f.state()).account.status, 'active');
    assert.equal((await f.state()).notices.length, 1);
});

test('setup settlement rejects a stored intent from a different office before saving its card', async t => {
    const f = await fixture(t, { tenantId: OFFICE });
    await f.pool.query('UPDATE firm_payment_intents SET law_firm_tenant_id=$2 WHERE id=$1', [SETUP, OTHER]);
    await assert.rejects(f.billing.settleSuccessfulPayment({ intent: await f.intent() }), /PAYMENT_INTENT_SCOPE_MISMATCH/);
    assert.equal(f.charges.length, 0); assert.equal((await f.state()).cards.length, 1);
});

test('a setup authorized for an unresolved old cycle cannot collect a different later cycle', async t => {
    const f = await fixture(t);
    const original = crypto.randomUUID();
    await f.pool.query(`INSERT INTO firm_payment_intents(id,kind,status,amount_ils,order_reference)
        VALUES($1,'renewal','pending',1353,'original-cycle')`, [original]);
    await f.notify(); assert.equal(f.charges.length, 0);
    // Model independent reconciliation of the first cycle and the next due date.
    await f.pool.query("UPDATE firm_payment_intents SET status='succeeded' WHERE id=$1", [original]);
    await f.pool.query("UPDATE firm_billing SET status='active',renews_at='2026-12-01T12:00:00Z',grace_until=null WHERE id=1");
    f.advanceTo('2026-12-02T12:00:00Z');
    await f.notify(); assert.equal(f.charges.length, 0);
});

test('hosted checkout racing setup collection reserves one payment route', async t => {
    const f = await fixture(t);
    const outcomes = await Promise.allSettled([f.notify(), f.billing.createCheckout({ kind: 'retry' })]);
    assert.ok(f.charges.length + f.hosted.length <= 1, 'Hosted and saved-card payment cannot both dispatch for the same debt');
    assert.equal(outcomes[0].status, 'fulfilled');
    if (outcomes[1].status === 'rejected') {
        assert.ok(['PAYMENT_RECONCILIATION_REQUIRED', 'NO_AMOUNT', 'PAYMENT_NOT_DUE'].includes(outcomes[1].reason.code));
    }
});

test('yearly debt collection uses its stored agreed monthly amount and existing annual rule', async t => {
    const f = await fixture(t, { amount: 100, interval: 'yearly' });
    await f.notify();
    assert.equal(f.charges.length, 1); assert.equal(f.charges[0].amount, 1080);
    const paid = await f.state();
    assert.equal(paid.account.billing_interval, 'yearly'); assert.equal(Number(paid.account.price_monthly_ils), 100);
    assert.ok(+paid.account.renews_at > +new Date('2027-10-31T12:00:00Z'));
});


for (const mode of ['timeout', 'success']) {
    test(`setup return reports actual payment result for an active account with due debt: ${mode}`, async t => {
        const f = await fixture(t, { status: 'active', mode });
        const result = await f.billing.handleTakbullReturn({ intentId: SETUP });
        assert.equal(result.cardVerified, true); assert.equal(result.paid, mode === 'success');
        assert.equal(result.redirectUrl.endsWith('?paid=' + (mode === 'success' ? '1' : '0')), true);
        assert.equal(result.snapshot.status, 'active', 'An active flag alone is not payment evidence');
        assert.equal(f.charges.length, 1);
        if (mode === 'timeout') {
            const reserved = (await f.state()).intents.find(row => row.kind !== 'setup' && row.id !== FOREIGN);
            assert.equal(reserved.status, 'pending'); assert.equal(result.snapshot.lastPaidAt, null);
        } else assert.ok(result.snapshot.lastPaidAt);
    });
}

test('browser cancellation preserves an uncertain hosted reservation; later confirmed payment settles once', async t => {
    const f = await fixture(t);
    const checkout = await f.billing.createCheckout({ kind: 'retry' });
    await f.billing.handleTakbullCancel({ intentId: checkout.intentId });
    let state = await f.state();
    assert.equal(state.intents.find(row => row.id === checkout.intentId).status, 'pending');
    assert.equal(state.account.status, 'past_due'); assert.equal(state.notices.length, 0);
    await assert.rejects(f.billing.createCheckout({ kind: 'retry' }), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
    const retry = await f.billing.chargeSavedCard({ kind: 'retry' });
    assert.equal(retry.pending, true); assert.equal(f.charges.length, 0); assert.equal(f.hosted.length, 1);
    f.markHostedPaid(checkout.uniqId);
    await f.billing.handleTakbullCancel({ intentId: checkout.intentId });
    state = await f.state();
    assert.equal(state.intents.find(row => row.id === checkout.intentId).status, 'succeeded');
    assert.equal(state.account.status, 'active'); assert.equal(state.notices.length, 1);
    const returned = await f.billing.handleTakbullReturn({ intentId: checkout.intentId });
    assert.equal(returned.paid, true); assert.equal(returned.cardVerified, false);
    assert.equal((await f.state()).notices.length, 1); assert.equal(f.charges.length, 0); assert.equal(f.hosted.length, 1);
});

for (const nonbillable of [{ amount: 0 }, { status: 'active', renewsAt: '2026-12-01T12:00:00Z' }]) {
    for (const missing of ['card', 'credentials']) {
        test(`a missing ${missing} cannot downgrade a nonbillable account: ${JSON.stringify(nonbillable)}`, async t => {
            const f = await fixture(t, nonbillable);
            if (missing === 'card') await f.pool.query('DELETE FROM firm_payment_methods');
            else f.setCredentials(false);
            const before = await f.state();
            const result = await f.billing.chargeSavedCard({ kind: 'retry' });
            assert.equal(result.skipped, true); assert.equal(f.charges.length, 0);
            assert.deepEqual(debtFields((await f.state()).account), debtFields(before.account));
            assert.equal((await f.state()).intents.length, before.intents.length);
        });
    }
}

test('setup blocked by an unrelated pending payment cannot retry it after its later decline', async t => {
    const f = await fixture(t);
    const original = crypto.randomUUID();
    await f.pool.query(`INSERT INTO firm_payment_intents(id,kind,status,amount_ils,order_reference)
        VALUES($1,'renewal','pending',1353,'unresolved-then-declined')`, [original]);
    await f.notify(); assert.equal(f.charges.length, 0);
    const blocked = (await f.state()).intents.find(row => row.id === SETUP);
    assert.equal(blocked.package_snapshot.cardCollectionDue, false);
    await f.pool.query("UPDATE firm_payment_intents SET status='failed' WHERE id=$1", [original]);
    await f.notify(); assert.equal(f.charges.length, 0);
    assert.equal((await f.state()).account.status, 'past_due');
});

test('provider document reference persists on the successful intent and history without assuming email delivery', async t => {
    const f = await fixture(t); await f.notify();
    const paid = (await f.state()).intents.find(row => row.kind !== 'setup' && row.id !== FOREIGN);
    assert.equal(paid.package_snapshot.providerDocument.id, 'synthetic-document');
    assert.equal(paid.package_snapshot.providerDocument.deliveryStatus, 'unknown');
    const history = await f.billing.listPaymentHistory();
    const document = history.find(row => row.id === paid.id).document;
    assert.equal(document.created, true); assert.equal(document.number, 'T-123');
    assert.equal(document.deliveryStatus, 'unknown');
    await f.notify();
    assert.equal(f.charges.length, 1);
    assert.deepEqual((await f.billing.listPaymentHistory()).find(row => row.id === paid.id).document, document);
});

test('expiry suspension after cancellation without an existing payment failure creates no debt on card save', async t => {
    const f = await fixture(t, { autoRenew: false, status: 'active' });
    await f.pool.query("UPDATE firm_billing SET last_failed_at=null,last_payment_error=null,grace_until='2026-10-04'");
    await f.notify();
    const state = await f.state();
    assert.equal(state.account.status, 'suspended');
    assert.equal(state.account.last_paid_at, null);
    assert.equal(f.charges.length, 0);
    assert.equal(state.intents.find(row => row.id === SETUP).package_snapshot.cardCollectionDue, false);
});

test('zero-price v2 agreement remains readable by plan, return and lock status snapshots', async t => {
    const f = await fixture(t, { tenantId: OFFICE, amount: 0 });
    await f.pool.query(`INSERT INTO signup_intents(id,law_firm_tenant_id,status,consent_version,recurring_amount_ils)
        VALUES($1,$2,'completed','signup-1ils-3months-v2',532)`, [crypto.randomUUID(), OFFICE]);
    const snap = await f.billing.getBillingSnapshot();
    assert.equal(snap.nextChargeIls, 0);
    const result = await f.billing.handleTakbullReturn({ intentId: SETUP });
    assert.equal(result.cardVerified, true);
    assert.equal(result.snapshot.nextChargeIls, 0);
    assert.equal(f.charges.length, 0);
});

for (const missing of ['card', 'credentials']) {
    test(`due debt with missing ${missing} returns explicit failed payment instead of success-shaped snapshot`, async t => {
        const f = await fixture(t, { status: 'active' });
        if (missing === 'card') await f.pool.query('DELETE FROM firm_payment_methods');
        else f.setCredentials(false);
        const result = await f.billing.chargeSavedCard({ kind: 'retry' });
        assert.equal(result.ok, false);
        assert.equal(result.charged, false);
        assert.equal(result.snapshot.status, 'past_due');
        assert.equal(f.charges.length, 0);
    });
}

'use strict';

// The real settlement SQL runs against disposable in-memory PostgreSQL. The
// provider and Central are replaced at their boundaries; no network is possible.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

const OFFICE_A = '11111111-1111-4111-8111-111111111111';
const OFFICE_B = '22222222-2222-4222-8222-222222222222';
const INTENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEIGHBOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const filename = path.join(__dirname, '../lib/billing/firmBillingService.js');
const localRequire = createRequire(filename);

async function fixture(t, { officeId = null, storedOfficeId = officeId, kind = 'renewal', packageSnapshot = null } = {}) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE TABLE firm_billing (
            id integer PRIMARY KEY, law_firm_tenant_id uuid UNIQUE,
            platform_id text, resource_id text, signing_id text, price_monthly_ils numeric,
            billing_interval text DEFAULT 'monthly', status text, billing_enabled boolean DEFAULT true,
            auto_renew boolean DEFAULT true, complimentary_until timestamptz, renews_at timestamptz,
            grace_until timestamptz, last_payment_error text, last_failed_at timestamptz,
            last_paid_at timestamptz, updated_at timestamptz DEFAULT now()
        );
        CREATE TABLE firm_payment_intents (
            id uuid PRIMARY KEY, law_firm_tenant_id uuid, kind text, status text,
            amount_ils numeric, currency text DEFAULT 'ILS', purpose text,
            order_reference text, takbull_uniq_id text, takbull_transaction_id text,
            signup_intent_id uuid, signup_cycle_at timestamptz, package_snapshot jsonb,
            error_message text, settled_at timestamptz, created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        CREATE TABLE firm_payment_events (
            id serial PRIMARY KEY, intent_id uuid, event_type text, payload jsonb
        );
        CREATE TABLE firm_payment_methods (
            id serial PRIMARY KEY, law_firm_tenant_id uuid, provider text,
            token_encrypted text, last4 text, exp_month integer, exp_year integer,
            card_brand text, is_active boolean, updated_at timestamptz DEFAULT now()
        );
        CREATE TABLE users (userid integer PRIMARY KEY, role text, law_firm_tenant_id uuid);
        CREATE TABLE tenant_subscriptions (
            tenant_id integer PRIMARY KEY, plan_key text, status text,
            starts_at timestamptz, updated_at timestamptz, created_at timestamptz
        );
        CREATE TABLE signup_intents (
            id uuid, law_firm_tenant_id uuid, status text, consent_version text,
            recurring_amount_ils numeric
        );
        CREATE TABLE synthetic_system_outbox (
            source_id uuid PRIMARY KEY, office_id uuid, amount_ils numeric, kind text
        );
    `);
    await db.query(`INSERT INTO firm_billing(id,law_firm_tenant_id,platform_id,resource_id,signing_id,
        price_monthly_ils,status,renews_at,grace_until,last_payment_error,last_failed_at)
        VALUES(1,$1,'site','basic','none',532,'past_due',now()-interval '1 month',now()+interval '1 day','prior failure',now())`, [officeId]);
    await db.query(`INSERT INTO users(userid,role,law_firm_tenant_id) VALUES(91,'Admin',$1)`, [officeId]);
    await db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,
        order_reference,package_snapshot) VALUES($1,$2,$3,'pending',$4,'synthetic-renewal',$5)`,
    [INTENT, storedOfficeId, kind, kind === 'setup' ? 1 : 532, packageSnapshot]);
    await db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,
        order_reference) VALUES($1,$2,'renewal','pending',532,'other-office')`, [NEIGHBOR, OFFICE_B]);

    const trace = [];
    const verification = [];
    let inTransaction = false;
    let failOutbox = false;
    let failAudit = false;
    let failVerification = false;
    let enqueueCalls = 0;
    const query = async (sql, params) => {
        const result = await db.query(sql, params);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    const client = {
        async query(sql, params) {
            const statement = String(sql).trim();
            trace.push({ channel: 'client', sql: statement });
            if (statement === 'BEGIN') inTransaction = true;
            if (failAudit && /INSERT INTO firm_payment_events/.test(statement)) throw Error('SYNTHETIC_AUDIT_FAILURE');
            const result = await query(sql, params);
            if (statement === 'COMMIT' || statement === 'ROLLBACK') inTransaction = false;
            return result;
        },
        release() { trace.push({ channel: 'release' }); },
    };
    const pool = {
        async query(sql, params) {
            assert.equal(inTransaction, false, 'A pool query escaped the active settlement transaction');
            trace.push({ channel: 'pool', sql: String(sql).trim() });
            return query(sql, params);
        },
        async connect() { trace.push({ channel: 'connect' }); return client; },
    };
    const core = {
        async enqueuePaymentReceived(target, { intent }) {
            assert.equal(target, client, 'The outbox must use the settlement client');
            assert.equal(inTransaction, true);
            assert.equal(intent.status, 'succeeded', 'Only the successful persisted transition can produce a notice');
            enqueueCalls++;
            // The real outbox excludes setup. A setup must not be interpreted as
            // subscription revenue even if the caller invokes this boundary.
            if (intent.kind === 'setup' || intent.signup_intent_id) return { skipped: true };
            await target.query(`INSERT INTO synthetic_system_outbox(source_id,office_id,amount_ils,kind)
                VALUES($1,$2,$3,'payment_received') ON CONFLICT(source_id) DO NOTHING`,
            [intent.id, intent.law_firm_tenant_id, intent.amount_ils]);
            if (failOutbox) throw Error('SYNTHETIC_OUTBOX_FAILURE');
        },
    };
    const verifier = {
        async verifyChargedTransaction(_credentials, transactionId, amount) {
            verification.push({ transactionId, amount, kind: 'saved' });
            if (failVerification) throw Error('SYNTHETIC_UNVERIFIED_PAYMENT');
            return true;
        },
        async verifyHostedPayment(_credentials, reference, expectedOrder, amount, _fetch, requireToken) {
            verification.push({ reference, expectedOrder, amount, requireToken, kind: 'hosted' });
            if (failVerification) throw Error('SYNTHETIC_UNVERIFIED_PAYMENT');
            return { transactionId: 'synthetic-transaction' };
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, Buffer, URL, Date, setTimeout, clearTimeout,
        process: { env: { NODE_ENV: 'test', MULTI_TENANT_MODE: officeId ? 'true' : 'false' } },
        console: { warn() {}, error() {}, log() {} },
        require(name) {
            if (name === '../../config/db') return pool;
            if (name === './secrets') return { encryptSecret: value => 'enc:v1:' + value, decryptSecret: value => value };
            if (name === './billingEmails') return { sendFailedPaymentEmails: async () => { throw Error('UNEXPECTED_EMAIL'); } };
            if (name === '../tenant/tenantContext') return { getCurrentTenantId: () => officeId };
            if (name === '../payments/verifySignupPayment') return verifier;
            if (name === '../systemMessages') return core;
            if (name === '../payments/takbullClient') return {
                getTakbullCredentialsFromEnv: () => ({ apiKey: 'synthetic', apiSecret: 'synthetic' }),
                getTakbullMode: () => 'test', resolveSetupAmountIls: () => 1,
                chargeTakbullToken: async () => { throw Error('UNEXPECTED_PAYMENT_DISPATCH'); },
            };
            return localRequire(name);
        },
    }, { filename });

    return {
        db, client, pool, billing: module.exports, trace, verification,
        get enqueueCalls() { return enqueueCalls; },
        failOutbox(value) { failOutbox = value; },
        failAudit(value) { failAudit = value; },
        failVerification(value) { failVerification = value; },
        async intent() { return (await db.query('SELECT * FROM firm_payment_intents WHERE id=$1', [INTENT])).rows[0]; },
        async state() {
            return {
                account: (await db.query('SELECT * FROM firm_billing WHERE id=1')).rows[0],
                intent: (await db.query('SELECT * FROM firm_payment_intents WHERE id=$1', [INTENT])).rows[0],
                audit: (await db.query('SELECT * FROM firm_payment_events')).rows,
                outbox: (await db.query('SELECT * FROM synthetic_system_outbox')).rows,
                neighbor: (await db.query('SELECT * FROM firm_payment_intents WHERE id=$1', [NEIGHBOR])).rows[0],
            };
        },
    };
}

test('verified settlement commits payment, package, audit and outbox once; replay is inert', async t => {
    const f = await fixture(t, { packageSnapshot: { platformId: 'site_app', resourceId: 'pro', signingId: '500', billingInterval: 'monthly' } });
    const intent = await f.intent();
    await f.billing.settleSuccessfulPayment({ intent, transactionId: 'synthetic-transaction' });
    const first = await f.state();
    assert.equal(first.intent.status, 'succeeded');
    assert.equal(first.account.status, 'active');
    assert.equal(first.account.resource_id, 'pro');
    assert.equal(first.account.last_payment_error, null);
    assert.equal(first.audit.filter(row => row.event_type === 'payment_succeeded').length, 1);
    assert.equal(first.outbox.length, 1);
    assert.equal(Number(first.outbox[0].amount_ils), 532);
    assert.equal(first.neighbor.status, 'pending', 'A separate office payment cannot be cancelled');
    assert.equal(f.verification.length, 1);
    await f.billing.settleSuccessfulPayment({ intent, transactionId: 'synthetic-transaction' });
    const replayed = await f.state();
    assert.equal(replayed.audit.length, first.audit.length);
    assert.equal(replayed.outbox.length, 1);
    assert.equal(+replayed.account.renews_at, +first.account.renews_at);
    assert.equal(f.enqueueCalls, 1);
    assert.equal(f.verification.length, 1);
});

test('outbox failure after insert rolls back the payment and package and permits one clean retry', async t => {
    const f = await fixture(t, { packageSnapshot: { platformId: 'site_app', resourceId: 'pro', signingId: '500' } });
    const before = await f.state();
    const intent = await f.intent();
    f.failOutbox(true);
    await assert.rejects(f.billing.settleSuccessfulPayment({ intent, transactionId: 'synthetic-transaction' }), /SYNTHETIC_OUTBOX_FAILURE/);
    const failed = await f.state();
    assert.equal(failed.intent.status, 'pending');
    assert.equal(failed.account.status, before.account.status);
    assert.equal(failed.account.resource_id, before.account.resource_id);
    assert.equal(+failed.account.renews_at, +before.account.renews_at);
    assert.equal(failed.audit.length, 0);
    assert.equal(failed.outbox.length, 0);
    f.failOutbox(false);
    await f.billing.settleSuccessfulPayment({ intent, transactionId: 'synthetic-transaction' });
    const recovered = await f.state();
    assert.equal(recovered.intent.status, 'succeeded');
    assert.equal(recovered.outbox.length, 1);
    assert.equal(recovered.audit.length, 1);
});

test('audit failure is transactional rather than silently losing the payment history', async t => {
    const f = await fixture(t);
    f.failAudit(true);
    await assert.rejects(f.billing.settleSuccessfulPayment({ intent: await f.intent(), transactionId: 'synthetic-transaction' }), /SYNTHETIC_AUDIT_FAILURE/);
    const state = await f.state();
    assert.equal(state.intent.status, 'pending');
    assert.equal(state.account.status, 'past_due');
    assert.equal(state.audit.length, 0);
    assert.equal(state.outbox.length, 0);
});

test('a provider verification failure cannot activate a subscription or enqueue a notice', async t => {
    const f = await fixture(t);
    f.failVerification(true);
    await assert.rejects(f.billing.settleSuccessfulPayment({ intent: await f.intent(), transactionId: 'synthetic-transaction' }), /SYNTHETIC_UNVERIFIED_PAYMENT/);
    const state = await f.state();
    assert.equal(state.intent.status, 'pending');
    assert.equal(state.account.status, 'past_due');
    assert.equal(state.outbox.length, 0);
});

test('one-shekel card setup does not create a subscription-payment notice', async t => {
    const f = await fixture(t, { kind: 'setup' });
    await f.billing.settleSuccessfulPayment({ intent: await f.intent(), transactionId: 'synthetic-transaction', tokenInfo: { token: 'synthetic-card' } });
    assert.equal((await f.state()).outbox.length, 0);
});

test('a hosted callback cannot inject a card token absent from the independently verified transaction', async t => {
    const f = await fixture(t);
    await f.db.query('UPDATE firm_payment_intents SET takbull_uniq_id=$2 WHERE id=$1', [INTENT, 'synthetic-hosted-order']);
    await f.billing.settleSuccessfulPayment({ intent: await f.intent(), transactionId: 'untrusted-callback-id',
        tokenInfo: { token: 'untrusted-callback-card' } });
    assert.equal((await f.state()).intent.takbull_transaction_id, 'synthetic-transaction');
    assert.equal((await f.db.query('SELECT * FROM firm_payment_methods')).rows.length, 0);
    assert.equal(f.verification.length, 1);
    assert.equal(f.verification[0].kind, 'hosted');
    assert.equal(f.verification[0].expectedOrder, 'synthetic-renewal');
    assert.equal(f.verification[0].requireToken, false);
});

test('persisted office ownership defeats a tampered intent object', async t => {
    const f = await fixture(t, { officeId: OFFICE_A, storedOfficeId: OFFICE_B });
    const forged = { ...await f.intent(), law_firm_tenant_id: OFFICE_A };
    await assert.rejects(f.billing.settleSuccessfulPayment({ intent: forged, transactionId: 'synthetic-transaction' }));
    const state = await f.state();
    assert.equal(state.intent.status, 'pending');
    assert.equal(state.account.status, 'past_due');
    assert.equal(state.outbox.length, 0);
    assert.equal(f.verification.length, 0, 'Foreign ownership must be rejected before a provider request');
});

test('an enclosing upgrade transaction owns commit and can roll back every settlement effect', async t => {
    const f = await fixture(t);
    await f.client.query('BEGIN');
    const result = await f.billing.settleSuccessfulPayment({ intent: await f.intent(), transactionId: 'synthetic-transaction', transactionClient: f.client });
    assert.equal(result, null);
    assert.equal(f.trace.filter(row => row.sql === 'COMMIT').length, 0);
    await f.client.query('ROLLBACK');
    const state = await f.state();
    assert.equal(state.intent.status, 'pending');
    assert.equal(state.account.status, 'past_due');
    assert.equal(state.audit.length, 0);
    assert.equal(state.outbox.length, 0);
});

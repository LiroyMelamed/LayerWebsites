'use strict';

// Exercise the actual renewal SQL in a disposable in-memory PostgreSQL. All
// payment, notification and configuration boundaries are synthetic and offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

const OFFICE = '11111111-1111-4111-8111-111111111111';
const OTHER_OFFICE = '22222222-2222-4222-8222-222222222222';
const SETUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_SETUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const filename = path.join(__dirname, '../lib/billing/selfServiceRenewal.js');
const localRequire = createRequire(filename);

async function fixture(t, { amount = 532, autoRenew = true, status = 'past_due' } = {}) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        SET TIME ZONE 'UTC';
        CREATE TABLE firm_billing (
            id integer PRIMARY KEY,law_firm_tenant_id uuid UNIQUE,
            billing_enabled boolean,auto_renew boolean,status text,
            price_monthly_ils numeric,billing_interval text,
            renews_at timestamptz,complimentary_until timestamptz,
            grace_until timestamptz,last_failed_at timestamptz,
            last_payment_error text,last_paid_at timestamptz,updated_at timestamptz
        );
        CREATE TABLE signup_intents (
            id uuid,law_firm_tenant_id uuid,status text,consent_version text,
            recurring_amount_ils numeric,admin_email text,admin_name text,admin_phone text
        );
        CREATE TABLE firm_payment_intents (
            id uuid PRIMARY KEY,law_firm_tenant_id uuid,kind text,status text,
            signup_intent_id uuid,signup_cycle_at timestamptz,amount_ils numeric,
            order_reference text,purpose text,package_snapshot jsonb NOT NULL DEFAULT '{}',
            takbull_transaction_id text,settled_at timestamptz,error_message text,
            created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
        );
        CREATE UNIQUE INDEX firm_signup_renewal_active_cycle_unique
            ON firm_payment_intents(law_firm_tenant_id,signup_cycle_at)
            WHERE signup_cycle_at IS NOT NULL AND status<>'failed';
        CREATE TABLE firm_payment_methods (law_firm_tenant_id uuid,token_encrypted text,is_active boolean);
        CREATE TABLE synthetic_notices (intent_id uuid PRIMARY KEY);
    `);
    await db.query(`INSERT INTO firm_billing VALUES(1,$1,true,$2,$3,$4,'monthly',
        '2026-10-01','2026-09-01','2026-10-04','2026-10-01','prior decline',null,now())`,
    [OFFICE, autoRenew, status, amount]);
    await db.query(`INSERT INTO signup_intents VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc',$1,
        'completed','signup-1ils-3months-v2',532,'owner@synthetic.invalid','Synthetic owner','0500000000')`, [OFFICE]);
    await db.query(`INSERT INTO firm_payment_methods VALUES($1,'synthetic-card',true)`, [OFFICE]);
    await db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils)
        VALUES($1,$2,'setup','succeeded',1),($3,$4,'setup','succeeded',1)`, [SETUP, OFFICE, OTHER_SETUP, OTHER_OFFICE]);
    await db.query(`UPDATE firm_payment_intents SET package_snapshot='{"cardCollectionDue":true,"cardCollectionCycleAt":"2026-10-01T00:00:00.000Z"}' WHERE id=$1`, [SETUP]);

    // PGlite has one connection; this mutex gives each BEGIN..COMMIT the same
    // exclusion that the account's FOR UPDATE gives independent PG clients.
    let tail = Promise.resolve();
    async function acquire() {
        const previous = tail;
        let release;
        tail = new Promise(resolve => { release = resolve; });
        await previous;
        return release;
    }
    const run = async (sql, params) => {
        const result = await db.query(sql, params);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    const database = {
        async query(sql, params) {
            const release = await acquire();
            try { return await run(sql, params); } finally { release(); }
        },
        async connect() {
            let release;
            return {
                async query(sql, params) {
                    const command = String(sql).trim();
                    if (command === 'BEGIN') release = await acquire();
                    try { return await run(sql, params); }
                    finally { if (command === 'COMMIT' || command === 'ROLLBACK') { release?.(); release = null; } }
                },
                release() { release?.(); release = null; },
            };
        },
    };
    let clock = new Date('2026-11-01T12:00:00Z');
    const successfulOutcome = (_input, sequence) => ({ ok: true, transactionInternalNumber: `synthetic-transaction-${sequence}`,
        document: { created: true, id: sequence === 1 ? 'synthetic-document' : `synthetic-document-${sequence}`,
            uniqId: null, number: String(122 + sequence), deliveryStatus: 'unknown' },
        raw: { cardToken: 'provider-raw-must-not-be-persisted' } });
    let outcome = successfulOutcome;
    let verificationFails = false;
    const calls = [], verified = [], dispatchAccounts = [];
    const successfulTransactions = new Map();
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, Date,
        require(name) {
            if (name === '../../config/db') return database;
            if (name === './secrets') return { decryptSecret: value => value };
            if (name === '../payments/takbullClient') return {
                getTakbullCredentialsFromEnv: () => ({ apiKey: 'synthetic', apiSecret: 'synthetic' }),
                chargeTakbullToken: async () => { throw Error('UNEXPECTED_DEFAULT_PROVIDER'); },
            };
            if (name === '../payments/verifySignupPayment') return { verifyChargedTransaction: async () => { throw Error('UNEXPECTED_DEFAULT_VERIFIER'); } };
            if (name === './tenantBillingDefaults') return { getPublicApiBaseUrl: () => 'https://synthetic.invalid' };
            if (name === '../systemMessages') return {
                enqueuePaymentReceived: (client, { intent }) => client.query('INSERT INTO synthetic_notices VALUES($1)', [intent.id]),
            };
            return localRequire(name);
        },
    }, { filename });
    const service = module.exports.createSignupRenewal({
        database, now: () => new Date(clock),
        credentials: () => ({ apiKey: 'synthetic', apiSecret: 'synthetic' }),
        charge: async input => {
            calls.push(input);
            dispatchAccounts.push((await db.query('SELECT * FROM firm_billing WHERE law_firm_tenant_id=$1', [OFFICE])).rows[0]);
            if (outcome instanceof Error) throw outcome;
            const result = typeof outcome === 'function' ? await outcome(input, calls.length) : outcome;
            if (result?.ok === true && result.transactionInternalNumber) {
                successfulTransactions.set(result.transactionInternalNumber, Number(input.amount));
            }
            return result;
        },
        verify: async (_credentials, transactionId, expectedAmount) => {
            verified.push({ transactionId, expectedAmount });
            assert.equal(successfulTransactions.has(transactionId), true, 'Only the dispatched synthetic transaction can verify');
            assert.equal(Number(expectedAmount), successfulTransactions.get(transactionId), 'Verify the exact dispatched amount');
            if (verificationFails) throw Error('SYNTHETIC_VERIFICATION_FAILURE');
        },
    });
    return {
        db, service, calls, verified, dispatchAccounts,
        outcome(value) { outcome = value; },
        succeed() { outcome = successfulOutcome; },
        failVerification(value) { verificationFails = value; },
        clock(value) { clock = value; },
        async state() {
            return {
                account: (await db.query('SELECT * FROM firm_billing')).rows[0],
                collections: (await db.query("SELECT * FROM firm_payment_intents WHERE kind='renewal' ORDER BY created_at")).rows,
                notices: (await db.query('SELECT * FROM synthetic_notices')).rows,
            };
        },
    };
}

test('verified card save collects overdue agreed amount once across concurrent callbacks and replay', async t => {
    const f = await fixture(t);
    const results = await Promise.all(Array.from({ length: 3 }, () => f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })));
    assert.equal(f.calls.length, 1);
    assert.ok(results.some(result => result.status === 'succeeded'));
    assert.equal(f.calls[0].amount, 532);
    assert.equal(f.calls[0].cardExternalToken, 'synthetic-card');
    assert.equal(f.calls[0].customerEmail, 'owner@synthetic.invalid');
    assert.equal(f.calls[0].customerFullName, 'Synthetic owner');
    assert.equal(f.calls[0].customerPhone, '0500000000');
    assert.equal(f.verified.length, 1);
    const state = await f.state();
    assert.equal(state.collections.length, 1);
    assert.equal(state.collections[0].package_snapshot.cardSetupIntentId, SETUP);
    assert.deepEqual(state.collections[0].package_snapshot.providerDocument,
        { created: true, id: 'synthetic-document', uniqId: null, number: '123', deliveryStatus: 'unknown' });
    assert.equal(JSON.stringify(state.collections[0].package_snapshot).includes('provider-raw-must-not-be-persisted'), false);
    assert.equal(state.collections[0].status, 'succeeded');
    assert.equal(state.account.status, 'active');
    assert.equal(state.account.grace_until, null);
    assert.ok(state.account.renews_at > new Date('2026-11-01T12:00:00Z'));
    assert.equal(state.notices.length, 1);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'succeeded');
    assert.equal(f.calls.length, 1);
});

test('definite decline keeps debt and grace and setup replay cannot dispatch another attempt', async t => {
    const f = await fixture(t);
    const before = (await f.state()).account;
    f.outcome({ ok: false, definitiveFailure: true, internalCode: 5, transactionInternalNumber: 'declined-transaction' });
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'failed');
    f.outcome({ ok: true, transactionInternalNumber: 'another-transaction' });
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'failed');
    assert.equal(f.calls.length, 1);
    const state = await f.state();
    assert.equal(state.account.status, 'past_due');
    assert.equal(+state.account.renews_at, +before.renews_at);
    assert.equal(+state.account.grace_until, +before.grace_until);
    assert.equal(state.notices.length, 0);
    assert.equal(f.verified.length, 0);
});

for (const [name, outcome] of [
    ['timeout', new Error('SYNTHETIC_TIMEOUT')],
    ['HTTP or malformed failure', { ok: false, definitiveFailure: false, internalCode: 500 }],
    ['missing result', null],
    ['approval without transaction', { ok: true }],
]) test(`${name} keeps the durable cycle pending and blocks setup and owner retries`, async t => {
    const f = await fixture(t);
    const before = (await f.state()).account;
    f.outcome(outcome);
    await assert.rejects(f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP }));
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'pending');
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true })).status, 'pending');
    const state = await f.state();
    assert.equal(f.calls.length, 1);
    assert.equal(state.collections[0].status, 'pending');
    assert.equal(+state.account.renews_at, +before.renews_at);
    assert.equal(+state.account.grace_until, +before.grace_until);
    assert.equal(state.notices.length, 0);
});

test('failed independent verification cannot settle or issue a payment notice', async t => {
    const f = await fixture(t);
    f.failVerification(true);
    await assert.rejects(f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP }), /SYNTHETIC_VERIFICATION_FAILURE/);
    const state = await f.state();
    assert.equal(state.collections[0].status, 'pending');
    assert.equal(state.account.status, 'past_due');
    assert.equal(state.notices.length, 0);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true })).status, 'pending');
    assert.equal(f.calls.length, 1);
});

test('zero due amount skips provider and leaves billing state unpaid', async t => {
    const f = await fixture(t, { amount: 0 });
    await f.db.query('DELETE FROM firm_payment_methods');
    const before = (await f.state()).account;
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'zero_amount');
    const after = await f.state();
    assert.equal(f.calls.length, 0);
    assert.equal(after.collections.length, 0);
    assert.equal(after.account.status, before.status);
    assert.equal(+after.account.renews_at, +before.renews_at);
    assert.equal(after.account.last_paid_at, null);
});

test('unverified or another office setup cannot trigger debt collection', async t => {
    const f = await fixture(t, { status: 'active', autoRenew: false });
    await assert.rejects(f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: OTHER_SETUP }), /CARD_SETUP_VERIFICATION_REQUIRED/);
    await f.db.query("UPDATE firm_payment_intents SET status='pending' WHERE id=$1", [SETUP]);
    await assert.rejects(f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP }), /CARD_SETUP_VERIFICATION_REQUIRED/);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.state()).collections.length, 0);
    assert.equal((await f.state()).account.status, 'active');
});

test('new signup trial has no charge despite a verified replacement card', async t => {
    const f = await fixture(t, { status: 'complimentary' });
    await f.db.query("UPDATE firm_billing SET complimentary_until='2026-12-01',renews_at='2026-12-01'");
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'card_setup_has_no_current_debt');
    assert.equal(f.calls.length, 0);
    assert.equal((await f.state()).collections.length, 0);
});

test('old setups and setups saved without debt cannot collect a later renewal cycle', async t => {
    const f = await fixture(t);
    await f.db.query("UPDATE firm_payment_intents SET package_snapshot='{}' WHERE id=$1", [SETUP]);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'card_setup_has_no_current_debt');
    await f.db.query(`UPDATE firm_payment_intents SET package_snapshot='{"cardCollectionDue":false,"cardCollectionCycleAt":"2026-10-01T00:00:00.000Z"}' WHERE id=$1`, [SETUP]);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'card_setup_has_no_current_debt');
    await f.db.query(`UPDATE firm_payment_intents SET package_snapshot='{"cardCollectionDue":true,"cardCollectionCycleAt":"2026-09-01T00:00:00.000Z"}' WHERE id=$1`, [SETUP]);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'card_setup_has_no_current_debt');
    assert.equal(f.calls.length, 0);
    assert.equal((await f.state()).collections.length, 0);
});

test('normal scheduled renewal persists a non-null metadata object and charges once', async t => {
    const f = await fixture(t);
    assert.equal((await f.service.renew(OFFICE)).status, 'succeeded');
    const state = await f.state();
    assert.equal(state.collections[0].package_snapshot.cardSetupIntentId, undefined);
    assert.equal(state.collections[0].package_snapshot.providerDocument.id, 'synthetic-document');
    assert.equal(f.calls.length, 1);
    assert.equal(state.notices.length, 1);
});

test('a card save blocked by an existing pending payment cannot later replay into a new charge', async t => {
    const f = await fixture(t);
    const existing = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await f.db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,signup_cycle_at)
        VALUES($1,$2,'renewal','pending',532,'2026-10-01T00:00:00Z')`, [existing, OFFICE]);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'pending');
    const setup = (await f.db.query('SELECT package_snapshot FROM firm_payment_intents WHERE id=$1', [SETUP])).rows[0];
    assert.equal(setup.package_snapshot.cardCollectionDue, false);
    await f.db.query("UPDATE firm_payment_intents SET status='failed' WHERE id=$1", [existing]);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'card_setup_has_no_current_debt');
    assert.equal(f.calls.length, 0);
    assert.equal((await f.state()).collections.length, 1);
});

test('canceled future renewal is preserved while explicit setup can recover existing past-due debt', async t => {
    const f = await fixture(t, { autoRenew: false });
    assert.equal((await f.service.renew(OFFICE)).reason, 'not_due_or_cancelled');
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'succeeded');
    assert.equal((await f.state()).account.auto_renew, false);
    assert.equal(f.calls.length, 1);
});

test('an expired canceled active subscription does not invent renewal debt on card save', async t => {
    const f = await fixture(t, { autoRenew: false, status: 'active' });
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason, 'not_due_or_cancelled');
    assert.equal(f.calls.length, 0);
    assert.equal((await f.state()).collections.length, 0);
});

test('canceled access expiry without a prior payment failure is not collectible debt', async t => {
    const f = await fixture(t, { autoRenew: false, status: 'suspended' });
    await f.db.query('UPDATE firm_billing SET last_failed_at=null,last_payment_error=null');
    const result = await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP });
    assert.equal(result.skipped, true);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.state()).account.last_paid_at, null);
});

for (const amount of [532, 1353]) {
    test(`verified setup collects one overdue month of ₪${amount}, then the next scheduled cycle collects the full agreed price once`, async t => {
        const f = await fixture(t, { amount });
        const before = (await f.state()).account;
        const first = await Promise.all(Array.from({ length: 3 }, () => f.service.renew(OFFICE,
            { retryFailed: true, cardSetupIntentId: SETUP })));
        assert.ok(first.some(result => result.status === 'succeeded'));
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].amount, amount);
        assert.equal(f.dispatchAccounts[0].status, 'past_due');
        assert.equal(+f.dispatchAccounts[0].renews_at, +before.renews_at);
        assert.equal(f.dispatchAccounts[0].last_paid_at, null, 'A saved card must not grant a free paid period before collection');
        let state = await f.state();
        assert.equal(state.account.status, 'active');
        assert.equal(Number(state.account.price_monthly_ils), amount);
        assert.equal(new Date(state.account.renews_at).toISOString(), '2026-12-01T12:00:00.000Z');
        assert.equal(state.collections.length, 1);
        assert.equal(Number(state.collections[0].amount_ils), amount);
        assert.equal(state.collections[0].package_snapshot.cardSetupIntentId, SETUP);
        assert.equal(state.notices.length, 1);

        f.clock('2026-12-01T11:59:59.999Z');
        assert.equal((await f.service.renew(OFFICE)).reason, 'not_due_or_cancelled');
        await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP });
        assert.equal(f.calls.length, 1);

        f.clock('2026-12-01T12:00:00.000Z');
        const second = await Promise.all([
            f.service.renew(OFFICE), f.service.renew(OFFICE),
            f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP }),
        ]);
        assert.ok(second.some(result => result.status === 'succeeded'));
        assert.deepEqual(f.calls.map(call => call.amount), [amount, amount]);
        assert.equal(new Set(f.calls.map(call => call.orderReference)).size, 2);
        assert.equal(f.verified.length, 2);
        assert.equal(new Set(f.verified.map(row => row.transactionId)).size, 2);
        assert.deepEqual(f.verified.map(row => row.expectedAmount), [amount, amount]);
        state = await f.state();
        assert.equal(state.collections.length, 2);
        assert.equal(state.collections.filter(row => row.status === 'succeeded').length, 2);
        assert.equal(new Date(state.account.renews_at).toISOString(), '2027-01-01T12:00:00.000Z');
        assert.equal(Number(state.account.price_monthly_ils), amount);
        assert.equal(state.account.status, 'active');
        assert.equal(state.account.grace_until, null);
        assert.equal(state.notices.length, 2);
        await f.service.renew(OFFICE);
        await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP });
        assert.equal(f.calls.length, 2, 'Neither the completed cycle nor the old setup may dispatch a third charge');
    });
}

test('a recorded three-calendar-month trial survives replacement card saving and then renews twice at the full price', async t => {
    const f = await fixture(t, { amount: 1353, status: 'complimentary' });
    const trialEnd = '2027-02-01T12:00:00.000Z'; // Three calendar months after the fixture's 1 November start.
    await f.db.query(`UPDATE firm_billing SET complimentary_until=$1,renews_at=$1,
        last_failed_at=null,last_payment_error=null,grace_until=null`, [trialEnd]);
    await f.db.query(`UPDATE firm_payment_intents SET package_snapshot=$2 WHERE id=$1`,
        [SETUP, JSON.stringify({ cardCollectionDue: false, cardCollectionCycleAt: trialEnd })]);
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).reason,
        'card_setup_has_no_current_debt');
    f.clock('2027-02-01T11:59:59.999Z');
    assert.equal((await f.service.renew(OFFICE)).reason, 'not_due_or_cancelled');
    assert.equal(f.calls.length, 0);
    let state = await f.state();
    assert.equal(state.account.status, 'complimentary');
    assert.equal(new Date(state.account.complimentary_until).toISOString(), trialEnd);
    assert.equal(new Date(state.account.renews_at).toISOString(), trialEnd);
    assert.equal(state.account.last_paid_at, null);

    f.clock(trialEnd);
    await Promise.all([f.service.renew(OFFICE), f.service.renew(OFFICE)]);
    state = await f.state();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].amount, 1353);
    assert.equal(new Date(state.account.renews_at).toISOString(), '2027-03-01T12:00:00.000Z');
    assert.equal(new Date(state.account.complimentary_until).toISOString(), trialEnd);
    assert.equal(state.account.status, 'active');
    assert.equal(state.notices.length, 1);

    f.clock('2027-03-01T12:00:00.000Z');
    await Promise.all([f.service.renew(OFFICE), f.service.renew(OFFICE),
        f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })]);
    state = await f.state();
    assert.deepEqual(f.calls.map(call => call.amount), [1353, 1353]);
    assert.equal(new Set(f.verified.map(row => row.transactionId)).size, 2);
    assert.equal(new Date(state.account.renews_at).toISOString(), '2027-04-01T11:00:00.000Z');
    assert.equal(Number(state.account.price_monthly_ils), 1353);
    assert.equal(state.collections.filter(row => row.status === 'succeeded').length, 2);
    assert.equal(state.notices.length, 2);
});

test('a declined setup collection grants no free month, explicit owner recovery pays it, and the next renewal charges the full price', async t => {
    const f = await fixture(t, { amount: 1353 });
    const before = (await f.state()).account;
    f.outcome({ ok: false, definitiveFailure: true, internalCode: 5, transactionInternalNumber: 'declined-cycle-transaction' });
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'failed');
    let state = await f.state();
    assert.equal(state.account.status, 'past_due');
    assert.equal(+state.account.renews_at, +before.renews_at);
    assert.equal(+state.account.grace_until, +before.grace_until);
    assert.equal(state.account.last_paid_at, null);
    assert.equal(state.notices.length, 0);
    f.succeed();
    assert.equal((await f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })).status, 'failed');
    assert.equal(f.calls.length, 1, 'Callback replay does not retry a declined collection');

    assert.equal((await f.service.renew(OFFICE, { retryFailed: true })).status, 'succeeded');
    state = await f.state();
    assert.deepEqual(f.calls.map(call => call.amount), [1353, 1353]);
    assert.equal(f.verified.length, 1);
    assert.equal(new Date(state.account.renews_at).toISOString(), '2026-12-01T12:00:00.000Z');
    assert.equal(state.notices.length, 1);

    f.clock('2026-12-01T12:00:00.000Z');
    await Promise.all([f.service.renew(OFFICE), f.service.renew(OFFICE),
        f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP })]);
    state = await f.state();
    assert.deepEqual(f.calls.map(call => call.amount), [1353, 1353, 1353]);
    assert.equal(f.verified.length, 2);
    assert.equal(new Set(f.verified.map(row => row.transactionId)).size, 2);
    assert.equal(state.collections.filter(row => row.status === 'failed').length, 1);
    assert.equal(state.collections.filter(row => row.status === 'succeeded').length, 2);
    assert.equal(new Date(state.account.renews_at).toISOString(), '2027-01-01T12:00:00.000Z');
    assert.equal(Number(state.account.price_monthly_ils), 1353);
    assert.equal(state.notices.length, 2);
});

for (const mode of ['timeout', 'unverified approval']) {
    test(`${mode} setup collection cannot grant a free month or dispatch another renewal after time advances`, async t => {
        const f = await fixture(t, { amount: 1353 });
        const before = (await f.state()).account;
        if (mode === 'timeout') f.outcome(new Error('SYNTHETIC_TIMEOUT'));
        else f.failVerification(true);
        await assert.rejects(f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP }));
        let state = await f.state();
        assert.equal(state.account.status, 'past_due');
        assert.equal(+state.account.renews_at, +before.renews_at);
        assert.equal(+state.account.grace_until, +before.grace_until);
        assert.equal(state.account.last_paid_at, null);
        assert.equal(state.collections[0].status, 'pending');
        assert.equal(state.notices.length, 0);
        f.succeed(); f.failVerification(false);
        f.clock('2026-12-01T12:00:00.000Z');
        const results = await Promise.all([
            f.service.renew(OFFICE),
            f.service.renew(OFFICE, { retryFailed: true }),
            f.service.renew(OFFICE, { retryFailed: true, cardSetupIntentId: SETUP }),
        ]);
        assert.ok(results.every(result => result.status === 'pending'));
        state = await f.state();
        assert.equal(f.calls.length, 1, 'Unknown collection must be reconciled; advancing time is not permission to charge again');
        assert.equal(state.collections.length, 1);
        assert.equal(state.collections[0].status, 'pending');
        assert.equal(+state.account.renews_at, +before.renews_at);
        assert.equal(state.account.last_paid_at, null);
        assert.equal(state.notices.length, 0);
    });
}

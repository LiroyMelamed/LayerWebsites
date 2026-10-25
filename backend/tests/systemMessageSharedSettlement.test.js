'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

const OFFICE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROVIDER_TRANSACTION = 'synthetic-shared-transaction';
const target = { platformId: 'site_app', resourceId: 'pro', signingId: '500' };

async function fixture(t, flow, failOutbox = false) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE TABLE firm_billing (
            id serial PRIMARY KEY, law_firm_tenant_id uuid UNIQUE,
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
        CREATE TABLE firm_payment_events(id serial PRIMARY KEY, intent_id uuid, event_type text, payload jsonb);
        CREATE TABLE firm_payment_methods(law_firm_tenant_id uuid,token_encrypted text,is_active boolean);
        CREATE TABLE users(userid integer PRIMARY KEY,role text,law_firm_tenant_id uuid);
        CREATE TABLE tenant_subscriptions(tenant_id integer PRIMARY KEY,plan_key text,status text,
            starts_at timestamptz,updated_at timestamptz,created_at timestamptz);
        CREATE TABLE signup_intents(id uuid,law_firm_tenant_id uuid,status text,consent_version text,recurring_amount_ils numeric);
        CREATE TABLE synthetic_system_outbox(source_id uuid PRIMARY KEY,office_id uuid,amount_ils numeric);
    `);
    await db.query(`INSERT INTO firm_billing(law_firm_tenant_id,platform_id,resource_id,signing_id,
        price_monthly_ils,status,renews_at) VALUES($1,'site','basic','none',532,'active',now()+$2::interval)`,
    [OFFICE, flow === 'renewal' ? '-1 month' : '1 month']);
    await db.query(`INSERT INTO firm_billing(law_firm_tenant_id,platform_id,resource_id,signing_id,
        price_monthly_ils,status,renews_at) VALUES($1,'site','basic','none',532,'active',now()+interval '1 month')`, [OTHER]);
    await db.query(`INSERT INTO users(userid,role,law_firm_tenant_id) VALUES(91,'Admin',$1)`, [OFFICE]);
    await db.query(`INSERT INTO firm_payment_methods VALUES($1,'synthetic-encrypted-card',true)`, [OFFICE]);
    await db.query(`INSERT INTO signup_intents VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,'completed','signup-1ils-3months-v2',532)`, [OFFICE]);
    // A pending payment in a different office must neither block nor be updated.
    await db.query(`INSERT INTO firm_payment_intents(id,law_firm_tenant_id,kind,status,amount_ils,order_reference)
        VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',$1,'renewal','pending',532,'foreign-pending')`, [OTHER]);

    let inTransaction = false;
    let charges = 0;
    let verifications = 0;
    const trace = [];
    const query = async (sql, params) => {
        const result = await db.query(sql, params);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    const client = {
        async query(sql, params) {
            const statement = String(sql).trim();
            trace.push(statement);
            if (statement === 'BEGIN') inTransaction = true;
            const result = await query(sql, params);
            if (statement === 'COMMIT' || statement === 'ROLLBACK') inTransaction = false;
            return result;
        }, release() {},
    };
    const pool = {
        async query(sql, params) {
            assert.equal(inTransaction, false, 'A pool query escaped a scoped payment transaction');
            return query(sql, params);
        },
        async connect() { return client; },
    };
    const expectedAmount = flow === 'renewal' ? 532 : 972;
    const charge = async input => {
        assert.equal(input.amount, expectedAmount);
        assert.equal(input.currency, 'ILS');
        assert.equal(input.cardExternalToken, 'synthetic-card-token');
        assert.ok(trace.includes('COMMIT'), 'The reservation must commit before provider dispatch');
        const reserved = (await db.query('SELECT * FROM firm_payment_intents WHERE law_firm_tenant_id=$1', [OFFICE])).rows;
        assert.equal(reserved.length, 1);
        assert.equal(reserved[0].status, 'pending');
        charges++;
        return { ok: true, transactionInternalNumber: PROVIDER_TRANSACTION };
    };
    const verify = async (_credentials, transactionId, amount) => {
        assert.equal(transactionId, PROVIDER_TRANSACTION);
        assert.equal(amount, expectedAmount);
        verifications++;
        return true;
    };
    const core = {
        async enqueuePaymentReceived(targetClient, { intent }) {
            assert.equal(targetClient, client);
            assert.equal(inTransaction, true);
            assert.equal(verifications, 1, 'The source transition must be independently verified first');
            assert.equal(intent.status, 'succeeded');
            assert.equal(intent.law_firm_tenant_id, OFFICE);
            await targetClient.query(`INSERT INTO synthetic_system_outbox VALUES($1,$2,$3)`,
            [intent.id, intent.law_firm_tenant_id, intent.amount_ils]);
            if (failOutbox) throw Error('SYNTHETIC_SHARED_OUTBOX_FAILURE');
        },
    };
    const filename = path.join(__dirname, `../lib/billing/${flow === 'renewal' ? 'selfServiceRenewal' : 'selfServiceUpgrade'}.js`);
    const requireLocal = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, Date, Buffer,
        process: { env: { NODE_ENV: 'test' } },
        console: { warn() {}, error() {}, log() {} },
        require(name) {
            if (name === '../../config/db') return pool;
            if (name === './secrets') return { decryptSecret: value => { assert.equal(value, 'synthetic-encrypted-card'); return 'synthetic-card-token'; } };
            if (name === '../payments/takbullClient') return {
                getTakbullCredentialsFromEnv: () => ({ apiKey: 'synthetic', apiSecret: 'synthetic' }), chargeTakbullToken: charge,
            };
            if (name === '../payments/verifySignupPayment') return { verifyChargedTransaction: verify };
            if (name === '../systemMessages') return core;
            return requireLocal(name);
        },
    }, { filename });
    const service = flow === 'renewal'
        ? module.exports.createSignupRenewal({ database: pool, charge, verify, credentials: () => ({ apiKey: 'synthetic', apiSecret: 'synthetic' }) })
        : module.exports;
    return {
        db, trace,
        get charges() { return charges; }, get verifications() { return verifications; },
        run: () => flow === 'renewal' ? service.renew(OFFICE)
            : service.chargeSelfServiceUpgrade({ tenantId: OFFICE, target, interval: 'monthly', amount: expectedAmount, charge }),
        async state() {
            return {
                account: (await db.query('SELECT * FROM firm_billing WHERE law_firm_tenant_id=$1', [OFFICE])).rows[0],
                intent: (await db.query('SELECT * FROM firm_payment_intents WHERE law_firm_tenant_id=$1', [OFFICE])).rows[0],
                outbox: (await db.query('SELECT * FROM synthetic_system_outbox')).rows,
                audit: (await db.query('SELECT * FROM firm_payment_events')).rows,
                foreign: (await db.query('SELECT * FROM firm_payment_intents WHERE law_firm_tenant_id=$1', [OTHER])).rows[0],
            };
        },
    };
}

for (const flow of ['renewal', 'upgrade']) {
    test(`shared ${flow}: verified success and outbox commit together and a repeated request does not recharge`, async t => {
        const f = await fixture(t, flow);
        const result = await f.run();
        assert.ok(result.status === 'succeeded' || result.ok === true);
        const state = await f.state();
        assert.equal(state.intent.status, 'succeeded');
        assert.equal(state.account.status, 'active');
        assert.equal(state.outbox.length, 1);
        assert.equal(state.outbox[0].source_id, state.intent.id);
        assert.equal(state.outbox[0].office_id, OFFICE);
        assert.equal(state.foreign.status, 'pending');
        if (flow === 'upgrade') { assert.equal(state.account.resource_id, 'pro'); assert.equal(state.audit.length, 1); }
        await f.run();
        assert.equal(f.charges, 1);
        assert.equal(f.verifications, 1);
        assert.equal((await f.state()).outbox.length, 1);
    });

    test(`shared ${flow}: outbox failure rolls back final settlement but retains the charged reservation`, async t => {
        const f = await fixture(t, flow, true);
        const before = await f.state();
        await assert.rejects(f.run(), /SYNTHETIC_SHARED_OUTBOX_FAILURE/);
        const state = await f.state();
        assert.equal(state.intent.status, 'pending');
        assert.equal(state.intent.takbull_transaction_id, PROVIDER_TRANSACTION);
        assert.equal(state.intent.settled_at, null);
        assert.equal(state.account.resource_id, before.account.resource_id);
        assert.equal(+state.account.renews_at, +before.account.renews_at);
        assert.equal(state.outbox.length, 0);
        assert.equal(state.audit.length, 0);
        assert.equal(state.foreign.status, 'pending');
        if (flow === 'renewal') assert.equal((await f.run()).status, 'pending');
        else await assert.rejects(f.run(), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
        assert.equal(f.charges, 1, 'A failed local transaction must never cause another card charge');
        assert.equal(f.verifications, 1);
    });
}

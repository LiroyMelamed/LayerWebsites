'use strict';

// Offline qualification of the opt-in financial maintenance gate. Real service
// code is evaluated with explicit boundary replacements; application DB config,
// provider credentials, app startup and outbound transports are never imported.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');
const gate = require('../lib/billing/billingOperations');

const OFFICE = '11111111-1111-4111-8111-111111111111';
const INTENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CREDENTIALS = { apiKey: 'synthetic', apiSecret: 'synthetic' };
const silent = { error() {}, warn() {}, log() {} };
const scope = { withSystem: fn => fn() };
const paused = error => error?.code === 'BILLING_OPERATIONS_PAUSED' && error.httpStatus === 503 && error.retryAfter === 60;

function load(relative, stubs = {}, extra = {}) {
    const filename = path.join(__dirname, '..', relative);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, process, Buffer, URL, URLSearchParams, AbortSignal,
        Date, setTimeout, clearTimeout, setInterval, clearInterval, console: silent,
        require(name) {
            if (Object.hasOwn(stubs, name)) return stubs[name];
            // Any missing boundary is a test failure, rather than a real DB import.
            if (/config\/db$/.test(name)) throw Error('APPLICATION_DATABASE_IMPORT_FORBIDDEN');
            return localRequire(name);
        },
        ...extra,
    }, { filename });
    return module.exports;
}

function probes(database) {
    const calls = { query: 0, connect: 0, provider: 0, email: 0, outbox: 0, signup: 0 };
    const unexpected = kind => async () => { calls[kind]++; throw Error('UNEXPECTED_' + kind.toUpperCase()); };
    const pool = database || { query: unexpected('query'), connect: unexpected('connect') };
    const gateway = {
        getTakbullCredentialsFromEnv: () => CREDENTIALS,
        getTakbullMode: () => 'test', resolveSetupAmountIls: () => 1,
        createTakbullPaymentPage: unexpected('provider'), validateTakbullNotification: unexpected('provider'),
        chargeTakbullToken: unexpected('provider'), extractTokenFromValidated: () => null,
    };
    const stubs = {
        '../../config/db': pool,
        './secrets': { encryptSecret: value => value, decryptSecret: value => value },
        '../billing/secrets': { encryptSecret: value => value, decryptSecret: value => value, getProviderSecretsKey: () => 'synthetic' },
        './billingEmails': { sendFailedPaymentEmails: unexpected('email') },
        '../payments/takbullClient': gateway,
        '../payments/verifySignupPayment': {
            verifyHostedPayment: unexpected('provider'), verifySignupPayment: unexpected('provider'),
            verifyChargedTransaction: unexpected('provider'),
        },
        '../tenant/tenantContext': { getCurrentTenantId: () => null },
        '../tenant/databaseScope': scope, './databaseScope': scope,
        '../systemMessages': { enqueuePaymentReceived: unexpected('outbox') },
        '../tenant/signupService': { completeSignupFromPaymentIntent: unexpected('signup') },
        './signupWelcomeEmail': { flushWelcome: unexpected('email') },
        './signupLogo': { saveSignupLogo: unexpected('signup') },
        './signupAvailability': { assertSignupAvailable() {} },
        './signupSystemMessages': {
            captureSignupSystemConsent: unexpected('outbox'), provisionSignupSystemMessages: unexpected('outbox'),
        },
        './tenantService': { createTenant: unexpected('signup'), slugAvailable: unexpected('signup') },
        './tenantContext': { normalizeSlug: value => value, isValidSlug: () => true },
        '../../utils/sendMessage': { sendMessage: unexpected('email') },
    };
    return { calls, pool, stubs, unexpected };
}

function response() {
    return {
        code: 200, headers: {}, body: null, location: null,
        status(value) { this.code = value; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); return this; },
        set(name, value) { return this.setHeader(name, value); },
        json(value) { this.body = value; return this; },
        redirect(value) { this.code = 302; this.location = value; return this; },
    };
}

function assertPausedResponse(res) {
    assert.equal(res.code, 503);
    assert.equal(res.headers['retry-after'], '60');
    assert.equal(res.body.error, 'BILLING_OPERATIONS_PAUSED');
    assert.equal(res.location, null, 'A paused return must retain its callback, not redirect as completed');
}

test('billing maintenance gate preserves unset behavior and fails closed for every configured non-enable value', () => {
    assert.equal(gate.billingOperationsEnabled({}), true);
    for (const value of ['true', 'TRUE', ' True ', '1', 1]) {
        assert.equal(gate.billingOperationsEnabled({ BILLING_OPERATIONS_ENABLED: value }), true);
        assert.doesNotThrow(() => gate.assertBillingOperationsEnabled({ BILLING_OPERATIONS_ENABLED: value }));
    }
    for (const value of ['false', 'FALSE', ' false ', '0', '', '  ', 'yes', 'on', '2', false, null]) {
        assert.equal(gate.billingOperationsEnabled({ BILLING_OPERATIONS_ENABLED: value }), false);
        assert.throws(() => gate.assertBillingOperationsEnabled({ BILLING_OPERATIONS_ENABLED: value }), error => {
            assert.equal(error.status, 503);
            assert.equal(gate.isBillingOperationsPausedError(error), true);
            return paused(error);
        });
    }
    assert.equal(gate.isBillingOperationsPausedError(Error('unrelated')), false);
    assert.equal(gate.isBillingOperationsPausedError(null), false);
});

test('paused financial operations perform no dispatch, reservation, settlement or mail side effect', async t => {
    const previous = process.env.BILLING_OPERATIONS_ENABLED;
    process.env.BILLING_OPERATIONS_ENABLED = 'false';
    t.after(() => {
        if (previous === undefined) delete process.env.BILLING_OPERATIONS_ENABLED;
        else process.env.BILLING_OPERATIONS_ENABLED = previous;
    });

    await t.test('all native and injected Takbull fetch boundaries stop before network or documents', async () => {
        const gateway = require('../lib/payments/takbullClient');
        const verifier = require('../lib/payments/verifySignupPayment');
        const originalFetch = global.fetch;
        let nativeCalls = 0, injectedCalls = 0;
        global.fetch = async () => { nativeCalls++; throw Error('UNEXPECTED_NATIVE_FETCH'); };
        const injected = async () => { injectedCalls++; throw Error('UNEXPECTED_INJECTED_FETCH'); };
        try {
            const operations = [
                () => gateway.createTakbullPaymentPage({ credentials: CREDENTIALS, amount: 1, currency: 'ILS', orderReference: 'synthetic-order' }),
                () => gateway.chargeTakbullToken({ credentials: CREDENTIALS, amount: 1353, currency: 'ILS', token: 'synthetic-token', createDocument: true }),
                () => gateway.validateTakbullNotification(CREDENTIALS, 'synthetic-page'),
                () => verifier.verifyHostedPayment(CREDENTIALS, 'synthetic-page', 'synthetic-order', 1),
                () => verifier.verifySignupPayment(CREDENTIALS, 'synthetic-page', 'synthetic-order'),
                () => verifier.verifyChargedTransaction(CREDENTIALS, 'synthetic-transaction', 1353),
                () => verifier.verifyHostedPayment(CREDENTIALS, 'synthetic-page', 'synthetic-order', 1, injected),
                () => verifier.verifySignupPayment(CREDENTIALS, 'synthetic-page', 'synthetic-order', injected),
                () => verifier.verifyChargedTransaction(CREDENTIALS, 'synthetic-transaction', 1353, injected),
            ];
            for (const operation of operations) await assert.rejects(operation, paused);
            assert.equal(nativeCalls, 0);
            assert.equal(injectedCalls, 0);
        } finally { global.fetch = originalFetch; }
    });

    await t.test('legacy checkout, all charge kinds, package changes, callbacks and settlement stop before first query', async () => {
        const p = probes();
        const billing = load('lib/billing/firmBillingService.js', p.stubs);
        const operations = [
            () => billing.ensureBillingRow(), () => billing.updateBilling({ status: 'active' }),
            () => billing.syncTenantSubscription({}), () => billing.applyIntentPackageSnapshot({}),
            () => billing.createCheckout({ kind: 'setup' }), () => billing.createCheckout({ kind: 'renewal' }),
            ...['setup', 'renewal', 'retry', 'annual', 'upgrade'].map(kind => () => billing.chargeSavedCard({ kind })),
            () => billing.savePackage({}), () => billing.cancelSubscription(),
            () => billing.handleTakbullNotification({ uniqId: 'synthetic-pending' }),
            () => billing.handleTakbullReturn({ uniqId: 'synthetic-pending' }),
            () => billing.handleTakbullCancel({ uniqId: 'synthetic-pending' }),
            () => billing.settleSuccessfulPayment({ intent: { id: INTENT, status: 'pending' } }),
        ];
        for (const operation of operations) await assert.rejects(operation, paused);
        const maintenance = await billing.runBillingMaintenance();
        assert.equal(maintenance.skipped, true);
        assert.equal(maintenance.reason, 'billing_operations_paused');
        assert.deepEqual(p.calls, { query: 0, connect: 0, provider: 0, email: 0, outbox: 0, signup: 0 });
    });

    await t.test('shared renewal, owner retry, due scheduler and upgrade do not start transactions or mark debt failed', async () => {
        const p = probes();
        const renewal = load('lib/billing/selfServiceRenewal.js', p.stubs).createSignupRenewal({
            database: p.pool, charge: p.unexpected('provider'), verify: p.unexpected('provider'), credentials: () => CREDENTIALS,
        });
        for (const options of [{}, { retryFailed: true }, { cardSetupIntentId: INTENT }]) {
            const result = await renewal.renew(OFFICE, options);
            assert.equal(result.skipped, true);
            assert.equal(result.reason, 'billing_operations_paused');
        }
        assert.equal((await renewal.due()).length, 0);
        const upgrade = load('lib/billing/selfServiceUpgrade.js', p.stubs);
        await assert.rejects(() => upgrade.chargeSelfServiceUpgrade({ tenantId: OFFICE, target: {}, amount: 1353, interval: 'monthly', charge: p.unexpected('provider') }), paused);
        let timers = 0;
        const scheduler = load('tasks/billingRenewal/scheduler.js', {
            '../../lib/billing/firmBillingService': { runBillingMaintenance: p.unexpected('provider') },
            '../../lib/tenant/databaseScope': { withLegacyOffice: p.unexpected('query') },
        }, { setInterval() { timers++; throw Error('UNEXPECTED_RENEWAL_TIMER'); }, setTimeout() { timers++; throw Error('UNEXPECTED_RENEWAL_TIMER'); } });
        assert.equal(scheduler.initBillingRenewalScheduler().reason, 'billing_operations_paused');
        assert.equal(timers, 0);
        assert.deepEqual(p.calls, { query: 0, connect: 0, provider: 0, email: 0, outbox: 0, signup: 0 });
    });

    await t.test('initial signup, checkout, sync and verified provisioning stop before consent, tenant, token or welcome changes', async () => {
        const p = probes();
        const signup = load('lib/tenant/signupService.js', p.stubs);
        for (const operation of [
            () => signup.createSignupIntent({}), () => signup.createSignupCheckout(INTENT),
            () => signup.syncSignup(INTENT), () => signup.provisionTenantFromSignup(INTENT, {}),
            () => signup.completeSignupFromPaymentIntent(INTENT, { token: 'synthetic-token' }),
        ]) await assert.rejects(operation, paused);
        assert.deepEqual(p.calls, { query: 0, connect: 0, provider: 0, email: 0, outbox: 0, signup: 0 });
    });

    await t.test('signup status remains readable while paused and does not normalize or provision its state', async () => {
        const statements = [];
        const row = { id: INTENT, slug: 'synthetic-office', status: 'paid', price_monthly_ils: 1353,
            recurring_amount_ils: 1353, payment_intent_id: INTENT };
        const before = JSON.stringify(row);
        const p = probes({ async query(sql) {
            statements.push(String(sql));
            assert.match(String(sql).trim(), /^SELECT\b/i);
            return { rows: [row], rowCount: 1 };
        }, async connect() { throw Error('UNEXPECTED_SIGNUP_STATUS_TRANSACTION'); } });
        const signup = load('lib/tenant/signupService.js', p.stubs);
        const result = await signup.getSignupIntent(INTENT);
        assert.equal(result.id, INTENT);
        assert.equal(result.status, 'paid');
        assert.equal(statements.length, 1);
        assert.equal(JSON.stringify(row), before);
        assert.equal(p.calls.provider + p.calls.email + p.calls.outbox + p.calls.signup, 0);
    });

    await t.test('PGlite paused callback replay and future active snapshot retain every row, token, reservation and outbox', async () => {
        const db = new PGlite();
        try {
            await db.exec(`
                CREATE TABLE firm_billing(id integer PRIMARY KEY,platform_id text,resource_id text,signing_id text,
                  price_monthly_ils numeric,billing_interval text,status text,billing_enabled boolean,auto_renew boolean,
                  complimentary_until timestamptz,renews_at timestamptz,grace_until timestamptz,
                  last_payment_error text,last_failed_at timestamptz,last_paid_at timestamptz,updated_at timestamptz);
                CREATE TABLE firm_payment_methods(id integer PRIMARY KEY,law_firm_tenant_id uuid,last4 text,
                  exp_month text,exp_year text,card_brand text,token_encrypted text,is_active boolean,updated_at timestamptz);
                CREATE TABLE firm_payment_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,kind text,status text,
                  amount_ils numeric,currency text,purpose text,error_message text,created_at timestamptz,
                  settled_at timestamptz,takbull_transaction_id text,package_snapshot jsonb);
                CREATE TABLE financial_outbox(id integer PRIMARY KEY,status text,payload jsonb);
                INSERT INTO firm_billing VALUES(1,'site','basic','none',1353,'monthly','active',true,true,
                  '2026-01-01Z','2099-12-01Z',NULL,NULL,NULL,'2026-11-01Z','2026-11-01Z');
                INSERT INTO firm_payment_methods VALUES(1,NULL,'0000','12','2099','synthetic','synthetic-token',true,'2026-11-01Z');
                INSERT INTO firm_payment_intents VALUES('${INTENT}',NULL,'renewal','pending',1353,'ILS','synthetic',NULL,
                  '2026-11-01Z',NULL,NULL,'{}');
                INSERT INTO financial_outbox VALUES(1,'pending','{"kind":"payment_received"}');
            `);
            const tables = ['firm_billing', 'firm_payment_methods', 'firm_payment_intents', 'financial_outbox'];
            const rows = async () => JSON.stringify(await Promise.all(tables.map(name => db.query('SELECT * FROM ' + name + ' ORDER BY 1'))));
            const before = await rows();
            const sql = [];
            const database = {
                async query(query, params) {
                    sql.push(String(query));
                    assert.match(String(query).trim(), /^SELECT\b/i, 'Paused snapshot must only read existing rows');
                    return db.query(query, params);
                },
                async connect() { throw Error('PAUSED_TRANSACTION_FORBIDDEN'); },
            };
            const p = probes(database);
            const billing = load('lib/billing/firmBillingService.js', p.stubs);
            for (let repeat = 0; repeat < 3; repeat++) {
                await assert.rejects(() => billing.handleTakbullNotification({ uniqId: 'synthetic-pending', query: { id: INTENT } }), paused);
                await assert.rejects(() => billing.handleTakbullReturn({ uniqId: 'synthetic-pending' }), paused);
            }
            assert.equal(sql.length, 0, 'Paused callbacks retain reservations without querying or acknowledging settlement');
            const snapshot = await billing.getBillingSnapshot();
            assert.equal(snapshot.status, 'active');
            assert.equal(snapshot.priceMonthlyIls, 1353);
            assert.equal(snapshot.nextChargeIls, 1353);
            assert.equal(new Date(snapshot.renewsAt).toISOString(), '2099-12-01T00:00:00.000Z');
            assert.equal(snapshot.payments[0].status, 'pending');
            await billing.getDisabledOptions({});
            assert.ok(sql.length >= 3);
            assert.equal(await rows(), before, 'Pausing cannot clear debt, grant time, deactivate tokens, settle or dequeue messages');
            assert.equal(p.calls.provider + p.calls.email + p.calls.outbox + p.calls.signup, 0);

            for (const scenario of [
                { status: 'past_due', grace: '2099-12-01T00:00:00Z', locked: false, expired: false },
                { status: 'past_due', grace: '2000-01-01T00:00:00Z', locked: true, expired: true },
                { status: 'suspended', grace: null, locked: true, expired: false },
            ]) {
                // Prepare each synthetic account outside the probed service.
                // An unexpired grace window keeps incumbent access semantics;
                // expired grace and suspended accounts remain locked on pause.
                await db.query(`UPDATE firm_billing SET status=$1,renews_at='2000-01-01Z',grace_until=$2,
                    last_payment_error='synthetic debt remains due',last_failed_at='2000-01-01Z' WHERE id=1`,
                [scenario.status, scenario.grace]);
                const debtBefore = await rows();
                sql.length = 0;
                const debt = await billing.getBillingSnapshot();
                assert.equal(debt.status, scenario.status);
                assert.equal(debt.locked, scenario.locked);
                assert.equal(debt.graceExpired, scenario.expired);
                assert.equal(debt.stillComplimentary, false);
                assert.equal(debt.lastPaymentError, 'synthetic debt remains due');
                assert.equal(debt.nextChargeIls, 1353);
                assert.equal(new Date(debt.renewsAt).toISOString(), '2000-01-01T00:00:00.000Z');
                assert.ok(sql.length >= 3);
                assert.equal(await rows(), debtBefore, 'Paused reads cannot forgive, suspend, renew or clear the debt record');
            }
            await db.query('DELETE FROM firm_billing WHERE id=1');
            const missingBefore = await rows();
            sql.length = 0;
            const missing = await billing.getBillingSnapshot();
            assert.equal(missing.available, false);
            assert.equal(missing.billingEnabled, false);
            assert.equal(missing.locked, false);
            assert.equal(sql.length, 1, 'A missing account must not be lazily inserted while paused');
            assert.equal(await rows(), missingBefore);
        } finally { await db.close(); }
    });

    await t.test('failed-payment mail, queued welcome delivery and welcome worker stop before lookup, lease, SMTP or timers', async () => {
        let lookups = 0, smtp = 0, timers = 0;
        const p = probes();
        const email = load('lib/billing/billingEmails.js', {
            '../../utils/smooveEmailCampaignService': { sendEmailWithAttachments: async () => { smtp++; throw Error('UNEXPECTED_EMAIL'); } },
            '../../services/settingsService': { getPlatformAdmins: async () => { lookups++; throw Error('UNEXPECTED_ADMIN_LOOKUP'); } },
            '../../tasks/emailReminders/templates': { wrapEmailHtml: value => value },
        });
        assert.equal((await email.sendFailedPaymentEmails({ amountIls: 1353 })).reason, 'billing_operations_paused');
        const welcome = load('lib/tenant/signupWelcomeEmail.js', {
            './databaseScope': scope,
            './tenantContext': { isMultiTenantMode: () => true },
            './signupAvailability': { signupAvailable: () => true },
            nodemailer: { createTransport() { smtp++; throw Error('UNEXPECTED_SMTP'); } },
        }, { setInterval() { timers++; throw Error('UNEXPECTED_WORKER_TIMER'); }, setTimeout() { timers++; throw Error('UNEXPECTED_WORKER_TIMER'); } });
        const dispatcher = welcome.createWelcomeDispatcher({ database: p.pool, deliver: p.unexpected('email') });
        for (const id of [null, INTENT]) {
            const result = await dispatcher.flush(id);
            assert.equal(result.processed, 0);
            assert.equal(result.reason, 'billing_operations_paused');
        }
        await assert.rejects(() => welcome.deliverWelcome({ toEmail: 'owner@synthetic.invalid' }, INTENT), paused);
        welcome.startWelcomeWorker();
        assert.equal(lookups + smtp + timers, 0);
        assert.deepEqual(p.calls, { query: 0, connect: 0, provider: 0, email: 0, outbox: 0, signup: 0 });
    });

    await t.test('financial message capture skips before queries and queued pending/stale financial families remain unchanged', async () => {
        const env = {
            BILLING_OPERATIONS_ENABLED: 'false', CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED: 'true',
            CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED: 'true', CENTRAL_SYSTEM_MESSAGES_MODE: 'dedicated',
            CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID: 'synthetic-billing-qa', CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID: '1',
            CENTRAL_SYSTEM_MESSAGES_HMAC_KEY: 'synthetic-test-only-key-not-a-provider-secret',
        };
        const p = probes();
        const { createSystemMessagesService } = load('lib/systemMessages/index.js', { '../tenant/databaseScope': scope });
        const disabledCapture = createSystemMessagesService({ database: p.pool, env });
        assert.equal((await disabledCapture.enqueuePaymentReceived(p.pool, { intent: { id: INTENT } })).reason, 'billing_operations_paused');
        assert.equal((await disabledCapture.enqueueSubscriptionUpdate(p.pool, { sourceId: INTENT, status: 'active' })).reason, 'billing_operations_paused');
        assert.equal(p.calls.query + p.calls.connect, 0);

        const db = new PGlite();
        try {
            await db.exec(`CREATE TABLE central_system_message_outbox(id integer PRIMARY KEY,deployment_id text,
              event_family text,status text,next_attempt_at timestamptz,lease_until timestamptz,created_at timestamptz);
              INSERT INTO central_system_message_outbox VALUES
                (1,'synthetic-billing-qa','payment_received','pending','2026-01-01Z',NULL,'2026-01-01Z'),
                (2,'synthetic-billing-qa','subscription_update','pending','2026-01-01Z',NULL,'2026-01-01Z'),
                (3,'synthetic-billing-qa','payment_received','sending','2026-01-01Z','2026-01-01Z','2026-01-01Z'),
                (4,'synthetic-billing-qa','subscription_update','sending','2026-01-01Z','2026-01-01Z','2026-01-01Z');`);
            const snapshot = async () => JSON.stringify((await db.query('SELECT * FROM central_system_message_outbox ORDER BY id')).rows);
            const before = await snapshot();
            let centralCalls = 0;
            const sql = [];
            const query = async (statement, params) => { sql.push(String(statement)); return db.query(statement, params); };
            const database = { query, async connect() { return { query, release() {} }; } };
            const service = createSystemMessagesService({ database, env, now: () => new Date('2026-11-01T12:00:00Z'),
                clientFactory() { centralCalls++; throw Error('UNEXPECTED_CENTRAL_TRANSPORT'); } });
            assert.equal((await service.flush()).processed, 0);
            assert.equal(centralCalls, 0);
            assert.equal(await snapshot(), before);
            assert.ok(sql.some(statement => statement.includes('event_family NOT IN')));
            assert.equal(sql.filter(statement => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(statement)).length, 0);
            // Check the same real SQL still admits a nonfinancial family. Its
            // eventual delivery uses the incumbent consent/outbox workflow.
            await db.exec(`INSERT INTO central_system_message_outbox VALUES
                (5,'synthetic-billing-qa','consent_confirmation','pending','2026-01-01Z',NULL,'2026-01-01Z');`);
            const select = sql.find(statement => statement.includes('event_family NOT IN'));
            const eligible = await db.query(select, ['synthetic-billing-qa', new Date('2026-11-01T12:00:00Z')]);
            assert.equal(eligible.rows.length, 1);
            assert.equal(eligible.rows[0].id, 5);
        } finally { await db.close(); }
    });

    await t.test('GET and POST IPN return retryable 503 and preserve callback body for replay after resume', async () => {
        const handlers = {};
        let serviceCalls = 0;
        const payloads = [];
        const billing = { async handleTakbullNotification(input) {
            gate.assertBillingOperationsEnabled(); serviceCalls++; payloads.push(input); return { status: 'succeeded' };
        } };
        load('routes/paymentWebhookRoutes.js', {
            express: { Router: () => ({ get: (url, fn) => { handlers.GET = fn; }, post: (url, fn) => { handlers.POST = fn; } }) },
            '../lib/billing/firmBillingService': billing, '../lib/tenant/databaseScope': scope,
        });
        const body = { UniqId: 'synthetic-pending', order_reference: 'synthetic-order', opaque: 'preserve-me' };
        for (const method of ['GET', 'POST']) {
            const req = { query: { uniqId: 'synthetic-pending' }, body: { ...body } };
            const res = response();
            await handlers[method](req, res);
            assertPausedResponse(res);
            assert.deepEqual(req.body, body);
        }
        assert.equal(serviceCalls, 0);
        // A provider retry must reach the same original handler after enabling;
        // this proves local non-ACK semantics, not provider retry guarantees.
        process.env.BILLING_OPERATIONS_ENABLED = 'true';
        try {
            const res = response();
            await handlers.POST({ query: {}, body: { ...body } }, res);
            assert.equal(res.code, 200);
            assert.equal(serviceCalls, 1);
            assert.equal(payloads[0].uniqId, body.UniqId);
            assert.equal(payloads[0].query.opaque, body.opaque);
        } finally { process.env.BILLING_OPERATIONS_ENABLED = 'false'; }
    });

    await t.test('native HTTP GET and POST webhook requests expose 503 and Retry-After before provider or DB work', async () => {
        const express = require('express');
        let effects = 0;
        const router = load('routes/paymentWebhookRoutes.js', {
            express,
            '../lib/billing/firmBillingService': { handleTakbullNotification: async () => { effects++; throw Error('UNEXPECTED_IPN_DISPATCH'); } },
            '../lib/tenant/databaseScope': scope,
        });
        const app = express();
        app.use(express.json());
        app.use(router);
        const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
        try {
            const url = `http://127.0.0.1:${server.address().port}/takbull`;
            for (const method of ['GET', 'POST']) {
                const result = await fetch(method === 'GET' ? url + '?uniqId=synthetic-pending' : url, {
                    method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ UniqId: 'synthetic-pending' }) } : {}),
                });
                assert.equal(result.status, 503);
                assert.equal(result.headers.get('retry-after'), '60');
                assert.equal((await result.json()).error, 'BILLING_OPERATIONS_PAUSED');
            }
            assert.equal(effects, 0);
        } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    });

    await t.test('billing action and return controllers expose the same retryable pause, without redirect success', async () => {
        const fail = async () => gate.assertBillingOperationsEnabled();
        const billing = Object.fromEntries(['savePackage', 'createCheckout', 'chargeSavedCard', 'cancelSubscription', 'handleTakbullReturn', 'handleTakbullCancel'].map(name => [name, fail]));
        billing.getBillingSnapshot = async () => { throw Error('PAUSED_SNAPSHOT_MUST_NOT_BE_USED_TO_CLAIM_SETTLEMENT'); };
        const controller = load('controllers/billingController.js', {
            '../lib/limits/getLimitsForFirm': { getLimitsForFirm: async () => ({}) },
            '../lib/limits/getUsageForFirm': { getUsageForFirm: async () => ({}) },
            '../lib/limits/enforceFirmLimits': { enforcementMode: () => 'enforce' },
            '../lib/billing/firmBillingService': billing,
            '../utils/errors.he': { getHebrewMessage: () => 'synthetic' },
        });
        for (const name of ['savePackage', 'createCheckout', 'confirmCheckout', 'chargeNow', 'cancelSubscription', 'takbullReturn', 'takbullCancel']) {
            const res = response();
            await controller[name]({ body: { uniqId: 'synthetic-pending' }, query: { uniqId: 'synthetic-pending' }, user: {} }, res);
            assertPausedResponse(res);
        }
    });

    await t.test('public signup create, checkout, sync and return preserve retryable payment state', async () => {
        const fail = async () => gate.assertBillingOperationsEnabled();
        const service = Object.fromEntries(['createSignupIntent', 'createSignupCheckout', 'syncSignup', 'completeSignupWithoutPayment'].map(name => [name, fail]));
        const controller = load('controllers/publicSignupController.js', {
            '../lib/tenant/signupAvailability': { signupAvailable: () => true, assertSignupAvailable() {} },
            '../lib/tenant/signupService': service,
            '../lib/billing/tenantBillingDefaults': { getFrontendBaseUrl: () => 'https://synthetic.invalid' },
        });
        for (const name of ['startSignup', 'checkoutSignup', 'completeSignup', 'syncSignup', 'takbullReturn', 'takbullCancel']) {
            const res = response();
            await controller[name]({ body: {}, params: { intentId: INTENT }, query: { intentId: INTENT } }, res);
            assertPausedResponse(res);
        }
    });
});

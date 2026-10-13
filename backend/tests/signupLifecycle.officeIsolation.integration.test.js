'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

test('paid signup and renewal with real PostgreSQL office policies', { skip: !process.env.SIGNUP_RELEASE_QA_CONFIG }, async t => {
    const config = JSON.parse(fs.readFileSync(process.env.SIGNUP_RELEASE_QA_CONFIG));
    assert.equal(config.host, '127.0.0.1');
    assert.equal(String(config.port), '55440');
    assert.equal(config.database, 'legal_signup_release_20261013_qa');
    Object.assign(process.env, {
        NODE_ENV: 'test', DB_HOST: config.host, DB_PORT: String(config.port), DB_NAME: config.database,
        DB_USER: config.user, DB_PASSWORD: config.password, DB_SSL: 'false', DB_DISABLE_CONNECT_TEST: 'true', DB_POOL_MAX: '8',
        MULTI_TENANT_MODE: 'true', TENANT_DB_ISOLATION_ENABLED: '1', SELF_SERVICE_SIGNUP_ENABLED: '1',
        PROVIDER_SECRETS_KEY: crypto.randomBytes(32).toString('hex'), JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        BACKGROUND_JOBS_ENABLED: 'false', NOTIFICATIONS_NOOP: 'true', BILLING_RENEWAL_SCHEDULER_ENABLED: 'false',
        FRONTEND_URL: 'https://synthetic.invalid', PUBLIC_API_BASE_URL: 'https://synthetic.invalid',
    });
    const pool = require('../config/db');
    const scope = require('../lib/tenant/databaseScope');
    const { runWithTenant } = require('../lib/tenant/tenantContext');
    const { decryptSecret } = require('../lib/billing/secrets');
    t.after(() => pool.end());
    await pool.ensureOfficeIsolation();
    // The disposable isolation fixture clones schema, not catalogue seed rows.
    await scope.withSystem(() => pool.query(`INSERT INTO subscription_plans(plan_key,name,documents_retention_days)
        VALUES('BASIC','Basic',60),('PRO','Pro',180),('ENTERPRISE','Enterprise',365) ON CONFLICT(plan_key) DO NOTHING`));
    // Previous runs in this named disposable database are inert, never deleted.
    await scope.withSystem(() => pool.query(`UPDATE firm_billing SET auto_renew=false WHERE law_firm_tenant_id IN
        (SELECT id FROM law_firm_tenants WHERE slug LIKE 'qa-release-%' AND name='Synthetic release office')`));
    const orders = new Map(); let hostedCalls = 0, messages = 0;
    const provider = require('../lib/payments/takbullClient');
    provider.getTakbullCredentialsFromEnv = () => ({ apiKey: 'synthetic', apiSecret: 'synthetic', mode: 'test' });
    provider.createTakbullPaymentPage = async input => {
        assert.equal(input.amount, 1); assert.equal(input.currency, 'ILS'); assert.equal(input.saveToken, true);
        if (input.orderReference?.startsWith('signup-')) assert.equal(input.returnMode, 'redirect');
        hostedCalls++;
        const uniqId = crypto.randomUUID(); orders.set(uniqId, { ...input, paid: false, transactionId: crypto.randomUUID() });
        return { uniqId, redirectUrl: 'https://synthetic.invalid/pay/' + uniqId };
    };
    provider.validateTakbullNotification = async (_credentials, reference) => ({ ok: true, paid: orders.get(reference)?.paid === true, token: 'synthetic-card-token' });
    provider.chargeTakbullToken = async () => { throw Error('UNEXPECTED_PROVIDER_DISPATCH'); };
    const actualFetch = global.fetch;
    t.after(() => { global.fetch = actualFetch; });
    global.fetch = async input => {
        const url = new URL(input);
        assert.equal(url.origin, 'https://api.takbull.co.il');
        if (url.pathname.endsWith('/GetOrder')) {
            const reference = url.searchParams.get('orderUniqId'), order = orders.get(reference);
            return { ok: true, json: async () => ({ uniqId: reference, order_reference: order.orderReference, currency: 'ILS', orderTotalSum: 1,
                orderStatus: order.paid ? 3 : 0, transactions: order.paid ? [{ status: 1, amount: 1, transactionId: order.transactionId }] : [] }) };
        }
        if (url.pathname.endsWith('/GetTransaction')) {
            const id = url.searchParams.get('transactionInternalNumber');
            assert.ok([...orders.values()].some(o => o.transactionId === id && o.paid));
            const transaction = [...orders.values()].find(o => o.transactionId === id);
            return { ok: true, json: async () => ({ transactionId: id, currency: 'ILS', amount: transaction.amount || 1, status: 1, statusCode: 0,
                transactionType: 10, paymentMethod: 3, cardToken: 'synthetic-card-token', last4DigitsCardNumber: '1234' }) };
        }
        throw Error('UNEXPECTED_NETWORK_REQUEST');
    };
    const logoService = require('../lib/tenant/signupLogo');
    logoService.saveSignupLogo = async (value, id) => {
        const logo = await logoService.normalizeSignupLogo(value);
        return { version: 1, key: `signup-logos/${id}/${logo.sha256}.png`, url: `https://synthetic.invalid/${logo.sha256}.png`, sha256: logo.sha256 };
    };
    require('../utils/sendMessage').sendMessage = async () => { messages++; };
    const welcome = require('../lib/tenant/signupWelcomeEmail');
    const welcomeMessages=[];
    const welcomeDispatcher=welcome.createWelcomeDispatcher({database:pool,deliver:async (message,id)=>{welcomeMessages.push({message,id});return {status:'sent'};}});
    welcome.flushWelcome=id=>welcomeDispatcher.flush(id);
    const signup = require('../lib/tenant/signupService');
    const { quoteSignup, CONSENT_VERSION } = require('../lib/billing/signupQuote');
    const { createSignupRenewal } = require('../lib/billing/selfServiceRenewal');
    const { computeFlags } = require('../lib/billing/tenantBillingDefaults');
    const png = await require('sharp')({ create: { width: 1024, height: 1024, channels: 4, background: '#247466' } }).png().toBuffer();
    const id = crypto.randomUUID(), slug = 'qa-release-' + id.slice(0, 8);
    const selection = { platformId: 'site', resourceId: 'basic', signingId: 'none', billingInterval: 'monthly' };
    const payload = { ...selection, idempotencyKey: id, slug, firmName: 'Synthetic release office', adminName: 'Synthetic owner',
        adminPhone: '0500000091', adminEmail: 'signup-qa@synthetic.invalid', billingConsent: true, consentVersion: CONSENT_VERSION,
        expectedPriceIls: quoteSignup(selection).recurringAmountIls, logoDataUrl: 'data:image/png;base64,' + png.toString('base64') };
    let intent, office;
    await t.test('consent, final quote, mandatory logo and idempotent intent precede checkout', async () => {
        await assert.rejects(signup.createSignupIntent({ ...payload, adminEmail: '' }), { code: 'INVALID_EMAIL' });
        await assert.rejects(signup.createSignupIntent({ ...payload, adminEmail: 'one@example.com,two@example.com' }), { code: 'INVALID_EMAIL' });
        await assert.rejects(signup.createSignupIntent({ ...payload, billingConsent: false }), { code: 'CONSENT_REQUIRED' });
        await assert.rejects(signup.createSignupIntent({ ...payload, expectedPriceIls: 1 }), { code: 'PRICE_CHANGED' });
        await assert.rejects(signup.createSignupIntent({ ...payload, logoDataUrl: undefined }), { code: 'LOGO_REQUIRED' });
        const attempts = await Promise.all([signup.createSignupIntent(payload), signup.createSignupIntent(payload)]);
        assert.equal(attempts[0].id, attempts[1].id); intent = attempts[0];
        assert.equal(intent.recurringAmountIls, 532); assert.equal(hostedCalls, 0);
    });
    await t.test('one hosted ₪1 checkout requests card storage; unpaid callbacks cannot provision', async () => {
        const checkout = await signup.createSignupCheckout(intent.id);
        assert.equal(checkout.amount, 1);
        await signup.createSignupCheckout(intent.id); assert.equal(hostedCalls, 1);
        await signup.syncSignup(intent.id);
        assert.equal((await signup.getSignupIntent(intent.id)).status, 'pending_payment');
        await assert.rejects(signup.completeSignupWithoutPayment(intent.id), { code: 'PAYMENT_REQUIRED' });
        assert.equal((await scope.withSystem(() => pool.query('SELECT id FROM law_firm_tenants WHERE slug=$1', [slug]))).rowCount, 0);
        assert.equal(welcomeMessages.length,0);
        assert.equal((await scope.withSystem(()=>pool.query('SELECT welcome_email_status FROM signup_intents WHERE id=$1',[id]))).rows[0].welcome_email_status,null);
    });
    await t.test('verified payment provisions once, encrypts card and grants three calendar months', async () => {
        for (const order of orders.values()) order.paid = true;
        await Promise.all([signup.syncSignup(intent.id), signup.syncSignup(intent.id)]);
        const completed = await signup.getSignupIntent(intent.id); assert.equal(completed.status, 'completed');
        office = (await scope.withSystem(() => pool.query('SELECT * FROM law_firm_tenants WHERE id=$1', [completed.tenantId]))).rows[0];
        assert.ok(office.owner_user_id); assert.equal(messages, 1);
        assert.equal(welcomeMessages.length,1);
        const mail=welcomeMessages[0].message;assert.equal(mail.toEmail,payload.adminEmail);assert.equal(mail.recurringAmountIls,532);
        assert.equal(mail.loginUrl,`https://synthetic.invalid/${slug}/LoginStack/LoginScreen`);
        assert.ok(!JSON.stringify(mail).includes('synthetic-card-token'));
        assert.equal((await scope.withSystem(()=>pool.query('SELECT welcome_email_status FROM signup_intents WHERE id=$1',[id]))).rows[0].welcome_email_status,'sent');
        await signup.syncSignup(id);await Promise.all([welcomeDispatcher.flush(id),welcomeDispatcher.flush(id)]);assert.equal(welcomeMessages.length,1);
        await runWithTenant(office, async () => {
            const account = (await pool.query('SELECT * FROM firm_billing')).rows[0];
            assert.equal(account.status, 'complimentary'); assert.equal(Number(account.price_monthly_ils), 532);
            assert.equal(+account.renews_at, +account.complimentary_until);
            assert.ok(Math.abs(+account.renews_at - +signup.trialEnd(new Date())) < 5000);
            const card = (await pool.query('SELECT * FROM firm_payment_methods')).rows[0];
            assert.ok(card.token_encrypted.startsWith('enc:v1:')); assert.equal(decryptSecret(card.token_encrypted), 'synthetic-card-token');
            assert.equal((await pool.query('SELECT * FROM platform_admins')).rowCount, 0);
            assert.ok(office.branding.logoUrl.includes('synthetic.invalid'));
        });
    });
    if (!office) return;
    await t.test('durable welcome retry is single-dispatch and cannot roll back or expose a paid office',async()=>{
        const setState=sql=>scope.withSystem(()=>pool.query(sql,[id]));
        await setState("UPDATE signup_intents SET welcome_email_status='pending',welcome_email_next_at=now(),welcome_email_attempts=0 WHERE id=$1");
        let deliveries=0;
        const failed=welcome.createWelcomeDispatcher({database:pool,deliver:async()=>{deliveries++;return {status:'retry',code:'SMTP_REJECTED'};}});
        await Promise.all([failed.flush(id),failed.flush(id),failed.flush(id)]);assert.equal(deliveries,1);
        let state=(await setState('SELECT status,welcome_email_status FROM signup_intents WHERE id=$1')).rows[0];
        assert.equal(state.status,'completed');assert.equal(state.welcome_email_status,'pending');
        await setState('UPDATE signup_intents SET welcome_email_next_at=now() WHERE id=$1');
        await welcomeDispatcher.flush(id);assert.equal(welcomeMessages.length,2);
        await setState("UPDATE signup_intents SET welcome_email_status='sending',welcome_email_updated_at=now()-interval '6 minutes' WHERE id=$1");
        await welcomeDispatcher.flush(id);assert.equal(welcomeMessages.length,2);
        state=(await setState('SELECT status,welcome_email_status FROM signup_intents WHERE id=$1')).rows[0];assert.equal(state.welcome_email_status,'uncertain');assert.equal(state.status,'completed');
        await welcomeDispatcher.flush(id);assert.equal(welcomeMessages.length,2);
        const stranger={id:crypto.randomUUID()};assert.equal((await runWithTenant(stranger,()=>pool.query('SELECT welcome_email FROM signup_intents WHERE id=$1',[id]))).rowCount,0);
        await setState("UPDATE signup_intents SET welcome_email_status='sent',welcome_email_error=null WHERE id=$1");
    });
    let clock = new Date(), calls = 0;
    const renewal = mode => createSignupRenewal({ database: pool, now: () => clock, credentials: provider.getTakbullCredentialsFromEnv,
        charge: async input => { calls++; assert.equal(input.amount, 532); assert.equal(input.cardExternalToken, 'synthetic-card-token');
            if (mode === 'unknown') throw Error('SYNTHETIC_TIMEOUT');
            return { ok: mode === 'success', transactionInternalNumber: mode === 'success' ? crypto.randomUUID() : null }; },
        verify: async (_credentials, transaction, amount) => { assert.ok(transaction); assert.equal(amount, 532); } });
    await t.test('trial blocks charges; scheduled concurrent renewal dispatches once at the agreed final price', async () => {
        const service = renewal('success');
        assert.equal((await runWithTenant(office, () => service.renew(office.id))).skipped, true); assert.equal(calls, 0);
        const row = (await scope.withSystem(() => pool.query('SELECT renews_at FROM firm_billing WHERE law_firm_tenant_id=$1', [office.id]))).rows[0];
        clock = new Date(+row.renews_at + 1000);
        await Promise.all([service.due(), service.due(), service.due()]);
        assert.equal(calls, 1);
        await runWithTenant(office, async () => {
            const row = (await pool.query('SELECT * FROM firm_billing')).rows[0]; assert.equal(row.status, 'active'); assert.ok(row.renews_at > clock);
        });
    });
    await t.test('decline preserves data, grants exactly 72 hours and does not repeat or extend grace', async () => {
        const before = calls;
        const account = await runWithTenant(office, async () => (await pool.query('SELECT * FROM firm_billing')).rows[0]);
        clock = new Date(+account.renews_at + 1000);
        await renewal('decline').due(); assert.equal(calls, before + 1);
        const failed = await runWithTenant(office, async () => (await pool.query('SELECT * FROM firm_billing')).rows[0]);
        assert.equal(failed.status, 'past_due'); assert.equal(+failed.grace_until, +clock + 72 * 3600000);
        const flags = at => computeFlags({ status: failed.status, billingEnabled: true, complimentaryUntil: failed.complimentary_until, graceUntil: failed.grace_until }, at);
        assert.equal(flags(new Date(+failed.grace_until - 1)).locked, false); assert.equal(flags(failed.grace_until).locked, true);
        clock = new Date(+clock + 24 * 3600000); await renewal('decline').due(); assert.equal(calls, before + 1);
        await runWithTenant(office, async () => {
            assert.equal(+(await pool.query('SELECT grace_until FROM firm_billing')).rows[0].grace_until, +failed.grace_until);
            assert.equal((await pool.query('SELECT * FROM users')).rowCount, 1);
            assert.equal((await pool.query('SELECT * FROM firm_payment_methods')).rowCount, 1);
        });
    });
    await t.test('explicit owner retry after a definite decline charges once and retains failed evidence', async () => {
        const service = renewal('success'), module = require('../lib/billing/selfServiceRenewal');
        const saved = module.signupRenewal; module.signupRenewal = service;
        try {
            const before = calls;
            const results = await Promise.all(Array.from({ length: 3 }, () => runWithTenant(office,
                () => require('../lib/billing/firmBillingService').chargeSavedCard({ kind: 'retry' }))));
            assert.equal(calls, before + 1); assert.ok(results.some(r => r.ok));
            await runWithTenant(office, async () => {
                const row = (await pool.query('SELECT * FROM firm_billing')).rows[0];
                assert.equal(row.status, 'active'); assert.equal(row.grace_until, null);
                assert.ok((await pool.query("SELECT id FROM firm_payment_intents WHERE status='failed' AND signup_cycle_at IS NOT NULL")).rowCount > 0);
            });
        } finally { module.signupRenewal = saved; }
    });
    await t.test('expired access exposes recovery only to the owner and a neutral outage to customers', async () => {
        const request = require('supertest'), express = require('express'), jwt = require('jsonwebtoken');
        const clientId = await runWithTenant(office, async () => {
            await pool.query("UPDATE firm_billing SET complimentary_until=now()-interval '4 months',renews_at=now()-interval '4 days',status='past_due',grace_until=now()-interval '1 minute'");
            return (await pool.query("INSERT INTO users(name,role) VALUES('Synthetic customer','User') RETURNING userid")).rows[0].userid;
        });
        const app = express(); app.use(express.json()); app.use((_q, _s, next) => scope.withoutScope(next));
        app.use(require('../middlewares/resolveTenant'));
        app.use('/api/billing', require('../routes/billingRoutes'));
        app.get('/api/protected-records', require('../middlewares/authMiddleware'), (_q, res) => res.json({ ok: true }));
        app.use(require('../middlewares/errorHandler'));
        const call = (userId, path) => request(app).get(path).set('Authorization', 'Bearer ' + jwt.sign({ userid: userId, role: userId === clientId ? 'User' : 'Admin' }, process.env.JWT_SECRET, { expiresIn: '2m' }));
        const clientLock = await call(clientId, '/api/billing/lock-status'); assert.equal(clientLock.status, 200);
        assert.deepEqual(clientLock.body, { locked: true, canManageBilling: false });
        const denied = await call(clientId, '/api/protected-records'); assert.equal(denied.status, 503);
        assert.ok(!/billing|payment|532|תשלום|חוב/.test(JSON.stringify(denied.body)));
        assert.equal((await call(clientId, '/api/billing/plan')).status, 403);
        const ownerLock = await call(office.owner_user_id, '/api/billing/lock-status'); assert.equal(ownerLock.status, 200);
        assert.equal(ownerLock.body.canManageBilling, true); assert.equal(ownerLock.body.locked, true); assert.ok(ownerLock.body.payUrl);
        assert.equal((await call(office.owner_user_id, '/api/billing/plan')).status, 200);
        assert.equal((await runWithTenant(office, () => pool.query('SELECT userid FROM users'))).rowCount, 2);
    });
    await t.test('a ₪1 replacement-card verification cannot settle the unpaid subscription', async () => {
        const billing = require('../lib/billing/firmBillingService');
        await runWithTenant(office, async () => {
            const before = (await pool.query('SELECT * FROM firm_billing')).rows[0];
            const checkout = await billing.createCheckout({ kind: 'setup' });
            assert.equal(checkout.amount, 1); orders.get(checkout.uniqId).paid = true;
            await billing.handleTakbullNotification({ uniqId: checkout.uniqId });
            const after = (await pool.query('SELECT * FROM firm_billing')).rows[0];
            assert.equal(after.status, before.status);
            assert.equal(+after.renews_at, +before.renews_at);
            assert.equal(+after.grace_until, +before.grace_until);
        });
    });
    await t.test('uncertain provider outcome blocks both owner retry and alternate hosted payment', async () => {
        clock = new Date(); const service = renewal('unknown');
        await assert.rejects(runWithTenant(office, () => service.renew(office.id)), /SYNTHETIC_TIMEOUT/);
        const before = calls, pagesBefore = hostedCalls;
        assert.equal((await runWithTenant(office, () => service.renew(office.id, { retryFailed: true }))).status, 'pending');
        await assert.rejects(runWithTenant(office, () => require('../lib/billing/firmBillingService').createCheckout({ kind: 'retry' })), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
        assert.equal(calls, before); assert.equal(hostedCalls, pagesBefore);
    });
    await t.test('cancelling renewal retains the office and card and never dispatches another charge', async () => {
        const before = calls;
        const result = await runWithTenant(office, () => require('../lib/billing/firmBillingService').cancelSubscription());
        assert.equal(result.autoRenew, false); assert.equal(result.billingEnabled, true);
        assert.equal((await runWithTenant(office, () => renewal('success').renew(office.id, { retryFailed: true }))).skipped, true);
        assert.equal(calls, before);
        await runWithTenant(office, async () => {
            assert.equal((await pool.query('SELECT userid FROM users')).rowCount, 2);
            assert.equal((await pool.query('SELECT id FROM firm_payment_methods WHERE is_active')).rowCount, 1);
        });
    });
    await t.test('a lost upgrade response retains its reservation and cannot charge again', async () => {
        const billing = require('../lib/billing/firmBillingService');
        let upgradeCalls = 0;
        billing.setChargeTakbullTokenForTests(async () => { upgradeCalls++; throw Error('SYNTHETIC_UPGRADE_TIMEOUT'); });
        try {
            await runWithTenant(office, async () => {
                await pool.query("UPDATE firm_payment_intents SET status='cancelled' WHERE status='pending'");
                await pool.query("UPDATE firm_billing SET status='active',auto_renew=true,grace_until=null,complimentary_until=null,renews_at=now()+interval '15 days'");
                const selection = { platformId: 'site', resourceId: 'pro', signingId: 'none', billingInterval: 'monthly', usage: {} };
                await assert.rejects(billing.savePackage(selection), /SYNTHETIC_UPGRADE_TIMEOUT/);
                assert.equal((await pool.query("SELECT id FROM firm_payment_intents WHERE kind='upgrade' AND status='pending'")).rowCount, 1);
                await assert.rejects(billing.savePackage(selection), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
                await assert.rejects(billing.savePackage({ ...selection, resourceId: 'basic' }), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
                assert.equal(upgradeCalls, 1);
                assert.equal((await pool.query('SELECT resource_id FROM firm_billing')).rows[0].resource_id, 'basic');
            });
        } finally { billing.setChargeTakbullTokenForTests(); }
    });
    await t.test('declined upgrades preserve paid access; concurrent verified upgrades settle once', async () => {
        const billing = require('../lib/billing/firmBillingService');
        const selection = { platformId: 'site', resourceId: 'pro', signingId: 'none', billingInterval: 'monthly', usage: {} };
        let upgrades = 0;
        await runWithTenant(office, async () => {
            await pool.query("UPDATE firm_payment_intents SET status='cancelled' WHERE kind='upgrade' AND status='pending'");
            billing.setChargeTakbullTokenForTests(async () => { upgrades++; return { ok: false }; });
            try {
                const before = (await pool.query('SELECT * FROM firm_billing')).rows[0];
                await assert.rejects(billing.savePackage(selection), { code: 'PAYMENT_DECLINED' });
                const declined = (await pool.query('SELECT * FROM firm_billing')).rows[0];
                assert.equal(declined.status, before.status); assert.equal(+declined.renews_at, +before.renews_at);
                assert.equal(declined.resource_id, 'basic');
                const callsBefore = upgrades;
                billing.setChargeTakbullTokenForTests(async input => {
                    upgrades++; const transactionId = crypto.randomUUID();
                    orders.set(transactionId, { transactionId, amount: input.amount, paid: true });
                    return { ok: true, transactionInternalNumber: transactionId };
                });
                const results = await Promise.allSettled([billing.savePackage(selection), billing.savePackage(selection), billing.savePackage(selection)]);
                assert.ok(results.some(r => r.status === 'fulfilled' && r.value.charged), JSON.stringify(results.map(r => r.status === 'rejected' ? r.reason.message : r.value)));
                assert.equal(upgrades, callsBefore + 1);
                assert.equal((await pool.query("SELECT id FROM firm_payment_intents WHERE kind='upgrade' AND status='succeeded'")).rowCount, 1);
                assert.equal((await pool.query('SELECT resource_id FROM firm_billing')).rows[0].resource_id, 'pro');
                await billing.savePackage(selection); assert.equal(upgrades, callsBefore + 1);
                await assert.rejects(billing.savePackage({ ...selection, resourceId: 'basic', usage: { storage: { bytesTotal: 10 ** 15 }, seats: { used: 10000 } } }), { code: 'PACKAGE_DOWNGRADE_BLOCKED' });
            } finally { billing.setChargeTakbullTokenForTests(); }
        });
    });
});

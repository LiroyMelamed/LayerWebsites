'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../lib/systemMessages');
const { captureSignupSystemConsent, signupSystemMessageConfiguration, provisionSignupSystemMessages } = require('../lib/tenant/signupSystemMessages');
const VERSION = messages.CONSENT_VERSION;
const OFFICE = '60995d54-a683-4517-a741-707bd3ae5866';
const ID = '8206c4ca-9922-42dd-aa26-1d897e092ca3';
function mock(t, overrides = {}) {
    const prior = {};
    for (const [key, value] of Object.entries(overrides)) { prior[key] = messages[key]; messages[key] = value; }
    t.after(() => { Object.assign(messages, prior); });
}
const enabled = () => ({ captureEnabled: true, configured: true, mode: 'sharedsignup' });

test('omitted or unchecked optional consent creates no grant and does not block signup', t => {
    mock(t, { getConfig: () => { throw Error('UNCONFIGURED'); } });
    assert.equal(captureSignupSystemConsent({ billingConsent: true }), null);
    assert.equal(captureSignupSystemConsent({ systemMessagesConsent: false }), null);
    assert.equal(signupSystemMessageConfiguration().available, false);
});
test('explicit opt-in requires enabled shared signup and the exact separate consent copy', t => {
    mock(t, { getConfig: enabled });
    const date = new Date('2026-10-25T12:00:00Z');
    assert.deepEqual(captureSignupSystemConsent({ systemMessagesConsent: true, systemMessagesConsentVersion: VERSION }, () => date),
        { optedIn: true, version: VERSION, capturedAt: date });
    assert.throws(() => captureSignupSystemConsent({ systemMessagesConsent: true, systemMessagesConsentVersion: 'billing-v1' }), { code: 'INVALID_SYSTEM_MESSAGE_CONSENT' });
    assert.throws(() => captureSignupSystemConsent({ systemMessagesConsent: 'true' }), { code: 'INVALID_SYSTEM_MESSAGE_CONSENT' });
});
test('dedicated deployment cannot accidentally receive shared signup grants', t => {
    mock(t, { getConfig: () => ({ captureEnabled: true, configured: true, mode: 'dedicated' }) });
    assert.throws(() => captureSignupSystemConsent({ systemMessagesConsent: true, systemMessagesConsentVersion: VERSION }), { code: 'SYSTEM_MESSAGES_UNAVAILABLE' });
});
test('existing signup and billing-only consent are never backfilled', async t => {
    mock(t, { getConfig: enabled, setConsent: async () => { throw Error('UNEXPECTED_GRANT'); }, enqueueSubscriptionUpdate: async () => { throw Error('UNEXPECTED_EVENT'); } });
    await provisionSignupSystemMessages({}, { signup: { consent_version: 'signup-1ils-3months-v2' } });
    await provisionSignupSystemMessages({}, { signup: { system_whatsapp_opted_in: true, system_whatsapp_consent_version: 'old' } });
});
test('provisioning preserves actual capture time and queues only an active subscription update on the same client', async t => {
    const calls = [], client = { synthetic: true };
    mock(t, { getConfig: enabled, setConsent: async (c, p) => { assert.equal(c, client); calls.push(['consent', p]); },
        enqueueSubscriptionUpdate: async (c, p) => { assert.equal(c, client); calls.push(['subscription', p]); } });
    const capturedAt = new Date('2026-10-25T12:00:00Z');
    await provisionSignupSystemMessages(client, { signup: { id: ID, admin_phone: '0500000091', admin_name: 'Synthetic owner',
        system_whatsapp_opted_in: true, system_whatsapp_consent_version: VERSION, system_whatsapp_captured_at: capturedAt },
        tenant: { id: OFFICE }, adminUserId: 7, complimentaryUntil: new Date('2027-01-25T23:30:00Z') });
    assert.equal(calls.length, 2); assert.equal(calls[0][1].capturedAt, capturedAt);
    assert.equal(calls[0][1].recipient, '+972500000091'); assert.equal(calls[0][1].sourceRef, 'signup:' + ID);
    assert.deepEqual(calls[1], ['subscription', { officeId: OFFICE, ownerUserId: 7, sourceId: ID,
        status: 'active', planLabel: 'משפטית', periodEndsOn: '2027-01-26' }]);
});
test('consent/outbox failure propagates to the caller transaction rather than silently completing signup', async t => {
    mock(t, { getConfig: enabled, setConsent: async () => { throw Error('SYNTHETIC_OUTBOX_FAILURE'); } });
    await assert.rejects(provisionSignupSystemMessages({}, { signup: { id: ID, admin_phone: '0500000091', admin_name: 'Synthetic owner',
        system_whatsapp_opted_in: true, system_whatsapp_consent_version: VERSION, system_whatsapp_captured_at: new Date() }, tenant: { id: OFFICE },
        adminUserId: 7, complimentaryUntil: new Date() }), /SYNTHETIC_OUTBOX_FAILURE/);
});

test('real producer accepts the provisioned signup UUID, persists consent and trial update atomically, and deduplicates replay', async t => {
    const { PGlite } = require('@electric-sql/pglite');
    const fs = require('node:fs');
    const pg = new PGlite(); t.after(() => pg.close());
    await pg.exec(`CREATE TABLE users(userid integer PRIMARY KEY,name text,phonenumber text,role text,law_firm_tenant_id uuid);
        CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,owner_user_id integer,is_active boolean DEFAULT true);
        CREATE TABLE signup_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,status text);
        CREATE TABLE platform_admins(user_id integer,is_active boolean);
        CREATE TABLE firm_billing(id integer PRIMARY KEY);`);
    await pg.exec(fs.readFileSync(require.resolve('../migrations/2026-10-25_system_messages.sql'), 'utf8'));
    await pg.query("INSERT INTO law_firm_tenants(id,owner_user_id) VALUES($1,7)", [OFFICE]);
    await pg.query("INSERT INTO users VALUES(7,'Synthetic owner','0500000091','Admin',$1)", [OFFICE]);
    await pg.query("INSERT INTO signup_intents VALUES($1,$2,'completed')", [ID, OFFICE]);
    const client = { query: async (sql, args) => { const r = await pg.query(sql, args); return { ...r, rowCount: r.affectedRows ?? r.rows.length }; } };
    const now = new Date('2026-10-25T12:00:00Z');
    const core = messages.createSystemMessagesService({ now: () => now, env: {
        CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED: 'true', CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED: 'false',
        CENTRAL_SYSTEM_MESSAGES_MODE: 'sharedsignup', CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID: 'legal-shared-synthetic',
        MULTI_TENANT_MODE: 'true', TENANT_DB_ISOLATION_ENABLED: '1',
    } });
    mock(t, { getConfig: core.getConfig, setConsent: core.setConsent, enqueueSubscriptionUpdate: core.enqueueSubscriptionUpdate });
    const source = { signup: { id: ID, admin_phone: '0500000091', admin_name: 'Synthetic owner', system_whatsapp_opted_in: true,
        system_whatsapp_consent_version: VERSION, system_whatsapp_captured_at: now }, tenant: { id: OFFICE }, adminUserId: 7,
        complimentaryUntil: new Date('2027-01-25T23:30:00Z') };
    await require('../lib/tenant/databaseScope').withSystem(async () => {
        await client.query('BEGIN'); await provisionSignupSystemMessages(client, source); await client.query('COMMIT');
        await client.query('BEGIN'); await provisionSignupSystemMessages(client, source); await client.query('COMMIT');
    });
    const rows = (await pg.query('SELECT event_family,prepared FROM central_system_message_outbox ORDER BY event_family')).rows;
    assert.equal(rows.length, 2); assert.deepEqual(rows.map(r => r.event_family), ['consent', 'subscription_update']);
    const body = JSON.parse(rows[1].prepared.body);
    assert.equal(body.message.kind, 'subscription_update'); assert.equal(body.message.periodEndsOn, '2027-01-26');
    assert.equal(body.consent.capturedAt, now.toISOString()); assert.equal(body.recipient, '+972500000091');
    assert.ok(!rows.some(row => JSON.stringify(row.prepared).includes('payment_received')));
});

test('real signup intent stores separate server-captured consent and rejects changed consent on the same signup identity', async t => {
    const { PGlite } = require('@electric-sql/pglite');
    const fs = require('node:fs');
    const pg = new PGlite(); t.after(() => pg.close());
    await pg.exec(`CREATE TABLE signup_intents(id uuid PRIMARY KEY,request_hash text,slug text,firm_name text,
        admin_name text,admin_phone text,admin_email text,lawyer_count integer,practice_areas jsonb,
        platform_id text,resource_id text,signing_id text,billing_interval text,price_monthly_ils numeric,
        consent_version text,consented_at timestamptz,recurring_amount_ils numeric,vat_percent numeric,logo jsonb,
        status text DEFAULT 'pending_payment',law_firm_tenant_id uuid,payment_intent_id uuid,created_at timestamptz DEFAULT now());`);
    await pg.exec(fs.readFileSync(require.resolve('../migrations/2026-10-25_signup_system_message_consent.sql'), 'utf8'));
    const client = { query: async (sql, args) => {
        const values = args?.map(value => Array.isArray(value) ? JSON.stringify(value) : value);
        const r = await pg.query(sql, values); return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    }, release: () => {} };
    const replace = (path, exports) => {
        const file = require.resolve(path), prior = require.cache[file];
        require.cache[file] = { id: file, filename: file, loaded: true, exports };
        t.after(() => { if (prior) require.cache[file] = prior; else delete require.cache[file]; });
    };
    replace('../config/db', { query: client.query, connect: async () => client });
    replace('../lib/tenant/signupLogo', { saveSignupLogo: async () => ({ synthetic: true }) });
    replace('../lib/tenant/signupAvailability', { assertSignupAvailable: () => {} });
    replace('../lib/tenant/tenantService', { slugAvailable: async () => true });
    replace('../lib/payments/takbullClient', { getTakbullCredentialsFromEnv: () => ({ synthetic: true }) });
    replace('../lib/billing/secrets', { getProviderSecretsKey: () => true });
    replace('../utils/sendMessage', { sendMessage: async () => { throw Error('UNEXPECTED_DELIVERY'); } });
    mock(t, { getConfig: enabled });
    const file = require.resolve('../lib/tenant/signupService'); delete require.cache[file];
    t.after(() => { delete require.cache[file]; });
    const signup = require('../lib/tenant/signupService');
    const selection = { platformId: 'site', resourceId: 'basic', signingId: 'none', billingInterval: 'monthly' };
    const payload = { ...selection, idempotencyKey: ID, slug: 'synthetic-consent', firmName: 'Synthetic office',
        adminName: 'Synthetic owner', adminPhone: '0500000091', adminEmail: 'synthetic@example.invalid',
        expectedPriceIls: require('../lib/billing/signupQuote').quoteSignup(selection).recurringAmountIls,
        billingConsent: true, consentVersion: 'signup-1ils-3months-v2', systemMessagesConsent: true,
        systemMessagesConsentVersion: VERSION, logoDataUrl: 'synthetic-logo' };
    const before = new Date(); await signup.createSignupIntent(payload); const after = new Date();
    const stored = (await pg.query('SELECT * FROM signup_intents WHERE id=$1', [ID])).rows[0];
    assert.equal(stored.system_whatsapp_opted_in, true); assert.equal(stored.system_whatsapp_consent_version, VERSION);
    assert.ok(+new Date(stored.system_whatsapp_captured_at) >= +before && +new Date(stored.system_whatsapp_captured_at) <= +after);
    assert.equal(stored.consent_version, 'signup-1ils-3months-v2');
    await signup.createSignupIntent(payload);
    assert.equal((await pg.query('SELECT count(*)::integer count FROM signup_intents')).rows[0].count, 1);
    await assert.rejects(signup.createSignupIntent({ ...payload, systemMessagesConsent: false }), { code: 'IDEMPOTENCY_CONFLICT' });
    const plain = { ...payload, idempotencyKey: '40d9f678-b206-4af8-a8e8-993f532c5842', systemMessagesConsent: false };
    await signup.createSignupIntent(plain);
    const declined = (await pg.query('SELECT * FROM signup_intents WHERE id=$1', [plain.idempotencyKey])).rows[0];
    assert.equal(declined.system_whatsapp_opted_in, false); assert.equal(declined.system_whatsapp_captured_at, null);
});

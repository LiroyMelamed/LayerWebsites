'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createIntegrationService } = require('../services/integrations/service');
const { createGroupWorker } = require('../services/integrations/worker');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MANUAL = 'https://chat.whatsapp.com/SyntheticManualLink';
const env = { INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_META_APP_ID: '123456', WHATSAPP_META_APP_SECRET: 'synthetic-app-secret', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '987654', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'synthetic-verify', WHATSAPP_WEBHOOK_CALLBACK_URL: 'https://synthetic-api.example.invalid/api/webhooks/whatsapp', WHATSAPP_LIVE_ENABLED: 'true' };

async function fixture(t, recipients = ['0501234567', '0521234567']) {
    const db = new PGlite();
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);
        CREATE TABLE users(userid serial PRIMARY KEY,law_firm_tenant_id uuid,phonenumber text);
        CREATE TABLE cases(caseid serial PRIMARY KEY,law_firm_tenant_id uuid REFERENCES law_firm_tenants(id),casename text,casemanagerid integer,currentstage integer,isclosed boolean,whatsappgrouplink text,createdat timestamptz,updatedat timestamptz);
        INSERT INTO law_firm_tenants(id,name) VALUES('${A}','Synthetic Office A'),('${B}','Synthetic Office B');`);
    for (const migration of ['2026-10-14_00_office_integrations.sql', '2026-10-15_00_case_court_reference.sql', '2026-10-15_01_court_daily_sync.sql', '2026-10-24_01_whatsapp_safety.sql']) await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8'));
    // One PGlite connection, leased as a pool with max=1. Inter-phase edits are
    // committed deterministically; this does not claim real multi-session locking.
    let tail = Promise.resolve();
    const lease = async () => { const prior = tail; let release; tail = new Promise(r => { release = r; }); await prior; return release; };
    const sqlTrace = [];
    const query = async (sql, args) => { sqlTrace.push(sql); const result = await db.query(sql, args); return { ...result, rowCount: result.rows.length || result.affectedRows || 0 }; };
    const pool = {
        query: async (...args) => { const release = await lease(); try { return await query(...args); } finally { release(); } },
        connect: async () => { const release = await lease(); return { query, release }; },
    };
    // These legacy lifecycle tests advance only the persisted safety clock
    // between explicit delivery phases. Counts and circuit pauses remain intact;
    // separate guard tests exercise pacing without advancing this fixture clock.
    const elapseQuietPeriod = async (office = A) => {
        const elapsedMs = 61 * 60 * 1000;
        const shift = value => value === null ? null : new Date(Date.parse(value) - elapsedMs).toISOString();
        const records = (await pool.query("SELECT id,safety_state FROM office_integrations WHERE provider='whatsapp' AND law_firm_tenant_id IS NOT DISTINCT FROM $1", [office])).rows;
        for (const record of records) {
            const state = record.safety_state;
            if (!Object.keys(state).length) continue;
            await pool.query('UPDATE office_integrations SET safety_state=$2 WHERE id=$1', [record.id, JSON.stringify({
                ...state, groups: state.groups.map(shift), invites: state.invites.map(entry => ({ ...entry, at: shift(entry.at) })),
                lastMutationAt: shift(state.lastMutationAt), lastObservedAt: shift(state.lastObservedAt), pausedAt: shift(state.pausedAt),
            })]);
        }
        await pool.query("UPDATE case_whatsapp_groups SET next_attempt_at=next_attempt_at-interval '61 minutes' WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND next_attempt_at IS NOT NULL", [office]);
    };
    const calls = [];
    const provider = {
        completeSignup: async input => ({ token: 'synthetic-token', pin: '123456', phoneId: input.phoneId, wabaId: input.wabaId, displayPhone: '+972500000000', eligible: true, expiresAt: null }),
        readiness: async () => ({ eligible: true, templateReady: true }),
        createGroup: async (_connection, _token, job) => { calls.push(['group', job.id]); return { request_id: `request-${job.id}` }; },
        invite: async (_connection, _token, job, phone) => { calls.push(['invite', job.id, phone]); return { messages: [{ id: `synthetic-message-${phone}` }] }; },
    };
    const service = createIntegrationService({ pool, provider, env });
    const worker = createGroupWorker(service);
    const connect = async (office = A) => {
        const session = await service.startSignup(office, 1);
        await service.completeSignup(office, 1, { state: session.state, code: 'synthetic-code', phoneId: office === A ? '123456789' : '123456780', wabaId: office === A ? '987654321' : '987654320' });
        const config = { enabled: false, mode: 'live', recipients, templateName: 'synthetic_group_invite', templateLanguage: 'he' };
        await service.saveWhatsapp(office, config); await service.checkWhatsapp(office); await service.saveWhatsapp(office, { ...config, enabled: true });
    };
    const createCase = async (office = A) => (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Synthetic case') RETURNING caseid`, [office])).rows[0].caseid;
    const enqueue = caseId => service.tx(client => service.enqueueCase(client, caseId, A));
    const job = async caseId => (await pool.query('SELECT * FROM case_whatsapp_groups WHERE case_id=$1', [caseId])).rows[0];
    const link = async (caseId, value = MANUAL) => pool.query('UPDATE cases SET whatsappgrouplink=$2 WHERE caseid=$1', [caseId, value]);
    const caseLink = async caseId => (await pool.query('SELECT whatsappgrouplink FROM cases WHERE caseid=$1', [caseId])).rows[0].whatsappgrouplink;
    const lifecycle = async (caseId, overrides = {}, office = A) => {
        const item = await job(caseId), connection = await service.connection(pool, office, 'whatsapp');
        const event = { type: 'group_create', subject: item.subject, request_id: `request-${item.id}`, group_id: `synthetic-group-${item.id}`, invite_link: `https://chat.whatsapp.com/Generated${caseId}`, ...overrides };
        await worker.receiveLifecycle(office, connection.id, connection.waba_id, connection.phone_number_id, [event]);
        return event;
    };
    const afterTxWorker = hook => createGroupWorker({ ...service, tx: async action => { const value = await service.tx(action); await hook(value); return value; } });
    t.after(() => db.close());
    await connect();
    return { pool, service, worker, calls, provider, createCase, enqueue, job, link, caseLink, lifecycle, afterTxWorker, connect, sqlTrace, elapseQuietPeriod };
}

test('manual link after enqueue cancels unsent recipients before creation and stays final after clearing', async t => {
    const f = await fixture(t), id = await f.createCase();
    await f.enqueue(id); await f.link(id); await f.worker.processOffice(A);
    let job = await f.job(id);
    assert.equal(job.status, 'cancelled'); assert.equal(job.error_code, 'MANUAL_GROUP_LINKED');
    assert.deepEqual(job.recipients.map(r => r.status), ['cancelled', 'cancelled']);
    assert.equal(await f.caseLink(id), MANUAL); assert.deepEqual(f.calls, []);
    await f.link(id, null); await f.worker.processOffice(A); assert.equal(await f.enqueue(id), null);
    assert.equal((await f.job(id)).status, 'cancelled'); assert.deepEqual(f.calls, []);
});

test('manual link committed after group claim is rechecked before external creation', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id);
    let changed = false;
    const worker = f.afterTxWorker(async value => { if (!changed && value?.id && value.status === 'queued') { changed = true; await f.link(id); } });
    await worker.processOffice(A);
    assert.equal(changed, true); assert.deepEqual(f.calls, []);
    assert.equal((await f.job(id)).status, 'cancelled'); assert.equal(await f.caseLink(id), MANUAL);
});

test('late successful webhook records actual remote group but preserves manual link and sends no invitations', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A);
    assert.equal((await f.job(id)).status, 'awaiting_webhook');
    await f.link(id); const event = await f.lifecycle(id); await f.lifecycle(id); await f.worker.processOffice(A);
    const job = await f.job(id);
    assert.equal(job.status, 'cancelled'); assert.equal(job.group_id, event.group_id); assert.equal(job.invite_link, event.invite_link);
    assert.equal(job.request_id, event.request_id); assert.equal(job.error_code, 'MANUAL_GROUP_LINKED');
    assert.deepEqual(job.recipients.map(r => r.status), ['cancelled', 'cancelled']);
    assert.equal(await f.caseLink(id), MANUAL);
    assert.equal(f.calls.filter(call => call[0] === 'group').length, 1); assert.equal(f.calls.filter(call => call[0] === 'invite').length, 0);
});

test('observed manual link revokes unresolved creation invitations permanently without inventing a remote result', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A);
    const original = await f.job(id); await f.link(id); await f.worker.processOffice(A);
    const awaiting = await f.job(id); assert.equal(awaiting.status, 'awaiting_webhook');
    assert.equal(awaiting.request_id, original.request_id); assert.equal(awaiting.group_id, null);
    assert.deepEqual(awaiting.recipients.map(r => r.status), ['cancelled', 'cancelled']);
    await f.link(id, null); const event = await f.lifecycle(id); await f.worker.processOffice(A);
    const job = await f.job(id); assert.equal(job.status, 'cancelled'); assert.equal(job.group_id, event.group_id);
    assert.equal(await f.caseLink(id), null, 'An observed manual replacement must never be attached again after it is cleared');
    assert.equal(job.error_code, 'MANUAL_GROUP_LINKED');
    assert.equal(f.calls.filter(call => call[0] === 'group').length, 1); assert.equal(f.calls.filter(call => call[0] === 'invite').length, 0);
});

test('manual link committed after invitation claim cancels that known-unsent claim before dispatch', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A); await f.lifecycle(id);
    await f.elapseQuietPeriod();
    let changed = false;
    const worker = f.afterTxWorker(async value => { if (!changed && value?.phone) { changed = true; await f.link(id); } });
    await worker.processOffice(A); await f.worker.processOffice(A);
    assert.equal(changed, true); assert.equal(f.calls.filter(call => call[0] === 'invite').length, 0);
    const job = await f.job(id); assert.equal(job.status, 'cancelled'); assert.deepEqual(job.recipients.map(r => r.status), ['cancelled', 'cancelled']);
});

test('manual link after a sent invitation preserves sent outcome and cancels only remaining recipients', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A); await f.lifecycle(id);
    await f.elapseQuietPeriod();
    await f.worker.processOffice(A); await f.link(id); await f.worker.processOffice(A); await f.worker.processOffice(A);
    const job = await f.job(id);
    assert.equal(job.status, 'needs_attention'); assert.deepEqual(job.recipients.map(r => r.status), ['sent', 'cancelled']);
    assert.ok(job.group_id); assert.ok(job.request_id); assert.equal(await f.caseLink(id), MANUAL);
    assert.equal(f.calls.filter(call => call[0] === 'group').length, 1); assert.equal(f.calls.filter(call => call[0] === 'invite').length, 1);
});

test('same generated case link keeps valid continuation, duplicate callbacks do not duplicate delivery', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A);
    const generated = `https://chat.whatsapp.com/Generated${id}`; await f.link(id, generated);
    await f.lifecycle(id); await f.lifecycle(id);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A); await f.worker.processOffice(A);
    const job = await f.job(id); assert.equal(job.status, 'invitations_sent'); assert.deepEqual(job.recipients.map(r => r.status), ['sent', 'sent']);
    assert.equal(await f.caseLink(id), generated); assert.equal(f.calls.filter(call => call[0] === 'group').length, 1); assert.equal(f.calls.filter(call => call[0] === 'invite').length, 2);
});

test('unknown creation remains non-retryable and late result is recorded without overriding manual link', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id);
    f.provider.createGroup = async () => { f.calls.push(['group-unknown']); throw Object.assign(new Error('synthetic timeout'), { uncertain: true }); };
    await f.worker.processOffice(A); assert.equal((await f.job(id)).status, 'uncertain');
    await f.link(id); await f.worker.processOffice(A); assert.equal((await f.job(id)).status, 'uncertain');
    assert.equal((await f.job(id)).error_code, 'RESULT_UNKNOWN');
    assert.deepEqual((await f.job(id)).recipients.map(r => r.status), ['cancelled', 'cancelled']);
    assert.equal((await f.job(id)).recipients.every(r => r.groupLinkReplaced === true), true, 'Manual revocation persists independently from RESULT_UNKNOWN');
    await f.link(id, null); const event = await f.lifecycle(id); await f.worker.processOffice(A);
    const job = await f.job(id); assert.equal(job.group_id, event.group_id); assert.equal(job.status, 'cancelled');
    assert.equal(job.error_code, 'MANUAL_GROUP_LINKED');
    assert.equal(await f.caseLink(id), null); assert.deepEqual(f.calls, [['group-unknown']]);
});

test('abandoned invitation claims remain uncertain, known sent statuses survive manual replacement', async t => {
    const f = await fixture(t, ['0501234567', '0521234567', '0531234567']), id = await f.createCase();
    await f.enqueue(id); await f.worker.processOffice(A); await f.lifecycle(id);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    const before = await f.job(id); before.recipients[1].status = 'sending';
    await f.pool.query("UPDATE case_whatsapp_groups SET recipients=$2,updated_at=now()-interval '20 minutes' WHERE id=$1", [before.id, JSON.stringify(before.recipients)]);
    await f.link(id); await f.worker.processOffice(A); await f.worker.processOffice(A);
    const job = await f.job(id); assert.equal(job.status, 'needs_attention');
    assert.deepEqual(job.recipients.map(r => r.status), ['sent', 'uncertain', 'cancelled']);
    assert.equal(f.calls.filter(call => call[0] === 'invite').length, 1);
});

test('uncertain actual invitation is preserved and never retried after manual replacement', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A); await f.lifecycle(id);
    await f.elapseQuietPeriod();
    f.provider.invite = async () => { f.calls.push(['invite-unknown']); throw Object.assign(new Error('synthetic timeout'), { uncertain: true }); };
    await f.worker.processOffice(A); await f.link(id); await f.worker.processOffice(A); await f.worker.processOffice(A);
    assert.deepEqual((await f.job(id)).recipients.map(r => r.status), ['uncertain', 'cancelled']);
    assert.equal((await f.job(id)).status, 'needs_attention'); assert.equal(f.calls.filter(call => call[0] === 'invite-unknown').length, 1);
});

test('foreign office ticks and lifecycle events cannot cancel, create or attach another office case', async t => {
    const f = await fixture(t), id = await f.createCase(), foreignCase = await f.createCase(B); await f.connect(B);
    await f.enqueue(id); await f.link(foreignCase); await f.worker.processOffice(B);
    assert.equal((await f.job(id)).status, 'queued'); assert.deepEqual(f.calls, []);
    await f.worker.processOffice(A); await f.lifecycle(id, {}, B);
    assert.equal((await f.job(id)).status, 'awaiting_webhook'); assert.equal(await f.caseLink(id), null);
    await f.lifecycle(id); await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    assert.equal((await f.job(id)).status, 'invitations_sent'); assert.equal(await f.caseLink(foreignCase), MANUAL);
});

test('delivery phases and lifecycle batches lock connection then one tenant case then its job', async t => {
    const f = await fixture(t), one = await f.createCase(), two = await f.createCase();
    await f.enqueue(one); await f.enqueue(two); f.sqlTrace.length = 0;
    await f.worker.processOffice(A); await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    const connection = await f.service.connection(f.pool, A, 'whatsapp');
    const events = [];
    for (const id of [two, one]) { const job = await f.job(id); events.push({ type: 'group_create', subject: job.subject, request_id: `request-${job.id}`, group_id: `synthetic-group-${id}`, invite_link: `https://chat.whatsapp.com/Generated${id}` }); }
    await f.worker.receiveLifecycle(A, connection.id, connection.waba_id, connection.phone_number_id, events);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    let caseLocks = 0, locks = [];
    for (const sql of f.sqlTrace) {
        if (sql === 'BEGIN') locks = [];
        if (sql.includes('FROM office_integrations') && /FOR (?:SHARE|UPDATE)/.test(sql)) locks.push('connection');
        if (sql.includes('FOR UPDATE') && sql.includes('FROM cases')) { locks.push('case'); caseLocks++; }
        if (sql.includes('FOR UPDATE') && sql.includes('FROM case_whatsapp_groups')) locks.push('job');
        if (sql === 'COMMIT' && locks.includes('job')) assert.deepEqual(locks, ['connection', 'case', 'job']);
    }
    assert.ok(caseLocks >= 8, 'Claims, dispatches and each callback all use case locks');
    assert.equal((await f.job(one)).status, 'created'); assert.equal((await f.job(two)).status, 'created');
});


test('queued live jobs with missing or invalid callback configuration never call the provider', async t => {
    const f = await fixture(t);
    for (const value of [undefined, 'http://unsafe.example.invalid/webhook']) {
        const id = await f.createCase(); await f.enqueue(id);
        const worker = createGroupWorker({ ...f.service, env: { ...f.service.env, WHATSAPP_WEBHOOK_CALLBACK_URL: value } });
        await worker.processOffice(A); await worker.processOffice(A);
        const job = await f.job(id); assert.equal(job.status, 'cancelled'); assert.equal(job.group_id, null);
        assert.deepEqual(job.recipients.map(r => r.status), ['pending', 'pending']);
    }
    assert.deepEqual(f.calls, []);
});

test('invalid callback blocks future invitations without erasing known sent or uncertain outcomes', async t => {
    const f = await fixture(t, ['0501234567', '0521234567', '0531234567']), id = await f.createCase();
    await f.enqueue(id); await f.worker.processOffice(A); await f.lifecycle(id);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    const before = await f.job(id); before.recipients[1].status = 'uncertain';
    await f.pool.query('UPDATE case_whatsapp_groups SET recipients=$2 WHERE id=$1', [before.id, JSON.stringify(before.recipients)]);
    const worker = createGroupWorker({ ...f.service, env: { ...f.service.env, WHATSAPP_WEBHOOK_CALLBACK_URL: 'http://unsafe.example.invalid/webhook' } });
    const count = f.calls.length; await worker.processOffice(A); await worker.processOffice(A);
    const after = await f.job(id);
    assert.equal(f.calls.length, count); assert.deepEqual(after.recipients.map(r => r.status), ['sent', 'uncertain', 'pending']);
    assert.equal(after.group_id, before.group_id); assert.equal(after.request_id, before.request_id); assert.equal(after.status, 'created');
});

test('callback removed after invitation claim is checked again before any external send', async t => {
    const f = await fixture(t), id = await f.createCase(); await f.enqueue(id); await f.worker.processOffice(A); await f.lifecycle(id);
    await f.elapseQuietPeriod();
    const currentEnv = { ...f.service.env }; let removed = false;
    const worker = createGroupWorker({ ...f.service, env: currentEnv, tx: async action => {
        const value = await f.service.tx(action);
        if (value?.phone) { removed = true; delete currentEnv.WHATSAPP_WEBHOOK_CALLBACK_URL; }
        return value;
    } });
    await worker.processOffice(A); await worker.processOffice(A);
    assert.equal(removed, true); assert.equal(f.calls.filter(call => call[0] === 'invite').length, 0);
    assert.deepEqual((await f.job(id)).recipients.map(r => r.status), ['cancelled', 'pending']);
});

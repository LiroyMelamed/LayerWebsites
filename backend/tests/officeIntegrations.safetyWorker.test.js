'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { Pool } = require('pg');
const { createIntegrationService } = require('../services/integrations/service');
const { createGroupWorker } = require('../services/integrations/worker');
const { SAFETY_POLICY } = require('../services/integrations/whatsappSafety');

// Deliberately require the isolated local cluster. Never consult DATABASE_URL,
// project .env files, default PG hosts/users, or a deployed tenant database.
const socket = process.env.SAFETY_TEST_PG_SOCKET;
const testPort = Number(process.env.SAFETY_TEST_PG_PORT);
const isolatedSocket = (testPort === 55502 && /^\/tmp\/codex-whatsapp-safety-[A-Za-z0-9._-]+$/.test(socket || '')) ||
    (testPort === 55504 && socket === '/tmp/codex-whatsapp-waha-55504');
if (typeof socket !== 'string' || !isolatedSocket) {
    throw Error('Safety worker tests require an isolated /tmp/codex-whatsapp-safety-* socket and port 55502, or the exact owned WAHA socket on port 55504');
}
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const env = Object.freeze({
    INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_META_APP_ID: '123456',
    WHATSAPP_META_APP_SECRET: 'synthetic-safety-secret', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '987654',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'synthetic-verify',
    WHATSAPP_WEBHOOK_CALLBACK_URL: 'https://synthetic-safety.example.invalid/api/webhooks/whatsapp',
    WHATSAPP_LIVE_ENABLED: 'true',
});
const policy = Object.freeze({ enabled: true, mode: 'live', recipients: ['0501234567'],
    templateName: 'synthetic_group_invite', templateLanguage: 'he' });
const migrations = ['2026-10-14_00_office_integrations.sql', '2026-10-15_00_case_court_reference.sql',
    '2026-10-15_01_court_daily_sync.sql', '2026-10-24_01_whatsapp_safety.sql', '2026-10-24_02_whatsapp_linked_device.sql'];
const sqlFile = name => fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
const localPool = (database, applicationName) => new Pool({
    host: socket, port: testPort, user: testPort === 55504 ? 'whatsapp_waha_test_owner' : 'whatsapp_safety_test_owner', password: 'synthetic-local-cluster-only', database,
    ssl: false, max: 6, connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000,
    query_timeout: 10000, options: '-c search_path=public -c statement_timeout=8000',
    application_name: applicationName,
});

async function fixture(t, initialPolicy = {}) {
    const name = `codex_wa_safety_${crypto.randomBytes(10).toString('hex')}`;
    const admin = localPool('postgres', `${name}_admin`);
    const pools = [];
    let created = false;
    t.after(async () => {
        await Promise.all(pools.map(pool => pool.end()));
        try {
            // The name is generated here, and only a successful CREATE arms DROP.
            if (created && /^codex_wa_safety_[a-f0-9]{20}$/.test(name)) await admin.query(`DROP DATABASE "${name}"`);
        } finally { await admin.end(); }
    });
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const pool = localPool(name, `${name}_one`);
    const otherPool = localPool(name, `${name}_two`);
    pools.push(pool, otherPool);
    await pool.query(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);
        CREATE TABLE users(userid serial PRIMARY KEY,law_firm_tenant_id uuid,phonenumber text);
        CREATE TABLE cases(caseid serial PRIMARY KEY,law_firm_tenant_id uuid REFERENCES law_firm_tenants(id),
            casename text,casemanagerid integer,currentstage integer,isclosed boolean,whatsappgrouplink text,
            createdat timestamptz,updatedat timestamptz);
        INSERT INTO law_firm_tenants(id,name) VALUES('${A}','Synthetic Safety A'),('${B}','Synthetic Safety B');`);
    for (const migration of migrations) await pool.query(sqlFile(migration));
    const calls = [], hooks = {};
    const now = async () => (await pool.query('SELECT clock_timestamp() AS current_time')).rows[0].current_time;
    const observe = async (kind, connection, job, phone) => {
        const persisted = (await otherPool.query('SELECT safety_state FROM office_integrations WHERE id=$1', [connection.id])).rows[0].safety_state;
        const call = { kind, jobId: job.id, office: connection.law_firm_tenant_id, phone,
            at: (await now()).getTime(), persisted };
        calls.push(call);
        return call;
    };
    // Every transport is an in-process stub; no provider client or fetch is used.
    const provider = {
        completeSignup: async input => ({ token: 'synthetic-safety-token', pin: '123456', phoneId: input.phoneId,
            wabaId: input.wabaId, displayPhone: '+972500000000', eligible: true, expiresAt: null }),
        readiness: async () => ({ eligible: true, templateReady: true }),
        createGroup: async (connection, _token, job) => {
            await observe('group', connection, job);
            return hooks.group ? hooks.group(job) : { request_id: `synthetic-request-${job.id}` };
        },
        invite: async (connection, _token, job, phone) => {
            await observe('invite', connection, job, phone);
            return hooks.invite ? hooks.invite(job, phone) : { messages: [{ id: `synthetic-accepted-${job.id}` }] };
        },
    };
    const service = createIntegrationService({ pool, provider, env });
    const otherService = createIntegrationService({ pool: otherPool, provider, env });
    const worker = createGroupWorker(service), otherWorker = createGroupWorker(otherService);
    const connection = (office = A) => service.connection(pool, office, 'whatsapp');
    const connect = async (office = A, overrides = {}) => {
        const signup = await service.startSignup(office, 1);
        await service.completeSignup(office, 1, { state: signup.state, code: 'synthetic-code',
            phoneId: office === A ? '123456789' : '123456780', wabaId: office === A ? '987654321' : '987654320' });
        const configured = { ...policy, ...overrides };
        await service.saveWhatsapp(office, { ...configured, enabled: false });
        await service.checkWhatsapp(office);
        await service.saveWhatsapp(office, configured);
    };
    const createJob = async (office = A, managerId = null) => {
        const caseId = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename,casemanagerid)
            VALUES($1,'Synthetic safety case',$2) RETURNING caseid`, [office, managerId])).rows[0].caseid;
        assert.ok(await service.tx(db => service.enqueueCase(db, caseId, office)));
        return caseId;
    };
    const job = async caseId => (await pool.query('SELECT * FROM case_whatsapp_groups WHERE case_id=$1', [caseId])).rows[0];
    const lifecycle = async (caseId, office = A) => {
        const item = await job(caseId), c = await connection(office);
        await worker.receiveLifecycle(office, c.id, c.waba_id, c.phone_number_id, [{ type: 'group_create',
            subject: item.subject, request_id: item.request_id, group_id: `synthetic-group-${item.id}`,
            invite_link: `https://chat.whatsapp.com/Synthetic${caseId}` }]);
    };
    // Initial historical fixtures let unrelated invitation/recovery branches run
    // without waiting five minutes. They never refund a recorded claim. The
    // stalled-claim race below separately documents its clock fault injection.
    const seedHistory = async (office, groupsAgo, inviteEntries = []) => {
        const current = (await now()).getTime();
        const isoAgo = ago => new Date(current - ago).toISOString();
        const groups = groupsAgo.map(isoAgo).sort();
        const invites = inviteEntries.map(({ ago, phone }) => ({ at: isoAgo(ago),
            recipientHash: crypto.createHash('sha256').update(phone).digest('hex') })).sort((a, b) => a.at.localeCompare(b.at));
        const times = [...groups, ...invites.map(entry => entry.at)].sort();
        const state = { version: 1, groups, invites, lastMutationAt: times.at(-1) || null,
            lastObservedAt: times.at(-1) || null, paused: false, reason: null, pausedAt: null };
        await pool.query("UPDATE office_integrations SET safety_state=$2 WHERE provider='whatsapp' AND law_firm_tenant_id=$1", [office, state]);
        return state;
    };
    const createdJob = async (managerId = null) => {
        const caseId = await createJob(A, managerId), item = await job(caseId);
        await seedHistory(A, [60 * 1000]);
        const link = `https://chat.whatsapp.com/Synthetic${caseId}`;
        await pool.query(`UPDATE case_whatsapp_groups SET status='created',group_id=$2,request_id=$3,invite_link=$4 WHERE id=$1`,
            [item.id, `synthetic-existing-${item.id}`, `synthetic-existing-request-${item.id}`, link]);
        await pool.query('UPDATE cases SET whatsappgrouplink=$2 WHERE caseid=$1', [caseId, link]);
        return caseId;
    };
    const afterInvitationClaim = action => createGroupWorker({ ...service, tx: async fn => {
        const value = await service.tx(fn);
        if (value?.phone) await action(value);
        return value;
    } });
    const freshResume = async () => {
        const pausedAt = Date.parse((await connection()).safety_state.pausedAt);
        for (let attempt = 0; attempt < 100 && (await now()).getTime() <= pausedAt; attempt++) await delay(2);
        assert.ok((await now()).getTime() > pausedAt, 'Database clock advanced beyond the recorded pause');
        await service.checkWhatsapp(A);
        await service.resumeWhatsapp(A, { acknowledged: true });
    };
    await connect(A, initialPolicy);
    return { name, pool, otherPool, service, otherService, worker, otherWorker, provider, hooks, calls,
        now, connection, connect, createJob, job, lifecycle, seedHistory, createdJob, afterInvitationClaim, freshResume };
}

test('independent PostgreSQL workers serialize concurrent group reservations before provider dispatch', async t => {
    const f = await fixture(t), first = await f.createJob(), second = await f.createJob();
    const blocker = await f.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM office_integrations WHERE law_firm_tenant_id=$1 FOR UPDATE', [A]);
    const running = [f.worker.processOffice(A, { caseId: first }), f.otherWorker.processOffice(A, { caseId: second })];
    let waiting = [];
    try {
        for (let attempt = 0; attempt < 100; attempt++) {
            waiting = (await f.pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
                AND application_name=ANY($1::text[]) AND wait_event_type='Lock'`, [[`${f.name}_one`, `${f.name}_two`]])).rows;
            if (waiting.length >= 2) break;
            await delay(10);
        }
    } finally { await blocker.query('COMMIT'); blocker.release(); await Promise.all(running); }
    assert.equal(new Set(waiting.map(row => row.pid)).size, 2, 'Two real database sessions wait concurrently on the connection');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].kind, 'group');
    assert.equal(f.calls[0].persisted.groups.length, 1, 'Reservation committed before the provider stub runs');
    const state = (await f.connection()).safety_state;
    assert.equal(state.groups.length, 1); assert.equal(state.invites.length, 0);
    const jobs = await Promise.all([f.job(first), f.job(second)]);
    assert.deepEqual(jobs.map(item => item.status).sort(), ['awaiting_webhook', 'queued']);
    const deferred = jobs.find(item => item.status === 'queued');
    assert.ok(['DISPATCH_IN_PROGRESS', 'GROUP_INTERVAL'].includes(deferred.error_code), 'Concurrent tick sees the outstanding claim or the completed group interval');
    assert.ok(deferred.next_attempt_at instanceof Date);
    const later = await f.createJob(); await f.otherWorker.processOffice(A, { caseId: later });
    assert.equal((await f.job(later)).error_code, 'GROUP_INTERVAL');
    assert.equal((await f.job(later)).next_attempt_at.getTime(), Date.parse(state.groups[0]) + SAFETY_POLICY.groupIntervalMs);
    assert.equal(f.calls.length, 1);

    const stalled = await fixture(t), stalledCase = await stalled.createJob(), nextCase = await stalled.createJob();
    let began, release;
    const started = new Promise(resolve => { began = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    const delayedWorker = createGroupWorker({ ...stalled.service, tx: async action => {
        const value = await stalled.service.tx(action);
        if (value?.dispatchClaim?.kind === 'group') { began(value); await barrier; }
        return value;
    } });
    const inFlight = delayedWorker.processOffice(A, { caseId: stalledCase });
    const held = await Promise.race([started, inFlight.then(() => { throw Error('Worker did not reach the committed group claim'); })]);
    let releasedAt;
    try {
        const claimed = await stalled.connection();
        assert.equal(claimed.dispatch_claim.jobId, (await stalled.job(stalledCase)).id);
        assert.equal(claimed.dispatch_claim.kind, 'group'); assert.equal(claimed.dispatch_claim.recipientHash, null);
        // Authorized fault injection: model a six-minute stall after COMMIT,
        // before the ten-minute crash threshold. Age both persisted and held
        // claim timestamps coherently; retain the outstanding reservation/count.
        const shift = value => value === null ? null : new Date(Date.parse(value) - 6 * 60 * 1000).toISOString();
        const oldState = claimed.safety_state;
        const aged = { ...oldState, groups: oldState.groups.map(shift),
            lastMutationAt: shift(oldState.lastMutationAt), lastObservedAt: shift(oldState.lastObservedAt) };
        const oldClaim = { ...claimed.dispatch_claim, reservedAt: shift(claimed.dispatch_claim.reservedAt) };
        held.dispatchClaim.reservedAt = oldClaim.reservedAt;
        await stalled.pool.query('UPDATE office_integrations SET safety_state=$2,dispatch_claim=$3 WHERE id=$1', [claimed.id, aged, oldClaim]);
        await stalled.pool.query("UPDATE case_whatsapp_groups SET updated_at=updated_at-interval '6 minutes' WHERE case_id=$1", [stalledCase]);
        await stalled.otherWorker.processOffice(A, { caseId: nextCase });
        assert.equal(stalled.calls.length, 0, 'A second worker cannot overtake a committed claim after its old pacing window expires');
        assert.deepEqual((await stalled.connection()).dispatch_claim, oldClaim);
        assert.equal((await stalled.job(stalledCase)).status, 'creating');
        assert.equal((await stalled.job(nextCase)).error_code, 'DISPATCH_IN_PROGRESS');
        releasedAt = (await stalled.now()).getTime();
    } finally { release(); await inFlight; }
    const completed = await stalled.connection();
    assert.equal(stalled.calls.length, 1); assert.equal(completed.dispatch_claim, null);
    assert.equal(completed.safety_state.groups.length, 1);
    assert.ok(Date.parse(completed.safety_state.groups[0]) >= releasedAt, 'Final dispatch extends the reservation to actual database time');
    const newest = await stalled.createJob(); await stalled.otherWorker.processOffice(A, { caseId: newest });
    assert.equal((await stalled.job(newest)).error_code, 'GROUP_INTERVAL');
    assert.equal((await stalled.job(newest)).next_attempt_at.getTime(), Date.parse(completed.safety_state.groups[0]) + SAFETY_POLICY.groupIntervalMs);
    assert.equal(stalled.calls.length, 1);
});

test('a new worker and pool retain the consumed daily budget and the queued deadline after restart', async t => {
    const f = await fixture(t);
    // Nine distinct historical reservations are still inside the rolling day.
    await f.seedHistory(A, Array.from({ length: 9 }, (_, i) => (i + 1) * 6 * 60 * 1000));
    const first = await f.createJob(); await f.worker.processOffice(A, { caseId: first });
    const queued = await f.createJob(); await f.otherWorker.processOffice(A, { caseId: queued });
    const before = await f.connection(), deferred = await f.job(queued);
    assert.equal(f.calls.length, 1); assert.equal(before.safety_state.groups.length, 10);
    assert.equal(deferred.status, 'queued'); assert.equal(deferred.error_code, 'GROUP_BUDGET');
    assert.equal(deferred.next_attempt_at.getTime(), Date.parse(before.safety_state.groups[0]) + SAFETY_POLICY.rollingWindowMs);
    await createGroupWorker(createIntegrationService({ pool: f.otherPool, provider: f.provider, env })).processOffice(A);
    assert.equal(f.calls.length, 1);
    assert.deepEqual((await f.connection()).safety_state, before.safety_state);
    assert.equal((await f.job(queued)).next_attempt_at.getTime(), deferred.next_attempt_at.getTime());
});

test('invitation budget and repeated-recipient cooldown remain deferred across independent worker restarts', async t => {
    for (const kind of ['budget', 'recipient']) {
        const f = await fixture(t), caseId = await f.createdJob();
        const entries = kind === 'budget'
            ? Array.from({ length: 50 }, (_, i) => ({ ago: 5 * 60 * 1000 + i * 20 * 1000, phone: `+97250000${String(i).padStart(4, '0')}` }))
            : [{ ago: 10 * 60 * 1000, phone: '+972501234567' }];
        const initial = await f.seedHistory(A, [2 * 60 * 60 * 1000], entries);
        await f.worker.processOffice(A); await f.otherWorker.processOffice(A);
        const deferred = await f.job(caseId), state = (await f.connection()).safety_state;
        const reason = kind === 'budget' ? 'INVITE_BUDGET' : 'RECIPIENT_COOLDOWN';
        const earliest = kind === 'budget'
            ? Date.parse(initial.invites[0].at) + SAFETY_POLICY.rollingWindowMs
            : Date.parse(initial.invites[0].at) + SAFETY_POLICY.recipientInviteCooldownMs;
        assert.equal(f.calls.length, 0, kind); assert.equal(deferred.status, 'created', kind);
        assert.equal(deferred.recipients[0].status, 'pending', kind); assert.equal(deferred.error_code, reason, kind);
        assert.equal(deferred.next_attempt_at.getTime(), earliest, kind);
        assert.deepEqual(state.invites, initial.invites, kind); assert.deepEqual(state.groups, initial.groups, kind);
        assert.equal(state.paused, false, kind);
    }
});

test('group creation and invitation observe the actual twenty-second gap and record acceptance without a delivery receipt', async t => {
    const f = await fixture(t), caseId = await f.createJob();
    await f.worker.processOffice(A); await f.lifecycle(caseId); await f.otherWorker.processOffice(A);
    const deferred = await f.job(caseId), groupAt = Date.parse((await f.connection()).safety_state.groups[0]);
    assert.equal(f.calls.length, 1); assert.equal(deferred.error_code, 'MUTATION_INTERVAL');
    assert.equal(deferred.recipients[0].status, 'pending');
    assert.equal(deferred.next_attempt_at.getTime(), groupAt + SAFETY_POLICY.mutationIntervalMs);
    const remaining = deferred.next_attempt_at.getTime() - (await f.now()).getTime();
    assert.ok(remaining <= SAFETY_POLICY.mutationIntervalMs);
    await delay(Math.max(remaining, 0) + 30);
    await f.otherWorker.processOffice(A);
    const accepted = await f.job(caseId), safety = (await f.connection()).safety_state;
    assert.deepEqual(f.calls.map(call => call.kind), ['group', 'invite']);
    assert.ok(Date.parse(safety.invites[0].at) - groupAt >= SAFETY_POLICY.mutationIntervalMs);
    assert.equal(accepted.status, 'invitations_sent'); assert.equal(accepted.recipients[0].status, 'sent');
    assert.equal(accepted.recipients[0].providerMessageId, `synthetic-accepted-${accepted.id}`);
    assert.equal('deliveredAt' in accepted.recipients[0], false);
    assert.equal('deliveryReceipt' in accepted.recipients[0], false);
});

test('rate, authentication, unknown and malformed successful creation results pause every subsequent job', async t => {
    const failures = [
        { label: 'rate', error: { providerStatus: 429 }, reason: 'PROVIDER_RATE_LIMIT', status: 'failed' },
        { label: 'auth', error: { providerStatus: 401, providerCode: 190 }, reason: 'PROVIDER_AUTH', status: 'failed' },
        { label: 'unknown', error: { uncertain: true }, reason: 'RESULT_UNKNOWN', status: 'uncertain' },
        { label: 'malformed', result: { request_id: '' }, reason: 'RESULT_UNKNOWN', status: 'uncertain' },
    ];
    for (const variant of failures) {
        const f = await fixture(t), first = await f.createJob(), queued = await f.createJob();
        f.hooks.group = async () => { if (variant.error) throw Object.assign(Error('Synthetic provider failure'), variant.error); return variant.result; };
        await f.worker.processOffice(A, { caseId: first });
        await f.otherWorker.processOffice(A, { caseId: queued }); await f.worker.processOffice(A);
        const failed = await f.job(first), c = await f.connection();
        assert.equal(f.calls.length, 1, variant.label); assert.equal(failed.status, variant.status, variant.label);
        assert.equal(failed.error_code, variant.reason, variant.label);
        assert.equal(c.safety_state.paused, true, variant.label); assert.equal(c.safety_state.reason, variant.reason, variant.label);
        assert.equal(c.safety_state.groups.length, 1, variant.label); assert.equal((await f.job(queued)).status, 'queued', variant.label);
    }
});

test('manual pause committed between invitation claim and final dispatch preserves known-unsent work and its reservation', async t => {
    const f = await fixture(t), caseId = await f.createdJob();
    let claimed = false;
    const worker = f.afterInvitationClaim(async () => {
        claimed = true; assert.equal((await f.connection()).dispatch_claim.kind, 'invite');
        await f.service.pauseWhatsapp(A);
        await assert.rejects(f.service.resumeWhatsapp(A, { acknowledged: true }), { errorCode: 'SAFETY_PENDING_RESULT' });
    });
    await worker.processOffice(A); await f.otherWorker.processOffice(A);
    const item = await f.job(caseId), state = (await f.connection()).safety_state;
    assert.equal(claimed, true); assert.equal(f.calls.length, 0);
    assert.equal(item.status, 'created'); assert.equal(item.recipients[0].status, 'pending');
    assert.equal(state.paused, true); assert.equal(state.reason, 'MANUAL_PAUSE');
    assert.equal(state.groups.length, 1); assert.equal(state.invites.length, 1, 'A committed claim is never refunded');
    assert.equal((await f.connection()).dispatch_claim, null, 'Known-unsent final dispatch releases only its own claim');
});

test('resume requires acknowledgment and a fresh health check while retaining daily reservations and deadlines', async t => {
    const f = await fixture(t);
    await f.seedHistory(A, Array.from({ length: 9 }, (_, i) => (i + 1) * 6 * 60 * 1000));
    const first = await f.createJob(); await f.worker.processOffice(A, { caseId: first });
    const queued = await f.createJob(); await f.otherWorker.processOffice(A, { caseId: queued });
    const history = (await f.connection()).safety_state, deadline = (await f.job(queued)).next_attempt_at;
    const readiness = f.provider.readiness;
    let began, release;
    const started = new Promise(resolve => { began = resolve; });
    const deferred = new Promise(resolve => { release = resolve; });
    f.provider.readiness = async () => { began(); await deferred; return { eligible: true, templateReady: true }; };
    const staleCheck = f.service.checkWhatsapp(A);
    await started;
    try { await f.service.pauseWhatsapp(A); }
    finally { release(); }
    await staleCheck;
    f.provider.readiness = readiness;
    await assert.rejects(f.service.resumeWhatsapp(A), { errorCode: 'SAFETY_REVIEW_REQUIRED' });
    await assert.rejects(f.service.resumeWhatsapp(A, { acknowledged: true }),
        { errorCode: 'SAFETY_HEALTH_CHECK_REQUIRED' }, 'A health check begun before pause remains stale when it finishes afterward');
    await f.freshResume(); await f.otherWorker.processOffice(A);
    const resumed = (await f.connection()).safety_state;
    assert.equal(resumed.paused, false); assert.equal(resumed.reason, null);
    assert.deepEqual(resumed.groups, history.groups); assert.deepEqual(resumed.invites, history.invites);
    assert.equal(resumed.lastMutationAt, history.lastMutationAt);
    assert.equal((await f.job(queued)).next_attempt_at.getTime(), deadline.getTime()); assert.equal(f.calls.length, 1);
});

test('a late adverse lifecycle event invalidates a successful health check made during an existing manual pause', async t => {
    const f = await fixture(t), caseId = await f.createJob();
    await f.worker.processOffice(A, { caseId });
    const requested = await f.job(caseId), history = (await f.connection()).safety_state;
    assert.equal(requested.status, 'awaiting_webhook'); assert.ok(requested.request_id);
    const queued = await f.createJob();
    await f.service.pauseWhatsapp(A);
    const paused = await f.connection(), pausedAt = Date.parse(paused.safety_state.pausedAt);
    for (let attempt = 0; attempt < 100 && (await f.now()).getTime() <= pausedAt; attempt++) await delay(2);
    assert.ok((await f.now()).getTime() > pausedAt);
    await f.service.checkWhatsapp(A);
    const checked = await f.connection();
    assert.equal(checked.status, 'ready'); assert.ok(checked.last_checked_at.getTime() > pausedAt);
    await f.worker.receiveLifecycle(A, checked.id, checked.waba_id, checked.phone_number_id, [{
        type: 'group_create', subject: requested.subject, request_id: requested.request_id,
        errors: [{ code: 131048 }],
    }]);
    const adverse = await f.connection();
    assert.equal(adverse.last_checked_at, null, 'An adverse event after the successful check requires another check');
    assert.equal(adverse.safety_state.paused, true); assert.equal(adverse.safety_state.reason, 'MANUAL_PAUSE');
    assert.equal(adverse.safety_state.pausedAt, paused.safety_state.pausedAt);
    assert.deepEqual(adverse.safety_state.groups, history.groups); assert.deepEqual(adverse.safety_state.invites, history.invites);
    assert.equal((await f.job(caseId)).status, 'failed'); assert.equal((await f.job(caseId)).error_code, 'META_CREATE_FAILED');
    await assert.rejects(f.service.resumeWhatsapp(A, { acknowledged: true }), { errorCode: 'SAFETY_HEALTH_CHECK_REQUIRED' });
    await f.otherWorker.processOffice(A); assert.equal((await f.job(queued)).status, 'queued'); assert.equal(f.calls.length, 1);
    await f.freshResume(); await f.otherWorker.processOffice(A);
    const resumed = await f.connection();
    assert.equal(resumed.safety_state.paused, false); assert.equal(resumed.safety_state.reason, null);
    assert.deepEqual(resumed.safety_state.groups, history.groups); assert.deepEqual(resumed.safety_state.invites, history.invites);
    assert.equal((await f.job(queued)).error_code, 'GROUP_INTERVAL');
    assert.deepEqual(f.calls.map(call => call.kind), ['group']);
});

test('an unknown invitation outcome and its reservation survive explicit resume without a resend', async t => {
    const f = await fixture(t), caseId = await f.createdJob();
    f.hooks.invite = async () => { throw Object.assign(Error('Synthetic transport timeout'), { uncertain: true }); };
    await f.worker.processOffice(A);
    const before = await f.job(caseId), history = (await f.connection()).safety_state;
    assert.equal(before.status, 'needs_attention'); assert.equal(before.recipients[0].status, 'uncertain');
    assert.equal(before.recipients[0].errorCode, 'RESULT_UNKNOWN');
    await f.freshResume(); await f.otherWorker.processOffice(A); await f.worker.processOffice(A);
    const after = await f.job(caseId), state = (await f.connection()).safety_state;
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].kind, 'invite'); assert.equal(state.paused, false);
    assert.deepEqual(after.recipients, before.recipients); assert.equal(after.status, 'needs_attention');
    assert.equal(after.group_id, before.group_id); assert.deepEqual(state.invites, history.invites);
});

test('recipient defaults and assigned manager changes after claim cancel the frozen recipient before provider dispatch', async t => {
    for (const kind of ['defaults', 'manager', 'manager_same_phone']) {
        const isManager = kind !== 'defaults';
        const f = await fixture(t, isManager ? { recipients: [], includeCaseManager: true } : {});
        const manager = isManager ? (await f.pool.query('INSERT INTO users(law_firm_tenant_id,phonenumber) VALUES($1,$2) RETURNING userid', [A, '0501234567'])).rows[0].userid : null;
        const caseId = await f.createdJob(manager);
        const frozen = (await f.job(caseId)).recipients[0];
        assert.equal(frozen.source, isManager ? 'case_manager' : 'office_default', kind);
        if (isManager) assert.equal(frozen.managerUserId, manager, kind);
        let changed = false;
        const worker = f.afterInvitationClaim(async () => {
            changed = true;
            if (kind === 'defaults') await f.service.saveWhatsapp(A, { ...policy, recipients: ['0521234567'] });
            else {
                const phone = kind === 'manager_same_phone' ? '0501234567' : '0521234567';
                const replacement = (await f.pool.query('INSERT INTO users(law_firm_tenant_id,phonenumber) VALUES($1,$2) RETURNING userid', [A, phone])).rows[0].userid;
                assert.notEqual(replacement, manager);
                await f.pool.query('UPDATE cases SET casemanagerid=$2 WHERE caseid=$1', [caseId, replacement]);
            }
        });
        await worker.processOffice(A); await f.otherWorker.processOffice(A);
        const item = await f.job(caseId), state = (await f.connection()).safety_state;
        assert.equal(changed, true, kind); assert.equal(f.calls.length, 0, kind);
        assert.equal(item.status, 'needs_attention', kind); assert.equal(item.recipients[0].status, 'cancelled', kind);
        assert.equal(item.recipients[0].errorCode, 'RECIPIENT_CHANGED', kind);
        assert.equal(state.invites.length, 1, kind); assert.equal(state.paused, false, kind);
    }
});

test('stale creating and sending claims become uncertain, pause the shared connection and never duplicate a mutation', async t => {
    for (const kind of ['creating', 'sending']) {
        const f = await fixture(t), caseId = kind === 'sending' ? await f.createdJob() : await f.createJob();
        const item = await f.job(caseId);
        if (kind === 'creating') {
            await f.seedHistory(A, [11 * 60 * 1000]);
            await f.pool.query("UPDATE case_whatsapp_groups SET status='creating',updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1", [item.id]);
        } else {
            await f.seedHistory(A, [12 * 60 * 1000], [{ ago: 11 * 60 * 1000, phone: '+972501234567' }]);
            item.recipients[0].status = 'sending';
            await f.pool.query("UPDATE case_whatsapp_groups SET recipients=$2,updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1", [item.id, JSON.stringify(item.recipients)]);
        }
        const history = (await f.connection()).safety_state, queued = await f.createJob();
        await f.worker.processOffice(A); await f.otherWorker.processOffice(A);
        const recovered = await f.job(caseId), c = await f.connection();
        assert.equal(f.calls.length, 0, kind); assert.equal(c.safety_state.paused, true, kind);
        assert.equal(c.safety_state.reason, 'RESULT_UNKNOWN', kind); assert.equal(recovered.error_code, 'RESULT_UNKNOWN', kind);
        assert.equal(recovered.status, kind === 'creating' ? 'uncertain' : 'needs_attention', kind);
        if (kind === 'sending') assert.equal(recovered.recipients[0].status, 'uncertain');
        assert.deepEqual(c.safety_state.groups, history.groups); assert.deepEqual(c.safety_state.invites, history.invites);
        assert.equal((await f.job(queued)).status, 'queued', kind);
    }
});

test('different offices use independent reservations and pause state across simultaneous worker sessions', async t => {
    const f = await fixture(t); await f.connect(B);
    const own = await f.createJob(A), other = await f.createJob(B);
    await Promise.all([f.worker.processOffice(A), f.otherWorker.processOffice(B)]);
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls.map(call => call.office).sort(), [A, B]);
    assert.equal((await f.job(own)).status, 'awaiting_webhook'); assert.equal((await f.job(other)).status, 'awaiting_webhook');
    await f.service.pauseWhatsapp(A);
    const a = await f.connection(A), b = await f.connection(B);
    assert.equal(a.safety_state.groups.length, 1); assert.equal(b.safety_state.groups.length, 1);
    assert.equal(a.safety_state.paused, true); assert.equal(b.safety_state.paused, false);
    assert.equal(b.safety_state.reason, null);
});

test('the safety migration is idempotent, preserves durable deadlines and rejects non-object or null state', async t => {
    const f = await fixture(t), first = await f.createJob(), queued = await f.createJob();
    await f.worker.processOffice(A, { caseId: first }); await f.otherWorker.processOffice(A, { caseId: queued });
    const before = (await f.connection()).safety_state, deadline = (await f.job(queued)).next_attempt_at;
    await f.pool.query(sqlFile(migrations.at(-1))); await f.pool.query(sqlFile(migrations.at(-1)));
    assert.deepEqual((await f.connection()).safety_state, before);
    assert.equal((await f.job(queued)).next_attempt_at.getTime(), deadline.getTime());
    await assert.rejects(f.pool.query("UPDATE office_integrations SET safety_state='[]'::jsonb WHERE law_firm_tenant_id=$1", [A]), { code: '23514' });
    await assert.rejects(f.pool.query('UPDATE office_integrations SET safety_state=NULL WHERE law_firm_tenant_id=$1', [A]), { code: '23502' });
    assert.deepEqual((await f.connection()).safety_state, before); assert.equal(f.calls.length, 1);
});

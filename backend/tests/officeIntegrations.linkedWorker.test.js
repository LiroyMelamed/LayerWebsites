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
const secrets = require('../services/integrations/secrets');

// A new local owned cluster only. Never read .env, DATABASE_URL or remote defaults.
const socket = process.env.WAHA_TEST_PG_SOCKET;
if (socket !== '/tmp/codex-whatsapp-waha-55504' || process.env.WAHA_TEST_PG_PORT !== '55504') throw Error('Linked worker tests require the isolated WAHA socket on port 55504');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const env = Object.freeze({ INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_WAHA_ENABLED: 'true', WHATSAPP_WAHA_DELIVERY_ENABLED: 'true', WHATSAPP_WAHA_OFFICE_ID: '11111111-1111-4111-8111-111111111111',
    WHATSAPP_WAHA_BASE_URL: 'http://127.0.0.1:3106', WHATSAPP_WAHA_API_KEY: 'synthetic-only-key',
    WHATSAPP_WAHA_WEBHOOK_URL: 'https://synthetic.invalid/api/webhooks/whatsapp-linked', WHATSAPP_WAHA_WEBHOOK_SECRET: 'synthetic-only-callback-secret-0123456789' });
const migrations = ['2026-10-14_00_office_integrations.sql', '2026-10-15_00_case_court_reference.sql', '2026-10-15_01_court_daily_sync.sql',
    '2026-10-24_01_whatsapp_safety.sql', '2026-10-24_02_whatsapp_linked_device.sql'];
const sqlFile = name => fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
const localPool = (database, applicationName) => new Pool({ host: socket, port: 55504, user: 'whatsapp_waha_test_owner', password: 'synthetic-local-cluster-only', database,
    ssl: false, max: 6, connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000, query_timeout: 10000,
    options: '-c search_path=public -c statement_timeout=8000', application_name: applicationName });

async function fixture(t, settings = {}) {
    const name = 'codex_wa_linked_' + crypto.randomBytes(10).toString('hex');
    const admin = localPool('postgres', name + '_admin'), pools = [];
    let created = false;
    t.after(async () => { await Promise.all(pools.map(pool => pool.end())); try { if (created && /^codex_wa_linked_[a-f0-9]{20}$/.test(name)) await admin.query(`DROP DATABASE "${name}"`); } finally { await admin.end(); } });
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    const pool = localPool(name, name + '_one'), otherPool = localPool(name, name + '_two'); pools.push(pool, otherPool);
    await pool.query(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
        CREATE TABLE users(userid serial PRIMARY KEY,law_firm_tenant_id uuid,phonenumber text);
        CREATE TABLE cases(caseid serial PRIMARY KEY,law_firm_tenant_id uuid,casename text,casemanagerid integer,currentstage integer,isclosed boolean,whatsappgrouplink text,createdat timestamptz,updatedat timestamptz);
        CREATE TABLE case_users(caseid integer REFERENCES cases(caseid),userid integer REFERENCES users(userid),law_firm_tenant_id uuid,PRIMARY KEY(caseid,userid));
        INSERT INTO law_firm_tenants(id) VALUES('${A}'),('${B}');
        INSERT INTO users(law_firm_tenant_id,phonenumber) VALUES('${A}','0501111111'),('${A}','0502222222'),('${A}','0503333333'),('${B}','0504444444');`);
    for (const migration of migrations) await pool.query(sqlFile(migration));
    const calls = [], hooks = {}, sessions = new Map();
    const observe = async (kind, c, job, phone) => {
        const stored = (await otherPool.query('SELECT safety_state,dispatch_claim FROM office_integrations WHERE id=$1', [c.id])).rows[0];
        const call = { kind, jobId: job.id, phone, session: c.settings.sessionName, generation: c.settings.connectionGeneration, stored };
        calls.push(call); return call;
    };
    // All providers are in-process synthetic stubs. No fetch, network or real number.
    const provider = {
        configurationInfo: () => ({ configured: true }),
        createSession: async name => { sessions.set(name, 'SCAN_QR_CODE'); calls.push({ kind: 'start', session: name }); return { sessionName: name, status: 'STARTING' }; },
        sessionStatus: async name => ({ name, status: sessions.get(name) || 'SCAN_QR_CODE', ready: false }),
        qr: async () => ({ mimetype: 'image/png', data: 'iVBORw0KGgo=' }),
        health: async name => hooks.health ? hooks.health(name) : ({ sessionName: name, status: 'WORKING', connected: true, phoneId: '972509999999', displayPhone: '+972509999999', ready: true, restricted: false, incompatibleVersion: false }),
        stopSession: async name => { sessions.set(name, 'STOPPED'); }, logout: async name => { sessions.set(name, 'STOPPED'); },
        createGroup: async (c, token, job) => { await observe('group', c, job); return hooks.group ? hooks.group(c, job) : { groupId: `120363${String(job.case_id).padStart(12, '0')}@g.us`, inviteLink: `https://chat.whatsapp.com/Synthetic${job.case_id}` }; },
        invite: async (c, token, job, phone) => { await observe('invite', c, job, phone); return hooks.invite ? hooks.invite(c, job, phone) : { messages: [{ id: `synthetic-accepted-${job.id}-${phone}` }] }; },
    };
    const service = createIntegrationService({ pool, provider, linkedProvider: provider, env });
    const otherService = createIntegrationService({ pool: otherPool, provider, linkedProvider: provider, env });
    const worker = createGroupWorker(service), otherWorker = createGroupWorker(otherService);
    const connection = (tenant = A) => service.connection(pool, tenant, 'whatsapp');
    // Worker fixtures bind the same encrypted grant and session generation as a
    // completed pairing. The separate lifecycle test below exercises start/check.
    async function seedConnected(tenant = A, overrides = {}) {
        const c = (await pool.query("INSERT INTO office_integrations(law_firm_tenant_id,provider) VALUES($1,'whatsapp') ON CONFLICT(law_firm_tenant_id,provider) DO UPDATE SET updated_at=now() RETURNING *", [tenant])).rows[0];
        const sessionName = 'off_' + c.id.replace(/-/g, '') + '_' + crypto.randomBytes(8).toString('hex');
        const config = { gateway: 'waha', connectionType: 'linked_device', sessionName, connectionGeneration: crypto.randomUUID(), linkedStatus: 'connected', linkedRevision: crypto.randomUUID(), mode: 'live', recipients: ['+972501111111'], ...settings, ...overrides };
        const marker = secrets.seal(JSON.stringify({ token: crypto.randomBytes(32).toString('base64url'), gateway: 'waha', sessionName, generation: config.connectionGeneration }), service.binding(c), env);
        await pool.query("UPDATE office_integrations SET settings=$2,secret_ciphertext=$3,status='ready',display_phone=$4,phone_number_id=$5,last_checked_at=clock_timestamp() WHERE id=$1", [c.id, config, marker, '+972509999999', '972509999999']);
        await service.saveWhatsapp(tenant, { ...config, enabled: true, recipientPermissionConfirmed: true }, tenant === A ? 1 : 4);
        return connection(tenant);
    }
    const createCase = async ({ tenant = A, manager = null, clients = [], enqueue = true } = {}) => {
        const caseId = (await pool.query("INSERT INTO cases(law_firm_tenant_id,casename,casemanagerid) VALUES($1,'Synthetic linked case',$2) RETURNING caseid", [tenant, manager])).rows[0].caseid;
        for (const userId of clients) await pool.query('INSERT INTO case_users(caseid,userid,law_firm_tenant_id) VALUES($1,$2,$3)', [caseId, userId, tenant]);
        if (enqueue) assert.ok(await service.tx(db => service.enqueueCase(db, caseId, tenant)));
        return caseId;
    };
    const job = async caseId => (await pool.query('SELECT * FROM case_whatsapp_groups WHERE case_id=$1', [caseId])).rows[0];
    const elapse = async () => {
        const c = await connection(), shift = value => value == null ? value : new Date(Date.parse(value) - 61 * 60 * 1000).toISOString(), state = c.safety_state;
        if (state.version) await pool.query('UPDATE office_integrations SET safety_state=$2 WHERE id=$1', [c.id, { ...state, groups: state.groups.map(shift), invites: state.invites.map(v => ({ ...v, at: shift(v.at) })), lastMutationAt: shift(state.lastMutationAt), lastObservedAt: shift(state.lastObservedAt), pausedAt: shift(state.pausedAt) }]);
        await pool.query("UPDATE case_whatsapp_groups SET next_attempt_at=next_attempt_at-interval '61 minutes' WHERE connection_id=$1 AND next_attempt_at IS NOT NULL", [c.id]);
    };
    const afterClaim = (kind, action) => createGroupWorker({ ...service, tx: async fn => { const value = await service.tx(fn); if (value?.dispatchClaim?.kind === kind) await action(value); return value; } });
    await seedConnected();
    return { name, pool, otherPool, service, otherService, worker, otherWorker, provider, calls, hooks, connection, seedConnected, createCase, job, elapse, afterClaim };
}

test('linked real-PG queue freezes device, persists direct group link, then paces exact invitation acceptance', async t => {
    const f = await fixture(t), caseId = await f.createCase(), before = await f.connection();
    const frozen = await f.job(caseId);
    assert.equal(frozen.gateway, 'waha'); assert.equal(frozen.session_name, before.settings.sessionName); assert.equal(frozen.connection_generation, before.settings.connectionGeneration);
    await f.worker.processOffice(A, { caseId });
    const created = await f.job(caseId);
    assert.equal(created.status, 'created'); assert.ok(created.group_id.endsWith('@g.us')); assert.equal(created.error_code, 'MUTATION_INTERVAL');
    assert.equal((await f.pool.query('SELECT whatsappgrouplink FROM cases WHERE caseid=$1', [caseId])).rows[0].whatsappgrouplink, created.invite_link);
    assert.deepEqual(f.calls.map(c => c.kind), ['group']); assert.equal(f.calls[0].stored.safety_state.groups.length, 1); assert.equal(f.calls[0].stored.dispatch_claim.kind, 'group');
    await f.elapse(); await f.otherWorker.processOffice(A, { caseId });
    const sent = await f.job(caseId);
    assert.deepEqual(f.calls.map(c => c.kind), ['group', 'invite']); assert.equal(sent.status, 'invitations_sent'); assert.equal(sent.recipients[0].status, 'sent');
    assert.ok(sent.recipients[0].providerMessageId); assert.equal(sent.recipients[0].deliveredAt, undefined);
});

test('case-scoped linked worker leaves unrelated queue, invitations, manual links and abandoned jobs untouched', async t => {
    const f = await fixture(t), queued = await f.createCase(), demo = await f.createCase(), invitation = await f.createCase(),
        manual = await f.createCase(), abandoned = await f.createCase(), target = await f.createCase();
    await f.pool.query("UPDATE case_whatsapp_groups SET mode='demo' WHERE case_id=$1", [demo]);
    for (const id of [invitation, manual]) {
        const link = `https://chat.whatsapp.com/SyntheticExisting${id}`;
        await f.pool.query("UPDATE case_whatsapp_groups SET status='created',group_id=$2,invite_link=$3 WHERE case_id=$1", [id, `120363${String(id).padStart(12, '0')}@g.us`, link]);
        await f.pool.query('UPDATE cases SET whatsappgrouplink=$2 WHERE caseid=$1', [id, id === manual ? 'https://chat.whatsapp.com/SyntheticManualReplacement' : link]);
    }
    await f.pool.query("UPDATE case_whatsapp_groups SET status='creating',updated_at=clock_timestamp()-interval '11 minutes' WHERE case_id=$1", [abandoned]);
    const others = [queued, demo, invitation, manual, abandoned];
    const jobsBefore = (await f.pool.query('SELECT * FROM case_whatsapp_groups WHERE case_id=ANY($1::integer[]) ORDER BY case_id', [others])).rows;
    const casesBefore = (await f.pool.query('SELECT * FROM cases WHERE caseid=ANY($1::integer[]) ORDER BY caseid', [others])).rows;

    await f.worker.processOffice(A, { caseId: target });
    assert.equal((await f.job(target)).status, 'created');
    assert.deepEqual(f.calls.map(call => [call.kind, call.jobId]), [['group', (await f.job(target)).id]]);
    await f.elapse();
    await f.otherWorker.processOffice(A, { caseId: target });
    assert.equal((await f.job(target)).status, 'invitations_sent');
    assert.deepEqual(f.calls.map(call => [call.kind, call.jobId]), [['group', (await f.job(target)).id], ['invite', (await f.job(target)).id]]);
    assert.deepEqual((await f.pool.query('SELECT * FROM case_whatsapp_groups WHERE case_id=ANY($1::integer[]) ORDER BY case_id', [others])).rows, jobsBefore);
    assert.deepEqual((await f.pool.query('SELECT * FROM cases WHERE caseid=ANY($1::integer[]) ORDER BY caseid', [others])).rows, casesBefore);
});

test('case-scoped linked worker preserves another case abandoned dispatch claim and cannot dispatch around it', async t => {
    const f = await fixture(t), other = await f.createCase(), target = await f.createCase(), c = await f.connection();
    const claim = { jobId: (await f.job(other)).id, kind: 'group', recipientHash: null, reservedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() };
    await f.pool.query("UPDATE case_whatsapp_groups SET status='creating',updated_at=clock_timestamp()-interval '11 minutes' WHERE case_id=$1", [other]);
    await f.pool.query('UPDATE office_integrations SET dispatch_claim=$2 WHERE id=$1', [c.id, claim]);
    const before = await f.job(other), safety = (await f.connection()).safety_state;
    await f.worker.processOffice(A, { caseId: target });
    assert.equal(f.calls.length, 0);
    assert.deepEqual(await f.job(other), before);
    assert.deepEqual((await f.connection()).dispatch_claim, claim);
    assert.deepEqual((await f.connection()).safety_state, safety);
    assert.equal((await f.job(target)).status, 'queued');
    assert.equal((await f.job(target)).error_code, 'DISPATCH_IN_PROGRESS');
});

test('case-scoped linked recovery marks only the requested abandoned case uncertain', async t => {
    const f = await fixture(t), other = await f.createCase(), target = await f.createCase();
    await f.pool.query("UPDATE case_whatsapp_groups SET status='creating',updated_at=clock_timestamp()-interval '11 minutes' WHERE case_id=ANY($1::integer[])", [[other, target]]);
    const before = await f.job(other);
    await f.worker.processOffice(A, { caseId: target });
    assert.equal(f.calls.length, 0);
    assert.deepEqual(await f.job(other), before);
    assert.equal((await f.job(target)).status, 'uncertain');
    assert.equal((await f.job(target)).error_code, 'RESULT_UNKNOWN');
    assert.equal((await f.connection()).safety_state.paused, true);
});

test('missing client consent blocks entire group; only explicit current permission releases known-unsent review', async t => {
    const f = await fixture(t, { includeCaseClients: true }), caseId = await f.createCase({ clients: [2] });
    assert.equal((await f.job(caseId)).status, 'needs_attention');
    await f.worker.processOffice(A); assert.equal(f.calls.length, 0);
    await f.service.setWhatsappContactPermission(A, { phone: '0502222222', allowed: true, evidence: 'Synthetic client explicit permission' }, 1);
    const review = await f.service.reviewWhatsappGroups(A);
    assert.equal(review.ready, 1); assert.equal((await f.job(caseId)).status, 'queued');
    await f.worker.processOffice(A, { caseId }); assert.equal(f.calls.filter(c => c.kind === 'group').length, 1);
});

test('opt-out committed after group claim prevents group mutation and retains consumed allowance', async t => {
    const f = await fixture(t), caseId = await f.createCase();
    const worker = f.afterClaim('group', () => f.service.setWhatsappContactPermission(A, { phone: '0501111111', allowed: false, evidence: 'Synthetic opt-out during claim' }, 1));
    await worker.processOffice(A, { caseId });
    assert.equal(f.calls.length, 0); assert.equal((await f.connection()).safety_state.groups.length, 1); assert.equal((await f.connection()).dispatch_claim, null);
    assert.notEqual((await f.job(caseId)).status, 'created');
    const review = await f.service.reviewWhatsappGroups(A); assert.equal(review.ready, 0);
});

test('opt-out between invitation claim and dispatch cancels that invitation and preserves known remote group', async t => {
    const f = await fixture(t), caseId = await f.createCase(); await f.worker.processOffice(A); await f.elapse();
    const groupId = (await f.job(caseId)).group_id;
    const worker = f.afterClaim('invite', () => f.service.setWhatsappContactPermission(A, { phone: '0501111111', allowed: false, evidence: 'Synthetic opt-out before invitation' }, 1));
    await worker.processOffice(A);
    assert.equal(f.calls.filter(c => c.kind === 'invite').length, 0); assert.equal((await f.job(caseId)).group_id, groupId);
    assert.equal((await f.connection()).safety_state.invites.length, 1); assert.equal((await f.connection()).dispatch_claim, null);
});

test('client removal, changed phone and changed manager shrink frozen invitation authority', async t => {
    for (const variant of ['removed', 'phone', 'manager']) {
        const f = await fixture(t, variant === 'manager' ? { recipients: [], includeCaseManager: true } : { recipients: [], includeCaseClients: true });
        if (variant !== 'manager') await f.service.setWhatsappContactPermission(A, { phone: '0502222222', allowed: true, evidence: 'Synthetic explicit client permission' }, 1);
        const caseId = await f.createCase(variant === 'manager' ? { manager: 2 } : { clients: [2] });
        await f.worker.processOffice(A); await f.elapse();
        const worker = f.afterClaim('invite', async () => {
            if (variant === 'removed') await f.pool.query('DELETE FROM case_users WHERE caseid=$1 AND userid=2', [caseId]);
            if (variant === 'phone') await f.pool.query("UPDATE users SET phonenumber='0507777777' WHERE userid=2");
            if (variant === 'manager') await f.pool.query('UPDATE cases SET casemanagerid=3 WHERE caseid=$1', [caseId]);
        });
        await worker.processOffice(A);
        assert.equal(f.calls.filter(c => c.kind === 'invite').length, 0, variant);
        assert.equal((await f.job(caseId)).recipients[0].status, 'cancelled', variant);
    }
});

test('device generation changes after claim cannot redirect a frozen operation to a new linked account', async t => {
    const f = await fixture(t), caseId = await f.createCase(), frozen = await f.job(caseId);
    const worker = f.afterClaim('group', async () => { const c = await f.connection(); await f.pool.query('UPDATE office_integrations SET settings=$2 WHERE id=$1', [c.id, { ...c.settings, connectionGeneration: crypto.randomUUID(), sessionName: 'off_' + c.id.replace(/-/g, '') + '_' + 'e'.repeat(16) }]); });
    await worker.processOffice(A);
    assert.equal(f.calls.length, 0); assert.notEqual((await f.connection()).settings.connectionGeneration, frozen.connection_generation);
    assert.equal((await f.connection()).dispatch_claim, null);
});

test('independent real PostgreSQL workers do not duplicate linked group mutations', async t => {
    const f = await fixture(t), first = await f.createCase(), second = await f.createCase();
    const blocker = await f.pool.connect(); await blocker.query('BEGIN'); await blocker.query('SELECT id FROM office_integrations WHERE law_firm_tenant_id=$1 FOR UPDATE', [A]);
    const running = [f.worker.processOffice(A, { caseId: first }), f.otherWorker.processOffice(A, { caseId: second })];
    let waits = [];
    try { for (let i = 0; i < 100; i++) { waits = (await f.pool.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name=ANY($1::text[]) AND wait_event_type='Lock'", [[f.name + '_one', f.name + '_two']])).rows; if (waits.length >= 2) break; await delay(10); } }
    finally { await blocker.query('COMMIT'); blocker.release(); await Promise.all(running); }
    assert.equal(new Set(waits.map(row => row.pid)).size, 2); assert.equal(f.calls.filter(c => c.kind === 'group').length, 1);
    assert.deepEqual((await Promise.all([f.job(first), f.job(second)])).map(job => job.status).sort(), ['created', 'queued']);
    assert.equal((await f.connection()).safety_state.groups.length, 1);
});

test('partial remote creation remains observable and is never retried or revived by permission review', async t => {
    const f = await fixture(t), caseId = await f.createCase();
    f.hooks.group = async () => { throw Object.assign(Error('Synthetic invite code timeout'), { uncertain: true, partialGroupId: '120363000000099999@g.us' }); };
    await f.worker.processOffice(A); await f.otherWorker.processOffice(A);
    const job = await f.job(caseId);
    assert.equal(job.status, 'uncertain'); assert.equal(job.group_id, '120363000000099999@g.us'); assert.equal(f.calls.filter(c => c.kind === 'group').length, 1);
    assert.equal((await f.service.reviewWhatsappGroups(A)).rechecked, 0);
    assert.equal((await f.job(caseId)).status, 'uncertain'); assert.equal((await f.connection()).safety_state.paused, true);
});

test('permission review cannot revive failed, unknown, already-dispatched or previous-generation jobs', async t => {
    const f = await fixture(t), ids = [];
    for (const status of ['failed', 'uncertain', 'needs_attention', 'needs_attention']) {
        const caseId = await f.createCase(); ids.push(caseId);
        await f.pool.query("UPDATE case_whatsapp_groups SET status=$2,error_code='RECIPIENT_PERMISSION_REQUIRED' WHERE case_id=$1", [caseId, status]);
    }
    await f.pool.query("UPDATE case_whatsapp_groups SET request_id='unknown-request' WHERE case_id=$1", [ids[2]]);
    await f.pool.query('UPDATE case_whatsapp_groups SET connection_generation=$2 WHERE case_id=$1', [ids[3], crypto.randomUUID()]);
    assert.equal((await f.service.reviewWhatsappGroups(A)).rechecked, 0);
    assert.deepEqual((await Promise.all(ids.map(f.job))).map(job => job.status), ['failed', 'uncertain', 'needs_attention', 'needs_attention']);
});

test('recipient attestation binds current configuration and current same-office operator', async t => {
    const f = await fixture(t), c = await f.connection();
    await assert.rejects(f.service.saveWhatsapp(A, { ...c.settings, enabled: true }, 1), { errorCode: 'RECIPIENT_PERMISSION_REQUIRED' });
    await assert.rejects(f.service.saveWhatsapp(A, { ...c.settings, enabled: true, recipientPermissionConfirmed: true }), { errorCode: 'INVALID_ID' });
    await assert.rejects(f.service.saveWhatsapp(A, { ...c.settings, enabled: true, recipientPermissionConfirmed: true }, 4), { errorCode: 'CONTACT_PERMISSION_FORBIDDEN' });
    await f.pool.query('UPDATE office_integrations SET settings=$2 WHERE id=$1', [c.id, { ...c.settings, recipients: ['+972508888888'] }]);
    const caseId = await f.createCase(); assert.equal((await f.job(caseId)).status, 'needs_attention');
    await f.worker.processOffice(A); assert.equal(f.calls.length, 0);
    await assert.rejects(f.service.setWhatsappContactPermission(A, { phone: '0504444444', allowed: true, evidence: 'Synthetic foreign office contact' }, 1), { errorCode: 'CONTACT_NOT_IN_OFFICE' });
});

test('signed opt-out dedupe and permission changes commit together; old session callback has no authority', async t => {
    const f = await fixture(t), c = await f.connection();
    const body = { session: c.settings.sessionName, timestamp: Date.now(), id: 'evt_real_pg_synthetic', event: 'message', payload: { from: '972501111111@c.us', fromMe: false, body: 'STOP' } };
    const meta = { payloadHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') };
    await f.service.receiveLinkedDeviceEvent(A, c.id, body, meta); await f.otherService.receiveLinkedDeviceEvent(A, c.id, body, meta);
    const permission = await f.service.contactPermission(f.pool, A, '+972501111111');
    assert.equal(permission.allowed, false); assert.equal(Number(permission.version), 1);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM whatsapp_linked_webhook_events')).rows[0].n, 1);
    await f.pool.query('UPDATE office_integrations SET settings=$2 WHERE id=$1', [c.id, { ...c.settings, connectionGeneration: crypto.randomUUID(), sessionName: 'off_' + c.id.replace(/-/g, '') + '_' + 'f'.repeat(16) }]);
    await f.service.receiveLinkedDeviceEvent(A, c.id, { ...body, id: 'evt_stale_session' }, meta);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM whatsapp_linked_webhook_events')).rows[0].n, 1);
    assert.equal((await f.service.contactPermission(f.pool, B, '+972501111111')).version, null);
});

test('signed opt-out side-effect failure rolls dedupe back so provider retry can commit once', async t => {
    const f = await fixture(t), c = await f.connection();
    const body = { session: c.settings.sessionName, timestamp: Date.now(), id: 'evt_optout_atomic_retry', event: 'message', payload: { from: '972501111111@c.us', fromMe: false, body: 'STOP' } };
    const meta = { payloadHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') };
    await f.pool.query(`CREATE FUNCTION synthetic_optout_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic optout persistence failure'; END $$;
        CREATE TRIGGER synthetic_optout_failure BEFORE INSERT ON whatsapp_contact_permissions FOR EACH ROW EXECUTE FUNCTION synthetic_optout_failure()`);
    await assert.rejects(f.service.receiveLinkedDeviceEvent(A, c.id, body, meta), /synthetic optout persistence failure/);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM whatsapp_linked_webhook_events')).rows[0].n, 0);
    await f.pool.query('DROP TRIGGER synthetic_optout_failure ON whatsapp_contact_permissions');
    await f.otherService.receiveLinkedDeviceEvent(A, c.id, body, meta);
    assert.equal((await f.service.contactPermission(f.pool, A, '+972501111111')).allowed, false);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM whatsapp_linked_webhook_events')).rows[0].n, 1);
});

test('permission revocation serializes behind an already-dispatching mutation and blocks every later invitation', async t => {
    const f = await fixture(t), caseId = await f.createCase();
    let began, release;
    const started = new Promise(resolve => { began = resolve; }), hold = new Promise(resolve => { release = resolve; });
    f.hooks.group = async (c, job) => { began(); await hold; return { groupId: '120363000000000077@g.us', inviteLink: 'https://chat.whatsapp.com/SyntheticHold' }; };
    const dispatch = f.worker.processOffice(A);
    await started;
    const stop = f.otherService.setWhatsappContactPermission(A, { phone: '0501111111', allowed: false, evidence: 'Synthetic concurrent permission revocation' }, 1);
    let waiting = [];
    try {
        for (let i = 0; i < 100; i++) {
            waiting = (await f.pool.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock'", [f.name + '_two'])).rows;
            if (waiting.length) break; await delay(10);
        }
    } finally { release(); await Promise.all([dispatch, stop]); }
    assert.ok(waiting.length > 0, 'Independent setter waits on the same connection lock held through provider dispatch');
    await f.elapse(); await f.otherWorker.processOffice(A);
    assert.equal(f.calls.filter(c => c.kind === 'group').length, 1); assert.equal(f.calls.filter(c => c.kind === 'invite').length, 0);
    assert.equal((await f.job(caseId)).recipients[0].status, 'cancelled');
});

test('pairing start is explicit and idempotent; readiness never enables sending or resumes safety', async t => {
    const f = await fixture(t);
    await f.service.disconnectLinkedDevice(A);
    await assert.rejects(f.service.startLinkedDevice(A, {}), { errorCode: 'WAHA_ACKNOWLEDGEMENT_REQUIRED' });
    const ack = { acknowledgeUnofficial: true, acknowledgePermissions: true };
    const started = await f.service.startLinkedDevice(A, ack);
    assert.equal(started.sessionStatus, 'starting'); assert.equal((await f.connection()).enabled, false);
    await f.service.startLinkedDevice(A, ack);
    assert.equal(f.calls.filter(c => c.kind === 'start').length, 1);
    const ready = await f.service.checkLinkedDevice(A);
    assert.equal(ready.sessionStatus, 'connected'); assert.equal((await f.connection()).enabled, false);
    assert.equal((await f.connection()).safety_state.paused, true, 'Disconnect circuit survives re-pair and health check');
    assert.equal(ready.qrDataUrl, undefined);
    assert.equal((await f.service.settingsSnapshot(A)).whatsapp.settings.sessionName, undefined);
    await assert.rejects(f.service.startLinkedDevice(B, ack), { errorCode: 'WAHA_OFFICE_NOT_ALLOWED' });
});

test('WORKING but restricted health disables delivery and requires fresh explicit recovery', async t => {
    const f = await fixture(t), caseId = await f.createCase();
    f.hooks.health = name => ({ sessionName: name, status: 'WORKING', connected: true, phoneId: '972509999999', displayPhone: '+972509999999', ready: false, restricted: true, incompatibleVersion: false });
    await f.worker.processOffice(A);
    const restricted = await f.connection();
    assert.equal(restricted.enabled, false); assert.equal(restricted.safety_state.paused, true); assert.equal(restricted.settings.linkedError, 'PROVIDER_RESTRICTED');
    assert.equal(f.calls.length, 0); assert.equal((await f.job(caseId)).status, 'queued');
    delete f.hooks.health;
    await f.service.checkLinkedDevice(A);
    assert.equal((await f.connection()).safety_state.paused, true); assert.equal((await f.connection()).enabled, false);
    assert.equal(f.calls.filter(c => c.kind === 'start').length, 0, 'A provider restriction never causes restart or re-pair');
});

test('wire-level adapter and real PostgreSQL worker complete an empty group and a paced invitation with the pinned full invite URL', async t => {
    const f = await fixture(t), c = await f.connection(), requests = [];
    const session = c.settings.sessionName, groupId = '120363999000111@g.us', code = 'SyntheticWireInviteCode123';
    const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    const linked = require('../services/integrations/wahaProvider').createWahaProvider({ env, fetchImpl: async (url, options) => {
        const path = new URL(url).pathname;
        const body = options.body ? JSON.parse(options.body) : null;
        requests.push({ path, method: options.method, body });
        if (path === '/api/sessions/' + session) return json({ name: session, status: 'WORKING', me: { id: '972509999999@c.us' } });
        if (path === '/api/sessions') return json([{ name: session, status: 'WORKING', me: { id: '972509999999@c.us' } }]);
        if (path === '/api/sessions/' + session + '/me') return json({ id: '972509999999@c.us' });
        if (path.endsWith('/timelock')) return json({ isActive: false, timeEnforcementEnds: null });
        if (path.endsWith('/capping')) return json({ cappingStatus: 'NONE', cycleEnd: null });
        if (path === '/api/' + session + '/groups') {
            const claim = (await f.otherPool.query('SELECT dispatch_claim FROM office_integrations WHERE id=$1', [c.id])).rows[0].dispatch_claim;
            assert.equal(claim.kind, 'group');
            assert.deepEqual(body.participants, []);
            return json({ id: groupId });
        }
        if (path.endsWith('/invite-code')) return new Response('https://chat.whatsapp.com/' + code, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        if (path === '/api/sendText') return json({ id: 'synthetic-wire-accepted-id' });
        throw Error('Unexpected synthetic wire endpoint');
    } });
    const meta = { createGroup: () => { throw Error('Meta must not receive linked work'); }, invite: () => { throw Error('Meta must not receive linked work'); } };
    const routed = require('../services/integrations/providerRouter').createProviderRouter(meta, linked);
    const service = createIntegrationService({ pool: f.pool, provider: routed, linkedProvider: linked, env });
    const worker = createGroupWorker(service), caseId = await f.createCase();
    await worker.processOffice(A, { caseId });
    assert.equal((await f.job(caseId)).status, 'created');
    assert.equal((await f.job(caseId)).invite_link, 'https://chat.whatsapp.com/' + code);
    await f.elapse(); await worker.processOffice(A, { caseId });
    const final = await f.job(caseId);
    assert.equal(final.status, 'invitations_sent'); assert.equal(final.recipients[0].providerMessageId, 'synthetic-wire-accepted-id');
    const writes = requests.filter(r => r.method === 'POST');
    assert.equal(writes.length, 2); assert.equal(writes[0].path, '/api/' + session + '/groups');
    assert.equal(writes[1].path, '/api/sendText'); assert.equal(writes[1].body.session, session);
    assert.equal(writes[1].body.chatId, '972501111111@c.us');
    assert.ok(writes[1].body.text.includes('https://chat.whatsapp.com/' + code));
    assert.equal((await f.pool.query('SELECT whatsappgrouplink FROM cases WHERE caseid=$1', [caseId])).rows[0].whatsappgrouplink, final.invite_link);
});

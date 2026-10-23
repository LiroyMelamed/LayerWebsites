'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createIntegrationService } = require('../services/integrations/service');
const { createGroupWorker } = require('../services/integrations/worker');
const { createMetaProvider } = require('../services/integrations/metaProvider');
const { phones, courtNumber } = require('../services/integrations/validation');
const secrets = require('../services/integrations/secrets');
const { saveCaseCourtNumber } = require('../services/integrations/courtCaseReference');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const env = { INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_META_APP_ID: '123456', WHATSAPP_META_APP_SECRET: 'app-secret', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '987654', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify', WHATSAPP_WEBHOOK_CALLBACK_URL: 'https://synthetic-api.example.invalid/api/webhooks/whatsapp', WHATSAPP_LIVE_ENABLED: 'true' };
async function fixture(t) {
    const db = new PGlite();
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);
        CREATE TABLE users(userid serial PRIMARY KEY,law_firm_tenant_id uuid,phonenumber text);
        CREATE TABLE cases(caseid serial PRIMARY KEY,law_firm_tenant_id uuid REFERENCES law_firm_tenants(id),casename text,casemanagerid integer,currentstage integer,isclosed boolean,whatsappgrouplink text,createdat timestamptz,updatedat timestamptz);
        INSERT INTO law_firm_tenants(id,name) VALUES('${A}','Office A'),('${B}','Office B');`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-14_00_office_integrations.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-15_00_case_court_reference.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-15_01_court_daily_sync.sql'), 'utf8'));
    // PGlite has one connection. Serialize leases like a pg pool with max=1.
    let tail = Promise.resolve();
    const lease = async () => { const prior = tail; let release; tail = new Promise(r => { release = r; }); await prior; return release; };
    const query = async (sql, args) => { const r = await db.query(sql, args); return { ...r, rowCount: r.rows.length || r.affectedRows || 0 }; };
    const pool = {
        query: async (...args) => { const release = await lease(); try { return await query(...args); } finally { release(); } },
        connect: async () => { const release = await lease(); return { query, release }; },
    };
    const calls = [];
    const provider = {
        completeSignup: async input => ({ token: 'private-access-token', pin: '123456', phoneId: input.phoneId, wabaId: input.wabaId, displayPhone: '+972500000000', eligible: true, expiresAt: null }),
        readiness: async () => ({ eligible: true, templateReady: true }),
        createGroup: async (_c, _token, job) => { calls.push(['group', job.id]); return { request_id: 'request-1' }; },
        invite: async (_c, _token, job, phone) => { calls.push(['invite', job.id, phone]); return { messages: [{ id: 'message-1' }] }; },
    };
    const service = createIntegrationService({ pool, provider, env });
    const worker = createGroupWorker(service);
    t.after(() => db.close());
    return { db, pool, service, worker, provider, calls };
}
const policy = { enabled: true, mode: 'demo', recipients: ['0501234567'], templateName: '', templateLanguage: 'he' };

test('QR authorization is saved per office before sync; a failed handshake is visible and cannot enable delivery', async t => {
    const { pool, provider } = await fixture(t);
    const config = { ...env, WHATSAPP_CONNECT_ONLY: 'true', WHATSAPP_SIGNUP_FLOW: 'business_app' };
    const service = createIntegrationService({ pool, provider, env: config });
    const original = provider.completeSignup;
    provider.completeSignup = async input => ({ ...await original(input), connectionType: 'business_app' });
    let syncCalls = 0;
    provider.syncBusinessApp = async (c, token) => { syncCalls++; assert.ok(c.secret_ciphertext); assert.equal(c.law_firm_tenant_id, A); assert.equal(token, 'private-access-token'); throw Error('synthetic uncertain failure'); };
    provider.connectionHealth = async () => ({ connected: true });
    const session = await service.startSignup(A, 1);
    assert.equal(session.flow, 'business_app'); assert.equal(session.liveEnabled, false);
    await service.completeSignup(A, 1, { state: session.state, phoneId: '123456789', wabaId: '987654321' });
    const snapshot = await service.settingsSnapshot(A);
    assert.equal(snapshot.whatsapp.connected, true); assert.equal(snapshot.whatsapp.enabled, false);
    assert.equal(snapshot.whatsapp.settings.appSync, 'needs_attention');
    assert.equal((await service.settingsSnapshot(B)).whatsapp, null);
    await service.saveWhatsapp(A, { ...policy, enabled: false });
    assert.equal((await service.settingsSnapshot(A)).whatsapp.settings.connectionType, 'business_app');
    assert.deepEqual(await service.checkWhatsapp(A), { status: 'connected' });
    assert.equal(syncCalls, 1, 'Readiness checks must not retry uncertain sync requests');
    await assert.rejects(service.saveWhatsapp(A, { ...policy, enabled: true, mode: 'live', templateName: 'invite' }), { errorCode: 'WHATSAPP_NOT_READY' });
    const worker = createGroupWorker(service);
    const c = await service.connection(pool, A, 'whatsapp');
    await pool.query(`UPDATE office_integrations SET enabled=true,status='ready',settings=settings || '{"mode":"live"}'::jsonb WHERE id=$1`, [c.id]);
    const caseId = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Synthetic connection-only case') RETURNING caseid`, [A])).rows[0].caseid;
    assert.equal(await service.tx(db => service.enqueueCase(db, caseId, A)), null);
    await worker.processOffice(A);
});

test('daily court schedule runs once across concurrent ticks and restart, in the selected office only', async t => {
    const { service, pool, provider } = await fixture(t);
    const start = new Date('2026-10-15T04:00:00Z'), due = new Date('2026-10-15T05:00:00Z');
    await service.saveCourt(A, { enabled: true, label: 'Daily', dailySyncEnabled: true, syncTime: '08:00' }, start);
    await service.saveCourt(B, { enabled: true, label: 'Other', dailySyncEnabled: true, syncTime: '09:00' }, start);
    assert.equal(new Date((await service.settingsSnapshot(A)).court.nextSyncAt).toISOString(), due.toISOString());
    assert.equal((await service.syncCourt(A, { scheduledAt: new Date('2026-10-15T04:59:59Z') })).synced, false);
    const restarted = createIntegrationService({ pool, provider, env });
    const results = await Promise.all([service.syncCourt(A, { scheduledAt: due }), restarted.syncCourt(A, { scheduledAt: due })]);
    assert.equal(results.filter(r => r.synced).length, 1);
    assert.equal((await service.snapshot(A)).updates.length, 3);
    assert.equal((await service.snapshot(B)).updates.length, 0);
    assert.equal(new Date((await restarted.settingsSnapshot(A)).court.nextSyncAt).toISOString(), '2026-10-16T05:00:00.000Z');
    await restarted.saveCourt(A, { enabled: true, syncTime: '20:00' }, new Date('2026-10-15T06:00:00Z'));
    assert.equal(new Date((await service.settingsSnapshot(A)).court.nextSyncAt).toISOString(), '2026-10-16T17:00:00.000Z');
    assert.equal((await service.syncCourt(A, { scheduledAt: new Date('2026-10-15T18:00:00Z') })).synced, false);
    assert.equal((await service.syncCourt(A, { scheduledAt: new Date('2026-10-18T19:00:00Z') })).synced, true, 'Restart catches up once instead of replaying missed days');
    assert.equal((await service.snapshot(A)).updates.length, 3, 'Imports remain idempotent');
});

test('court schedule respects Israel DST, disabling, invalid input and settings-only response', async t => {
    const { service } = await fixture(t);
    await service.saveCourt(A, { enabled: true, syncTime: '08:00' }, new Date('2026-10-24T06:00:00Z'));
    assert.equal(new Date((await service.settingsSnapshot(A)).court.nextSyncAt).toISOString(), '2026-10-25T06:00:00.000Z');
    await service.saveCourt(B, { enabled: true, syncTime: '08:00' }, new Date('2026-03-26T07:00:00Z'));
    assert.equal(new Date((await service.settingsSnapshot(B)).court.nextSyncAt).toISOString(), '2026-03-27T05:00:00.000Z');
    for (const invalid of ['25:00', '08:60', '8:00', '', 'UTC', '08:00:00']) await assert.rejects(service.saveCourt(A, { enabled: true, syncTime: invalid }), { errorCode: 'INVALID_SYNC_SCHEDULE' });
    await assert.rejects(service.saveCourt(A, { enabled: true, dailySyncEnabled: 'yes' }), { errorCode: 'INVALID_SYNC_SCHEDULE' });
    await service.saveCourt(A, { enabled: true, dailySyncEnabled: false });
    assert.equal((await service.settingsSnapshot(A)).court.nextSyncAt, null);
    assert.equal((await service.syncCourt(A, { scheduledAt: new Date('2027-01-01T00:00:00Z') })).synced, false);
    await service.saveCourt(B, { enabled: false });
    assert.equal((await service.settingsSnapshot(B)).court.nextSyncAt, null);
    const settings = await service.settingsSnapshot(A);
    for (const key of ['links', 'updates', 'groups', 'demoCases']) assert.equal(key in settings, false);
    assert.equal(JSON.stringify(settings).includes('app-secret'), false);
});

test('daily schedule migration is rerunnable and never postpones a pending import', async t => {
    const { service, db } = await fixture(t);
    await service.saveCourt(A, { enabled: true, syncTime: '08:00' }, new Date('2026-10-15T04:00:00Z'));
    const before = (await service.settingsSnapshot(A)).court.nextSyncAt;
    await service.saveCourt(A, { enabled: true, label: 'Renamed' }, new Date('2026-10-15T07:00:00Z'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-15_01_court_daily_sync.sql'), 'utf8'));
    assert.equal(String((await service.settingsSnapshot(A)).court.nextSyncAt), String(before));
});
test('case court reference is optional, office-scoped, editable and never steals another case number', async t => {
    const { service, pool } = await fixture(t);
    const create = async office => (await pool.query("INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Synthetic') RETURNING caseid", [office])).rows[0].caseid;
    const first = await create(A), second = await create(A), otherOffice = await create(B);
    const save = (caseId, office, value) => service.tx(db => saveCaseCourtNumber(db, caseId, office, value, {}));
    await save(first, A, '090001–10–26'); await save(second, A, '90002-10-26'); await save(otherOffice, B, '90001-10-26');
    const primary = async id => (await pool.query('SELECT court_number FROM court_case_links WHERE case_id=$1 AND is_primary', [id])).rows[0]?.court_number;
    assert.equal(await primary(first), '90001-10-26');
    await save(first, A, undefined); assert.equal(await primary(first), '90001-10-26');
    await assert.rejects(save(first, A, '90002-10-26'), { errorCode: 'COURT_NUMBER_IN_USE' });
    assert.equal(await primary(first), '90001-10-26'); assert.equal(await primary(second), '90002-10-26');
    await assert.rejects(save(first, B, '90003-10-26'), { errorCode: 'CASE_NOT_FOUND' });
    await assert.rejects(save(first, A, '123-13-26'), { errorCode: 'INVALID_COURT_NUMBER' });
    await save(first, A, '90003-10-26'); assert.equal(await primary(first), '90003-10-26');
    assert.equal((await pool.query('SELECT 1 FROM court_case_links WHERE law_firm_tenant_id=$1 AND court_number=$2', [A,'90001-10-26'])).rows.length, 0);
    await save(first, A, ''); assert.equal(await primary(first), undefined);
    assert.equal((await pool.query('SELECT 1 FROM office_integrations')).rows.length, 0, 'Recording a court reference needs no connection');
});

test('QA case form mapping routes demo updates, edits detach old updates, live cases cannot import synthetic updates', async t => {
    const { service, pool, provider } = await fixture(t);
    const caseId = (await pool.query("INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Synthetic QA form case') RETURNING caseid",[A])).rows[0].caseid;
    await service.saveCourt(A,{enabled:true});
    await service.tx(db=>saveCaseCourtNumber(db,caseId,A,'90001-10-26',{}));
    await service.syncCourt(A);
    assert.ok((await service.snapshot(A)).updates.every(u=>!u.case_id),'Synthetic feed must not attach to live cases');
    const qaEnv = {...env,COURT_DEMO_CASE_LINKING:'true',WHATSAPP_CONNECT_ONLY:'true'};
    await service.tx(db=>saveCaseCourtNumber(db,caseId,A,'90002-10-26',qaEnv));
    assert.equal((await service.snapshot(A)).updates.find(u=>u.court_number==='90002-10-26').case_id,caseId);
    await service.tx(db=>saveCaseCourtNumber(db,caseId,A,null,qaEnv));
    assert.ok((await service.snapshot(A)).updates.every(u=>!u.case_id));
    await pool.query('DELETE FROM court_updates');
    await service.tx(db=>saveCaseCourtNumber(db,caseId,A,'90003-10-26',qaEnv));
    const qaService=createIntegrationService({pool,provider,env:qaEnv});
    await qaService.syncCourt(A); await qaService.syncCourt(A);
    const updates=(await service.snapshot(A)).updates;
    assert.equal(updates.length,3);assert.equal(updates.find(u=>u.court_number==='90003-10-26').case_id,caseId);
});

test('court reference migration keeps existing aliases and picks only one stable primary', async t => {
    const { db, pool } = await fixture(t);
    const id=(await pool.query("INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Existing alias case') RETURNING caseid",[A])).rows[0].caseid;
    await pool.query("INSERT INTO court_case_links(law_firm_tenant_id,case_id,court_number,created_at) VALUES($1,$2,'77701-10-26','2026-10-01'),($1,$2,'77702-10-26','2026-10-02')",[A,id]);
    const migration=fs.readFileSync(path.join(__dirname,'../migrations/2026-10-15_00_case_court_reference.sql'),'utf8');
    await db.exec(migration);await db.exec(migration);
    const rows=(await pool.query('SELECT court_number,is_primary FROM court_case_links WHERE case_id=$1 ORDER BY court_number',[id])).rows;
    assert.deepEqual(rows,[{court_number:'77701-10-26',is_primary:true},{court_number:'77702-10-26',is_primary:false}]);
});
async function connect(service, officeId = A, phoneId = '123456789', wabaId = '987654321') {
    const start = await service.startSignup(officeId, 1);
    await service.completeSignup(officeId, 1, { state: start.state, code: 'test-code-value', phoneId, wabaId });
}

test('normalization refuses ambiguity, invalid numbers, excess recipients', () => {
    assert.equal(courtNumber('\u200f090001–10–26'), '90001-10-26');
    assert.throws(() => courtNumber('14/10/2026'));
    assert.throws(() => courtNumber('90001-13-26'));
    assert.deepEqual(phones(['0501234567', '+972 50-1234567']), ['+972501234567']);
    assert.throws(() => phones(['abc0501234567']));
    assert.throws(() => phones(Array(8).fill('+972501234567')));
});
test('secrets are bound to office and connection, never readable with a different binding', () => {
    const sealed = secrets.seal('secret', 'office-a:connection-a', env);
    assert.equal(secrets.open(sealed, 'office-a:connection-a', env), 'secret');
    assert.throws(() => secrets.open(sealed, 'office-b:connection-a', env));
    assert.throws(() => secrets.seal('secret', 'a', {}));
});
test('court settings persist, demo events deduplicate, mapping is office-scoped and demo-only', async t => {
    const { service, pool } = await fixture(t);
    await service.saveCourt(A, { enabled: true, label: 'A demo' });
    await service.saveCourt(B, { enabled: true, label: 'B demo' });
    const casesA = await service.seedDemo(A), casesB = await service.seedDemo(B);
    assert.deepEqual(await service.seedDemo(A), casesA);
    await Promise.all([service.syncCourt(A), service.syncCourt(A)]);
    const state = await service.snapshot(A);
    assert.equal(state.updates.length, 3);
    assert.equal(state.updates.filter(e => e.case_id).length, 2);
    assert.equal((await service.snapshot(B)).updates.length, 0);
    await assert.rejects(service.linkCourt(A, { caseId: casesB[0], courtNumber: '90003-10-26' }), { errorCode: 'DEMO_CASE_REQUIRED' });
    await service.linkCourt(A, { caseId: casesA[0], courtNumber: '90003-10-26' });
    assert.equal((await service.snapshot(A)).updates.filter(e => e.case_id).length, 3);
    const real = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Real placeholder') RETURNING caseid`, [A])).rows[0].caseid;
    await assert.rejects(service.linkCourt(A, { caseId: real, courtNumber: '12345-10-26' }), { errorCode: 'DEMO_CASE_REQUIRED' });
    await service.saveCourt(A, { enabled: false, label: 'A demo' });
    await assert.rejects(service.syncCourt(A), { errorCode: 'COURT_DISABLED' });
    assert.equal((await service.snapshot(B)).court.enabled, true);
});
test('case outbox is transactional; disable cancels pending jobs; demo never calls Meta or creates fake links', async t => {
    const { service, pool, worker, calls } = await fixture(t);
    await service.saveCourt(A, { enabled: true }); const [caseId, other] = await service.seedDemo(A);
    await service.saveWhatsapp(A, policy);
    await assert.rejects(service.tx(async db => { await service.enqueueCase(db, caseId, A); throw new Error('rollback'); }));
    assert.equal((await service.snapshot(A)).groups.length, 0);
    await Promise.all([service.previewGroup(A, caseId), service.previewGroup(A, caseId)]);
    await worker.processOffice(A, { demoOnly: true });
    assert.equal((await service.snapshot(A)).groups.length, 1);
    assert.equal((await service.snapshot(A)).groups[0].status, 'simulated');
    assert.equal((await pool.query('SELECT whatsappgrouplink FROM cases WHERE caseid=$1', [caseId])).rows[0].whatsappgrouplink, null);
    assert.equal(calls.length, 0);
    await service.previewGroup(A, other);
    await service.saveWhatsapp(A, { ...policy, enabled: false });
    await worker.processOffice(A);
    assert.equal((await service.snapshot(A)).groups.find(g => g.case_id === other).status, 'cancelled');
    await assert.rejects(service.saveWhatsapp(A, { ...policy, mode: 'live' }), { errorCode: 'WHATSAPP_NOT_READY' });
});
test('signup nonce is office/user bound, single-use; snapshots do not expose tokens; number cannot be shared', async t => {
    const { service, pool } = await fixture(t);
    const start = await service.startSignup(A, 1);
    const input = { state: start.state, code: 'test-code-value', phoneId: '123456789', wabaId: '987654321' };
    await assert.rejects(service.completeSignup(B, 1, input), { errorCode: 'INVALID_SIGNUP_STATE' });
    await assert.rejects(service.completeSignup(A, 2, input), { errorCode: 'INVALID_SIGNUP_STATE' });
    await service.completeSignup(A, 1, input);
    await assert.rejects(service.completeSignup(A, 1, input), { errorCode: 'INVALID_SIGNUP_STATE' });
    assert.ok(!JSON.stringify(await service.snapshot(A)).includes('private-access-token'));
    assert.ok(!(await pool.query('SELECT secret_ciphertext FROM office_integrations WHERE provider=$1', ['whatsapp'])).rows[0].secret_ciphertext.includes('private-access-token'));
    await assert.rejects(connect(service, B), { errorCode: 'PHONE_ALREADY_CONNECTED' });
    await service.disconnectWhatsapp(A);
    assert.equal((await service.snapshot(A)).whatsapp.connected, false);
    assert.equal((await service.snapshot(A)).whatsapp.enabled, false);
});
test('same-named offices retain independent grants, defaults and disconnect state', async t => {
    const { service, pool, calls } = await fixture(t);
    await pool.query("UPDATE law_firm_tenants SET name='MelamedLaw'");
    await connect(service, A, '111111111', '111111112');
    await connect(service, B, '222222221', '222222222');
    await service.saveWhatsapp(A, { ...policy, recipients: ['0500000001'] });
    await service.saveWhatsapp(B, { ...policy, recipients: ['0500000002'] });
    const beforeA = await service.settingsSnapshot(A), beforeB = await service.settingsSnapshot(B);
    assert.notEqual(beforeA.whatsapp.id, beforeB.whatsapp.id);
    assert.deepEqual(beforeA.whatsapp.settings.recipients, ['+972500000001']);
    assert.deepEqual(beforeB.whatsapp.settings.recipients, ['+972500000002']);
    const records = (await pool.query("SELECT * FROM office_integrations WHERE provider='whatsapp' ORDER BY law_firm_tenant_id")).rows;
    assert.notEqual(records[0].secret_ciphertext, records[1].secret_ciphertext);
    assert.throws(() => secrets.open(records[0].secret_ciphertext, `${B}:${records[1].id}:whatsapp`, env));
    const pending = await service.startSignup(B, 1);
    await assert.rejects(service.completeSignup(A, 1, { state: pending.state }), { errorCode: 'INVALID_SIGNUP_STATE' });
    await service.disconnectWhatsapp(A);
    assert.equal((await service.settingsSnapshot(A)).whatsapp.connected, false);
    assert.deepEqual((await service.settingsSnapshot(B)).whatsapp, beforeB.whatsapp);
    assert.equal(calls.length, 0, 'No messaging provider calls');
});

test('live group lifecycle is routed by office/phone/request, retries do not duplicate groups or invitations', async t => {
    const { service, pool, worker, calls } = await fixture(t);
    await connect(service);
    const config = { ...policy, enabled: false, mode: 'live', templateName: 'group_invite' };
    await service.saveWhatsapp(A, config); await service.checkWhatsapp(A); await service.saveWhatsapp(A, { ...config, enabled: true });
    const row = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Placeholder') RETURNING caseid`, [A])).rows[0];
    await service.tx(db => service.enqueueCase(db, row.caseid, A));
    await worker.processOffice(A); await worker.processOffice(A);
    assert.equal(calls.filter(c => c[0] === 'group').length, 1);
    const job = (await service.snapshot(A)).groups[0], conn = (await service.snapshot(A)).whatsapp;
    const event = { type: 'group_create', subject: job.subject, group_id: 'group-123', request_id: 'request-1', invite_link: 'https://chat.whatsapp.com/exampleInvite123' };
    await worker.receiveLifecycle(B, conn.id, '987654321', '123456789', [event]);
    assert.equal((await service.snapshot(A)).groups[0].status, 'awaiting_webhook');
    await worker.receiveLifecycle(A, conn.id, '987654321', '123456789', [{ ...event, request_id: 'wrong' }]);
    assert.equal((await service.snapshot(A)).groups[0].status, 'awaiting_webhook');
    await worker.receiveLifecycle(A, conn.id, '987654321', '123456789', [event]);
    await worker.receiveLifecycle(A, conn.id, '987654321', '123456789', [event]);
    await worker.processOffice(A); await worker.processOffice(A);
    assert.equal(calls.filter(c => c[0] === 'invite').length, 1);
    assert.equal((await service.snapshot(A)).groups[0].status, 'invitations_sent');
    assert.equal((await pool.query('SELECT whatsappgrouplink FROM cases WHERE caseid=$1', [row.caseid])).rows[0].whatsappgrouplink, event.invite_link);
});
test('timeout becomes uncertain and is not retried; live mode never sends demo cases', async t => {
    const { service, worker, provider, calls, pool } = await fixture(t);
    await connect(service);
    const config = { ...policy, enabled: false, mode: 'live', templateName: 'group_invite' };
    await service.saveWhatsapp(A, config); await service.checkWhatsapp(A); await service.saveWhatsapp(A, { ...config, enabled: true });
    await service.saveCourt(A, { enabled: true }); const [demoId] = await service.seedDemo(A);
    assert.equal(await service.tx(db => service.enqueueCase(db, demoId, A)), null);
    const real = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Placeholder') RETURNING caseid`, [A])).rows[0].caseid;
    await service.tx(db => service.enqueueCase(db, real, A));
    provider.createGroup = async () => { calls.push('attempt'); throw Object.assign(new Error('timeout'), { uncertain: true }); };
    await worker.processOffice(A); await worker.processOffice(A);
    assert.equal(calls.length, 1);
    assert.equal((await service.snapshot(A)).groups[0].status, 'uncertain');
});
test('official Meta request contract uses groups + group_id template invitations, rejects ungranted assets', async () => {
    const requests = [];
    const provider = createMetaProvider({ env, fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        return { ok: true, status: 200, json: async () => ({ request_id: 'r', messages: [{ id: 'm' }] }) };
    } });
    const c = { phone_number_id: '123456789', settings: { templateParameters: ['Office'] } };
    await provider.createGroup(c, 'token', { subject: 'Case' });
    await provider.invite(c, 'token', { group_id: 'group', template_name: 'invite', template_language: 'he' }, '+972501234567');
    assert.match(requests[0].url, /\/v26.0\/123456789\/groups$/);
    assert.equal(JSON.parse(requests[0].options.body).join_approval_mode, 'auto_approve');
    const invitation = JSON.parse(requests[1].options.body);
    assert.equal(invitation.template.components[0].parameters[0].group_id, 'group');
    assert.equal(invitation.to, '972501234567');
    assert.ok(!requests[1].url.includes('token'));
    const badProvider = createMetaProvider({ env, fetchImpl: async url => ({ ok: true, status: 200, json: async () => String(url).includes('oauth/access_token') ? { access_token: 'secret' } : { data: { is_valid: true, app_id: env.WHATSAPP_META_APP_ID, scopes: [] } } }) });
    await assert.rejects(badProvider.completeSignup({ code: 'valid-long-code', wabaId: '123456789', phoneId: '987654321' }), { errorCode: 'META_ASSET_NOT_GRANTED' });
});

test('disconnect invalidates an in-flight signup completion', async t => {
    const { service, provider } = await fixture(t);
    const state = await service.startSignup(A, 1);
    let release, started;
    const began = new Promise(resolve => { started = resolve; });
    provider.completeSignup = () => new Promise(resolve => { release = resolve; started(); });
    const result = service.completeSignup(A, 1, { state: state.state });
    await began;
    await service.disconnectWhatsapp(A);
    release({ token: 'late-token', phoneId: '123456789', wabaId: '987654321', eligible: true });
    await assert.rejects(result, { errorCode: 'INVALID_SIGNUP_STATE' });
    assert.equal((await service.snapshot(A)).whatsapp.connected, false);
});

test('disable then re-enable does not revive invitations from an earlier group request', async t => {
    const { service, pool, worker, calls } = await fixture(t);
    await connect(service);
    const config = { ...policy, enabled: false, mode: 'live', templateName: 'group_invite' };
    await service.saveWhatsapp(A, config); await service.checkWhatsapp(A); await service.saveWhatsapp(A, { ...config, enabled: true });
    const { caseid } = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Placeholder') RETURNING caseid`, [A])).rows[0];
    await service.tx(db => service.enqueueCase(db, caseid, A)); await worker.processOffice(A);
    const state = await service.snapshot(A), job = state.groups[0];
    await service.saveWhatsapp(A, config); await service.saveWhatsapp(A, { ...config, enabled: true });
    await worker.receiveLifecycle(A, state.whatsapp.id, '987654321', '123456789', [{ type: 'group_create', subject: job.subject, group_id: 'group-1', request_id: 'request-1', invite_link: 'https://chat.whatsapp.com/exampleInvite123' }]);
    await worker.processOffice(A);
    assert.equal(calls.filter(c => c[0] === 'invite').length, 0);
    assert.equal((await service.snapshot(A)).groups[0].status, 'cancelled');
    await pool.query(`UPDATE office_integrations SET token_expires_at=now()-interval '1 minute' WHERE provider='whatsapp'`);
    await assert.rejects(service.saveWhatsapp(A, { ...config, enabled: true }), { errorCode: 'WHATSAPP_NOT_READY' });
});

test('migration protects shared offices with actual RLS and cross-office reference guards', async t => {
    const { db, service } = await fixture(t);
    await service.saveCourt(A, { enabled: true }); await service.saveCourt(B, { enabled: true });
    const [caseA] = await service.seedDemo(A), [caseB] = await service.seedDemo(B);
    // Reuse the production installer's function definitions, then exercise this migration
    // as a non-owner, non-superuser rather than merely checking SQL text.
    const installer = fs.readFileSync(path.join(__dirname, '../scripts/install-office-isolation.js'), 'utf8');
    for (const name of ['office_scope_id', 'guard_office_owner']) {
        const pattern = new RegExp('await client\\.query\\(`(CREATE OR REPLACE FUNCTION public\\.' + name + '[\\s\\S]*?)`\\);');
        await db.exec(installer.match(pattern)[1]);
    }
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-14_00_office_integrations.sql'), 'utf8'));
    await db.exec(`CREATE ROLE integration_runtime NOSUPERUSER NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public TO integration_runtime;
        GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO integration_runtime;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO integration_runtime;
        SET ROLE integration_runtime;
        SELECT set_config('app.office_mode','office',false),set_config('app.office_id','${A}',false);`);
    assert.equal((await db.query('SELECT * FROM office_integrations')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM court_case_links')).rows.length, 2);
    await assert.rejects(db.query(`INSERT INTO court_case_links(law_firm_tenant_id,case_id,court_number) VALUES($1,$2,'123-10-26')`, [A, caseB]), /office reference/);
    await assert.rejects(db.query(`INSERT INTO court_updates(law_firm_tenant_id,source_id,court_number,case_id,title,body,occurred_at) VALUES($1,'bad','123-10-26',$2,'a','b',now())`, [B, caseB]), /row-level security/);
    await assert.rejects(db.query(`UPDATE office_integrations SET law_firm_tenant_id=$1`, [B]), /office owner is immutable/);
    await db.query(`INSERT INTO court_updates(source_id,court_number,case_id,title,body,occurred_at) VALUES('good','123-10-26',$1,'a','b',now())`, [caseA]);
    assert.equal((await db.query('SELECT law_firm_tenant_id FROM court_updates')).rows[0].law_firm_tenant_id, A);
    await db.exec(`SELECT set_config('app.office_mode','none',false),set_config('app.office_id','',false)`);
    assert.equal((await db.query('SELECT * FROM court_updates')).rows.length, 0);
    await db.exec('RESET ROLE');
});

test('default recipients merge with the assigned office manager once; missing/foreign managers never send', async t => {
    const { service, pool, worker, calls } = await fixture(t);
    const managerA = (await pool.query('INSERT INTO users(law_firm_tenant_id,phonenumber) VALUES($1,$2) RETURNING userid', [A, '0501234567'])).rows[0].userid;
    const managerB = (await pool.query('INSERT INTO users(law_firm_tenant_id,phonenumber) VALUES($1,$2) RETURNING userid', [B, '0521234567'])).rows[0].userid;
    const newCase = async managerId => (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casemanagerid,casename) VALUES($1,$2,'Synthetic case') RETURNING caseid`, [A, managerId])).rows[0].caseid;
    const config = { ...policy, includeCaseManager: true };
    await service.saveWhatsapp(A, config);
    const duplicate = await newCase(managerA);
    await service.tx(db => service.enqueueCase(db, duplicate, A));
    assert.deepEqual((await service.snapshot(A)).groups.find(g => g.case_id === duplicate).recipients.map(r => r.phone), ['+972501234567']);
    await service.saveWhatsapp(A, { ...config, recipients: ['0520000001'] });
    const distinct = await newCase(managerA);
    await service.tx(db => service.enqueueCase(db, distinct, A));
    assert.deepEqual((await service.snapshot(A)).groups.find(g => g.case_id === distinct).recipients.map(r => r.phone), ['+972520000001', '+972501234567']);
    await service.saveWhatsapp(A, { ...config, recipients: [] });
    const onlyManager = await newCase(managerA);
    await service.tx(db => service.enqueueCase(db, onlyManager, A));
    assert.equal((await service.snapshot(A)).groups.find(g => g.case_id === onlyManager).recipients.length, 1);
    for (const managerId of [null, managerB]) {
        const caseId = await newCase(managerId);
        await service.tx(db => service.enqueueCase(db, caseId, A));
        const job = (await service.snapshot(A)).groups.find(g => g.case_id === caseId);
        assert.equal(job.status, 'needs_attention'); assert.equal(job.error_code, 'MANAGER_PHONE_MISSING'); assert.deepEqual(job.recipients, []);
    }
    await service.saveWhatsapp(A, { ...policy, includeCaseManager: false });
    const off = await newCase(null); await service.tx(db => service.enqueueCase(db, off, A));
    assert.equal((await service.snapshot(A)).groups.find(g => g.case_id === off).status, 'queued');
    await assert.rejects(service.saveWhatsapp(A, { ...config, recipients: Array.from({ length: 7 }, (_, i) => `+97250000000${i}`) }), { errorCode: 'GROUP_CAPACITY' });
    await worker.processOffice(A, { demoOnly: true }); assert.equal(calls.length, 0);
    assert.equal((await service.snapshot(B)).groups.length, 0);
});

test('Meta onboarding verifies ownership, registers and subscribes; readiness uses documented OBA status endpoint', async () => {
    const requests = [], scopes = ['whatsapp_business_management', 'whatsapp_business_messaging'];
    let connected = false, subscribed = false;
    const provider = createMetaProvider({ env, fetchImpl: async (url, options) => {
        const endpoint = new URL(url).pathname.split('/').slice(2).join('/'); requests.push(endpoint);
        let data;
        if (endpoint === 'oauth/access_token') data = { access_token: 'private' };
        else if (endpoint === 'debug_token') data = { data: { is_valid: true, app_id: env.WHATSAPP_META_APP_ID, scopes, granular_scopes: scopes.map(scope => ({ scope, target_ids: ['987654321'] })), expires_at: 2000000000 } };
        else if (endpoint === '987654321/phone_numbers') data = { data: [{ id: '123456789' }] };
        else if (endpoint === '123456789' && new URL(url).searchParams.get('fields') === 'webhook_configuration') data = { id: '123456789', webhook_configuration: { application: 'https://synthetic-app.example.invalid/webhook', ...(subscribed ? { whatsapp_business_account: env.WHATSAPP_WEBHOOK_CALLBACK_URL } : {}) } };
        else if (endpoint === '123456789' && new URL(url).searchParams.get('fields') === 'official_business_account') data = { id: '123456789', official_business_account: { oba_status: 'APPROVED' } };
        else if (endpoint === '123456789') data = { id: '123456789', platform_type: 'CLOUD_API', status: connected ? 'CONNECTED' : 'PENDING', display_phone_number: '+972500000000' };
        else if (endpoint.endsWith('/register')) { assert.match(JSON.parse(options.body).pin, /^\d{6}$/); connected = true; data = { success: true }; }
        else if (endpoint.endsWith('/subscribed_apps') && options.method === 'GET') data = { data: subscribed ? [{ whatsapp_business_api_data: { id: env.WHATSAPP_META_APP_ID }, override_callback_uri: env.WHATSAPP_WEBHOOK_CALLBACK_URL }] : [] };
        else if (endpoint.endsWith('/subscribed_apps')) { assert.deepEqual(JSON.parse(options.body), { override_callback_uri: env.WHATSAPP_WEBHOOK_CALLBACK_URL, verify_token: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN }); subscribed = true; data = { success: true }; }
        else if (endpoint.endsWith('/message_templates')) data = { data: [{ name: 'invite', language: 'he', status: 'APPROVED' }] };
        else throw new Error('Unexpected endpoint');
        return { ok: true, status: 200, json: async () => data };
    } });
    const signup = await provider.completeSignup({ code: 'test-signup-code', phoneId: '123456789', wabaId: '987654321' });
    assert.equal(signup.connectionType, 'cloud'); assert.equal(signup.token, 'private');
    assert.ok(requests.includes('123456789/register')); assert.ok(requests.includes('987654321/subscribed_apps'));
    assert.deepEqual(await provider.readiness({ phone_number_id: '123456789', waba_id: '987654321', settings: { templateName: 'invite', templateLanguage: 'he' } }, signup.token), { eligible: true, templateReady: true });
});

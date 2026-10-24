'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const { PGlite } = require('@electric-sql/pglite');
const scope = require('../lib/tenant/databaseScope');
const { createIntegrationService } = require('../services/integrations/service');
const { createGroupWorker } = require('../services/integrations/worker');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const WABA = '987654321';
const env = { INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_META_APP_ID: '123456', WHATSAPP_META_APP_SECRET: 'synthetic-revocation-secret', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '987654', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'synthetic-verify', WHATSAPP_WEBHOOK_CALLBACK_URL: 'https://synthetic-api.example.invalid/api/webhooks/whatsapp', WHATSAPP_LIVE_ENABLED: 'true' };
const policy = { enabled: true, mode: 'live', recipients: ['0501234567', '0521234567', '0531234567', '0541234567'], templateName: 'synthetic_group_invite', templateLanguage: 'he' };

async function fixture(t) {
    const db = new PGlite();
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);
        CREATE TABLE users(userid serial PRIMARY KEY,law_firm_tenant_id uuid,phonenumber text);
        CREATE TABLE cases(caseid serial PRIMARY KEY,law_firm_tenant_id uuid REFERENCES law_firm_tenants(id),casename text,casemanagerid integer,currentstage integer,isclosed boolean,whatsappgrouplink text,createdat timestamptz,updatedat timestamptz);
        INSERT INTO law_firm_tenants(id,name) VALUES('${A}','Synthetic office A'),('${B}','Synthetic office B');`);
    for (const migration of ['2026-10-14_00_office_integrations.sql', '2026-10-15_00_case_court_reference.sql', '2026-10-15_01_court_daily_sync.sql', '2026-10-24_01_whatsapp_safety.sql']) await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8'));
    // One leased PGlite connection. Pauses model committed inter-phase changes;
    // these tests do not claim real multi-session PostgreSQL contention proof.
    let tail = Promise.resolve();
    const lease = async () => { const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior; return release; };
    const trace = [], calls = [], hooks = {};
    const query = async (sql, args) => {
        trace.push({ sql, args, scope: scope.current() });
        if (hooks.failSql?.(sql)) throw Error('Synthetic transaction failure');
        const result = await db.query(sql, args);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
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
    const provider = {
        completeSignup: async input => ({ token: 'synthetic-token', pin: '123456', phoneId: input.phoneId, wabaId: input.wabaId, displayPhone: '+972500000000', expiresAt: '2099-01-01T00:00:00Z' }),
        readiness: async () => ({ eligible: true, templateReady: true }),
        syncBusinessApp: async () => { calls.push(['sync']); },
        createGroup: async (_connection, _token, job) => { calls.push(['group', job.id]); return { request_id: `synthetic-request-${job.id}` }; },
        invite: async (_connection, _token, job, phone) => { calls.push(['invite', job.id, phone]); return { messages: [{ id: `synthetic-message-${phone}` }] }; },
    };
    const service = createIntegrationService({ pool, provider, env });
    const worker = createGroupWorker(service);
    const connect = async (tenant = A, wabaId = WABA, initial = false) => {
        const signup = await service.startSignup(tenant, 1);
        const phoneId = tenant === A ? '123456789' : tenant === B ? '123456780' : '123456781';
        await service.completeSignup(tenant, 1, { state: signup.state, code: 'synthetic-code', phoneId, wabaId });
        if (initial) await service.saveWhatsapp(tenant, { ...policy, enabled: false });
        await service.checkWhatsapp(tenant);
        // Reconnect deliberately never saves disabled settings: otherwise that
        // separate path would hide a missing webhook cancellation.
        await service.saveWhatsapp(tenant, policy);
        return service.connection(pool, tenant, 'whatsapp');
    };
    const createJob = async (tenant = A) => {
        const caseId = (await pool.query(`INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,'Synthetic revocation case') RETURNING caseid`, [tenant])).rows[0].caseid;
        await service.tx(client => service.enqueueCase(client, caseId, tenant));
        return caseId;
    };
    const job = async caseId => (await pool.query('SELECT * FROM case_whatsapp_groups WHERE case_id=$1', [caseId])).rows[0];
    const lifecycle = async (caseId, tenant = A) => {
        const item = await job(caseId), c = await service.connection(pool, tenant, 'whatsapp');
        await worker.receiveLifecycle(tenant, c.id, c.waba_id, c.phone_number_id, [{ type: 'group_create', subject: item.subject, request_id: `synthetic-request-${item.id}`, group_id: `synthetic-group-${item.id}`, invite_link: `https://chat.whatsapp.com/Synthetic${caseId}` }]);
    };
    const restored = [];
    const stub = (module, exports) => { const id = require.resolve(module); restored.push([id, require.cache[id]]); require.cache[id] = { id, filename: id, loaded: true, exports }; };
    stub('../config/db', pool);
    stub('../services/integrations/runtime', { service, worker, runOffice: async (tenant, fn) => {
        if (hooks.beforeOffice) await hooks.beforeOffice(tenant);
        return tenant ? scope.withOffice(tenant, fn) : scope.withLegacyOffice(fn);
    } });
    const routeId = require.resolve('../routes/whatsappWebhookRoutes');
    restored.push([routeId, require.cache[routeId]]); delete require.cache[routeId];
    const app = express(); app.use('/webhook', require('../routes/whatsappWebhookRoutes'));
    const oldSecret = process.env.WHATSAPP_META_APP_SECRET;
    process.env.WHATSAPP_META_APP_SECRET = env.WHATSAPP_META_APP_SECRET;
    const revoke = async (wabaId = WABA, status = 200, signed = true) => {
        const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: wabaId, changes: [{ field: 'account_update', value: { event: 'PARTNER_REMOVED' } }] }] });
        const signature = 'sha256=' + crypto.createHmac('sha256', env.WHATSAPP_META_APP_SECRET).update(payload).digest('hex');
        const req = request(app).post('/webhook').type('json');
        if (signed) req.set('x-hub-signature-256', signature);
        await req.send(payload).expect(status);
    };
    t.after(async () => {
        for (const [id, old] of restored.reverse()) { if (old) require.cache[id] = old; else delete require.cache[id]; }
        if (oldSecret === undefined) delete process.env.WHATSAPP_META_APP_SECRET; else process.env.WHATSAPP_META_APP_SECRET = oldSecret;
        await db.close();
    });
    await connect(A, WABA, true);
    return { pool, service, worker, provider, calls, hooks, trace, connect, createJob, job, lifecycle, revoke, elapseQuietPeriod };
}

test('signed revocation permanently cancels old queued work and late invitations after same-assets reconnect', async t => {
    const f = await fixture(t);
    const awaiting = await f.createJob(); await f.worker.processOffice(A, { caseId: awaiting });
    const queued = await f.createJob();
    const pending = await f.service.startSignup(A, 1);
    await f.revoke(WABA, 403, false);
    assert.equal((await f.service.connection(f.pool, A, 'whatsapp')).enabled, true);
    await f.revoke();
    const revoked = await f.service.connection(f.pool, A, 'whatsapp');
    assert.equal(revoked.enabled, false); assert.equal(revoked.status, 'reauthorization_required');
    assert.equal(revoked.secret_ciphertext, null);
    const revokedQueued = await f.job(queued), revokedAwaiting = await f.job(awaiting);
    await f.connect();
    await f.lifecycle(awaiting); await f.lifecycle(awaiting);
    await f.worker.processOffice(A); await f.worker.processOffice(A);
    assert.deepEqual(f.calls.map(c => c[0]), ['group'], 'Reconnecting the same WABA/phone must never resurrect old creation or invitations');
    assert.equal(revoked.token_expires_at, null);
    assert.equal(revokedQueued.status, 'cancelled'); assert.equal(revokedAwaiting.status, 'awaiting_webhook');
    for (const item of [revokedQueued, revokedAwaiting]) assert.deepEqual(item.recipients.map(r => r.status), ['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    assert.equal((await f.job(awaiting)).status, 'cancelled');
    assert.ok((await f.job(awaiting)).group_id, 'A late known remote outcome remains observable');
    assert.equal((await f.job(queued)).status, 'cancelled');
    await assert.rejects(f.service.completeSignup(A, 1, { state: pending.state, phoneId: '123456789', wabaId: WABA }), { errorCode: 'INVALID_SIGNUP_STATE' });
});

test('signed revocation fences an old in-flight signup before it can restore a grant or request app sync', async t => {
    const f = await fixture(t), signup = await f.service.startSignup(A, 1);
    let release, began;
    const started = new Promise(resolve => { began = resolve; });
    f.provider.completeSignup = () => new Promise(resolve => { release = resolve; began(); });
    const completion = f.service.completeSignup(A, 1, { state: signup.state });
    await started; await f.revoke();
    release({ token: 'synthetic-stale-token', phoneId: '123456789', wabaId: WABA, connectionType: 'business_app', expiresAt: null });
    await assert.rejects(completion, { errorCode: 'INVALID_SIGNUP_STATE' });
    const c = await f.service.connection(f.pool, A, 'whatsapp');
    assert.equal(c.secret_ciphertext, null); assert.equal(c.enabled, false); assert.equal(c.status, 'reauthorization_required');
    assert.deepEqual(f.calls, []);
});

test('revocation preserves sent and uncertain outcomes and recorded remote results without retrying', async t => {
    const f = await fixture(t), created = await f.createJob();
    await f.worker.processOffice(A); await f.lifecycle(created);
    await f.elapseQuietPeriod(); await f.worker.processOffice(A);
    const before = await f.job(created); before.recipients[1].status = 'sending';
    await f.pool.query('UPDATE case_whatsapp_groups SET recipients=$2 WHERE id=$1', [before.id, JSON.stringify(before.recipients)]);
    const unknown = await f.createJob();
    f.provider.createGroup = async (_c, _token, job) => { f.calls.push(['group-unknown', job.id]); throw Object.assign(Error('Synthetic timeout'), { uncertain: true }); };
    await f.elapseQuietPeriod(); await f.worker.processOffice(A, { caseId: unknown });
    await f.revoke();
    const sent = await f.job(created), unresolved = await f.job(unknown);
    assert.deepEqual(sent.recipients.map(r => r.status), ['sent', 'uncertain', 'cancelled', 'cancelled']);
    for (const key of ['group_id', 'invite_link', 'request_id']) assert.equal(sent[key], before[key]);
    assert.equal(unresolved.status, 'uncertain'); assert.equal(unresolved.error_code, 'RESULT_UNKNOWN');
    assert.equal(unresolved.group_id, null);
    assert.ok(unresolved.recipients.every(r => r.status === 'cancelled'));
    await f.connect(); await f.lifecycle(unknown); await f.worker.processOffice(A); await f.worker.processOffice(A);
    assert.equal((await f.job(unknown)).status, 'cancelled');
    assert.deepEqual(f.calls.map(c => c[0]), ['group', 'invite', 'group-unknown']);
});

test('revocation rechecks connection and WABA inside the office lock and duplicate cleanup preserves fresh signup', async t => {
    const f = await fixture(t), a = await f.service.connection(f.pool, A, 'whatsapp');
    const b = await f.connect(B, '987654320', true);
    const caseA = await f.createJob(), caseB = await f.createJob(B);
    await f.service.startSignup(A, 1); await f.service.startSignup(B, 1);
    assert.equal(await f.service.revokeWhatsapp(B, a.id, WABA), false);
    assert.equal(await f.service.revokeWhatsapp(A, a.id, '987654320'), false);
    assert.equal((await f.service.connection(f.pool, A, 'whatsapp')).secret_ciphertext, a.secret_ciphertext);
    assert.equal((await f.service.connection(f.pool, B, 'whatsapp')).secret_ciphertext, b.secret_ciphertext);
    await f.revoke();
    assert.equal((await f.job(caseA)).status, 'cancelled'); assert.equal((await f.job(caseB)).status, 'queued');
    assert.deepEqual((await f.pool.query('SELECT DISTINCT law_firm_tenant_id FROM integration_signup_sessions')).rows.map(r => r.law_firm_tenant_id), [B]);
    const fresh = await f.service.startSignup(A, 1);
    assert.equal(await f.service.revokeWhatsapp(A, a.id, WABA), false);
    await f.revoke();
    assert.equal((await f.pool.query('SELECT id FROM integration_signup_sessions WHERE law_firm_tenant_id=$1', [A])).rowCount, 1);
    await f.service.completeSignup(A, 1, { state: fresh.state, phoneId: '123456789', wabaId: WABA });
    const writes = f.trace.filter(q => q.sql.startsWith('UPDATE office_integrations SET enabled=false'));
    assert.equal(writes.length, 1); assert.deepEqual(writes[0].scope, { mode: 'office', tenantId: A });
    assert.ok(f.trace.some(q => q.sql.includes('FROM office_integrations') && q.sql.includes('FOR UPDATE')));
});

test('signed WABA revocation reaches all matching local offices including dedicated scope and leaves other WABAs alone', async t => {
    const f = await fixture(t);
    await f.connect(B, '987654320', true); await f.connect(null, WABA, true);
    const own = await f.createJob(), other = await f.createJob(B), dedicated = await f.createJob(null);
    await f.service.startSignup(A, 1); await f.service.startSignup(B, 1); await f.service.startSignup(null, 1);
    await f.revoke();
    for (const tenant of [A, null]) {
        const c = await f.service.connection(f.pool, tenant, 'whatsapp');
        assert.equal(c.secret_ciphertext, null); assert.equal(c.enabled, false);
    }
    assert.equal((await f.service.connection(f.pool, B, 'whatsapp')).enabled, true);
    assert.equal((await f.job(own)).status, 'cancelled'); assert.equal((await f.job(dedicated)).status, 'cancelled'); assert.equal((await f.job(other)).status, 'queued');
    assert.deepEqual((await f.pool.query('SELECT DISTINCT law_firm_tenant_id FROM integration_signup_sessions')).rows.map(r => r.law_firm_tenant_id), [B]);
    const writes = f.trace.filter(q => q.sql.startsWith('UPDATE office_integrations SET enabled=false'));
    assert.deepEqual(writes.map(q => q.scope), [{ mode: 'office', tenantId: A }, { mode: 'legacy', tenantId: '' }]);
});

test('stale system WABA lookup cannot revoke a connection reassigned before the office lock', async t => {
    const f = await fixture(t), caseId = await f.createJob();
    let reassigned = false;
    f.hooks.beforeOffice = async () => {
        if (reassigned) return;
        reassigned = true; await f.connect(A, '987654322'); await f.service.startSignup(A, 1);
    };
    await f.revoke();
    const c = await f.service.connection(f.pool, A, 'whatsapp');
    assert.equal(reassigned, true); assert.equal(c.waba_id, '987654322'); assert.equal(c.enabled, true); assert.ok(c.secret_ciphertext);
    assert.equal((await f.job(caseId)).status, 'queued');
    assert.ok((await f.pool.query('SELECT id FROM integration_signup_sessions WHERE law_firm_tenant_id=$1', [A])).rowCount > 0);
});

test('revocation cleanup failure rolls back grant and jobs and returns retryable webhook failure', async t => {
    const f = await fixture(t), caseId = await f.createJob(); await f.service.startSignup(A, 1);
    const original = await f.service.connection(f.pool, A, 'whatsapp');
    f.hooks.failSql = sql => sql.startsWith('DELETE FROM integration_signup_sessions');
    await f.revoke(WABA, 503);
    const unchanged = await f.service.connection(f.pool, A, 'whatsapp');
    assert.equal(unchanged.secret_ciphertext, original.secret_ciphertext); assert.equal(unchanged.enabled, true);
    assert.equal((await f.job(caseId)).status, 'queued');
    assert.ok((await f.pool.query('SELECT id FROM integration_signup_sessions WHERE law_firm_tenant_id=$1', [A])).rowCount > 0);
    delete f.hooks.failSql; await f.revoke();
    assert.equal((await f.service.connection(f.pool, A, 'whatsapp')).secret_ciphertext, null);
    assert.equal((await f.job(caseId)).status, 'cancelled'); assert.deepEqual(f.calls, []);
});

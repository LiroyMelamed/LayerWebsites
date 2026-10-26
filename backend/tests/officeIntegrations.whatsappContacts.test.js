'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createWhatsappContactPermissions, claimLinkedEvent, optOutPhone } = require('../services/integrations/whatsappContactPermissions');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const session = 'off_' + 'a'.repeat(32) + '_' + 'b'.repeat(16);
const sqlFile = name => fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
async function fixture(t) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY);
        CREATE TABLE users(userid serial PRIMARY KEY,law_firm_tenant_id uuid,phonenumber text);
        CREATE TABLE cases(caseid serial PRIMARY KEY,law_firm_tenant_id uuid,casename text,whatsappgrouplink text);
        INSERT INTO law_firm_tenants VALUES('${A}'),('${B}');
        INSERT INTO users(law_firm_tenant_id,phonenumber) VALUES('${A}','0501111111'),('${A}','050 222-2222'),('${B}','0503333333');`);
    await db.exec(sqlFile('2026-10-14_00_office_integrations.sql'));
    await db.exec(sqlFile('2026-10-24_01_whatsapp_safety.sql'));
    await db.exec(sqlFile('2026-10-24_02_whatsapp_linked_device.sql'));
    await db.exec(sqlFile('2026-10-24_02_whatsapp_linked_device.sql'));
    let tail = Promise.resolve();
    async function lease() { const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior; return release; }
    const query = async (...args) => { const result = await db.query(...args); return { ...result, rowCount: result.rows.length || result.affectedRows || 0 }; };
    const pool = { query: async (...args) => { const release = await lease(); try { return await query(...args); } finally { release(); } } };
    async function tx(fn) { const release = await lease(); try { await query('BEGIN'); const out = await fn({ query }); await query('COMMIT'); return out; } catch (e) { await query('ROLLBACK'); throw e; } finally { release(); } }
    const connection = async (client, tenant, provider, lock = '') => (await client.query(`SELECT * FROM office_integrations WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1 AND provider=$2 ${lock}`, [tenant, provider])).rows[0];
    const integration = (await pool.query(`INSERT INTO office_integrations(law_firm_tenant_id,provider,settings) VALUES($1,'whatsapp',$2) RETURNING id`, [A, { gateway: 'waha', recipients: ['0504444444'], sessionName: session }])).rows[0].id;
    let rechecks = 0;
    const service = createWhatsappContactPermissions({ pool, tx, connection, recheckQueued: async tenant => { assert.equal(tenant, A); rechecks++; return { rechecked: 0 }; } });
    return { db, pool, tx, service, integration, rechecks: () => rechecks };
}

test('contact permissions require current same-office membership, explicit evidence and scoped operator', async t => {
    const f = await fixture(t);
    await assert.rejects(f.service.setPermission(A, { phone: '0502222222', allowed: true, evidence: 'yes' }, 1), { errorCode: 'INVALID_CONTACT_PERMISSION' });
    await assert.rejects(f.service.setPermission(A, { phone: '0503333333', allowed: true, evidence: 'Synthetic permission' }, 1), { errorCode: 'CONTACT_NOT_IN_OFFICE' });
    await assert.rejects(f.service.setPermission(A, { phone: '0502222222', allowed: true, evidence: 'Synthetic permission' }, 3), { errorCode: 'CONTACT_PERMISSION_FORBIDDEN' });
    const allowed = await f.service.setPermission(A, { phone: '+972502222222', allowed: true, evidence: 'Synthetic explicit permission' }, 1);
    assert.equal(allowed.phone, '+972502222222'); assert.equal(allowed.allowed, true); assert.equal(Number(allowed.version), 1);
    const fixed = await f.service.setPermission(A, { phone: '0504444444', allowed: true, evidence: 'Synthetic fixed office teammate' }, 1);
    assert.equal(fixed.allowed, true);
    assert.deepEqual(await f.service.permissionFor(f.pool, B, '+972502222222'), { allowed: false, version: null });
    const blocked = await f.service.setPermission(A, { phone: '+972505555555', allowed: false, evidence: 'Synthetic unknown contact opt-out' }, 1);
    assert.equal(blocked.allowed, false, 'Blocking does not require registration');
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM whatsapp_contact_permissions')).rows[0].n, 3);
});

test('opt-out blocks known-unsent groups and cancels remaining invites without changing unknown provider outcomes', async t => {
    const f = await fixture(t), phone = '+972502222222';
    for (const [status, groupId, requestId] of [['queued', null, null], ['created', 'known@g.us', null], ['uncertain', null, 'uncertain-request']]) {
        const caseId = (await f.pool.query('INSERT INTO cases(law_firm_tenant_id,casename) VALUES($1,$2) RETURNING caseid', [A, status])).rows[0].caseid;
        await f.pool.query(`INSERT INTO case_whatsapp_groups(law_firm_tenant_id,case_id,connection_id,mode,status,subject,recipients,gateway,group_id,request_id)
            VALUES($1,$2,$3,'live',$4,'Synthetic only',$5,'waha',$6,$7)`, [A, caseId, f.integration, status, JSON.stringify([{ phone, status: 'pending' }, { phone: '+972506666666', status: 'sent', messageId: 'keep' }]), groupId, requestId]);
    }
    await f.service.setPermission(A, { phone, allowed: true, evidence: 'Synthetic initial consent' }, 1);
    await f.service.setPermission(A, { phone, allowed: false, evidence: 'Synthetic explicit stop' }, 1);
    const rows = (await f.pool.query('SELECT * FROM case_whatsapp_groups ORDER BY created_at,id')).rows;
    const queued = rows.find(row => row.group_id === null && row.request_id === null);
    assert.equal(queued.status, 'needs_attention'); assert.equal(queued.error_code, 'CONTACT_PERMISSION_REQUIRED');
    assert.equal(rows.find(row => row.request_id).status, 'uncertain');
    assert.equal(rows.find(row => row.group_id).status, 'created');
    for (const row of rows) {
        assert.equal(row.recipients[0].status, 'cancelled'); assert.equal(row.recipients[1].messageId, 'keep');
    }
    const permission = await f.service.permissionFor(f.pool, A, phone, 'FOR SHARE');
    assert.equal(permission.allowed, false); assert.equal(Number(permission.version), 2);
    assert.deepEqual(await f.service.recheckGroups(A), { rechecked: 0 }); assert.equal(f.rechecks(), 1);
    assert.equal((await f.pool.query('SELECT status FROM case_whatsapp_groups WHERE id=$1', [queued.id])).rows[0].status, 'needs_attention', 'Helper never requeues without root current-party/device review');
});

test('only exact direct opt-out words revoke permission; other chat is discarded', async t => {
    const f = await fixture(t);
    const body = value => ({ event: 'message', payload: { from: '972502222222@c.us', fromMe: false, body: value } });
    for (const value of [' STOP ', 'הסר', 'הפסק', 'إيقاف', 'توقف']) assert.equal(optOutPhone(body(value)), '+972502222222');
    for (const value of ['please stop by today', 'שלום', 'STOP now', 'stop!']) assert.equal(optOutPhone(body(value)), null);
    assert.equal(optOutPhone({ ...body('STOP'), payload: { ...body('STOP').payload, fromMe: true } }), null);
    assert.equal(optOutPhone({ ...body('STOP'), payload: { ...body('STOP').payload, from: '123456789@g.us' } }), null);
    assert.equal(await f.tx(client => f.service.receiveOptOut(client, A, body('הסר'))), true);
    const record = (await f.pool.query('SELECT * FROM whatsapp_contact_permissions')).rows[0];
    assert.equal(record.allowed, false); assert.equal(record.source, 'inbound_optout'); assert.equal(record.actor_user_id, null);
    assert.equal(record.evidence, 'WhatsApp opt-out request');
    assert.equal(await f.tx(client => f.service.receiveOptOut(client, A, body('Synthetic private chat'))), false);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM whatsapp_contact_permissions')).rows[0].n, 1);
});

test('webhook dedupe uses database freshness and commits identifiers only, not conversation payloads', async t => {
    const f = await fixture(t), metadata = { payloadHash: crypto.createHash('sha256').update('synthetic raw body').digest('hex') };
    const body = { session, id: 'evt_synthetic_1', timestamp: Date.now() };
    assert.equal(await f.tx(client => claimLinkedEvent(client, A, f.integration, body, metadata)), true);
    assert.equal(await f.tx(client => claimLinkedEvent(client, A, f.integration, body, metadata)), false);
    assert.equal(await f.tx(client => claimLinkedEvent(client, A, f.integration, { ...body, id: 'evt_expired', timestamp: Date.now() - 601000 }, metadata)), false);
    assert.equal(await f.tx(client => claimLinkedEvent(client, A, f.integration, { ...body, id: 'evt_future', timestamp: Date.now() + 61000 }, metadata)), false);
    assert.equal(await f.tx(client => claimLinkedEvent(client, A, f.integration, { ...body, session: 'arbitrary-session' }, metadata)), false);
    const stored = (await f.pool.query('SELECT * FROM whatsapp_linked_webhook_events')).rows;
    assert.equal(stored.length, 1); assert.equal(stored[0].payload_hash, metadata.payloadHash); assert.equal(stored[0].body, undefined);
    await assert.rejects(f.tx(async client => { assert.equal(await claimLinkedEvent(client, A, f.integration, { ...body, id: 'evt_rollback' }, metadata), true); throw Error('synthetic rollback'); }), /synthetic rollback/);
    assert.equal(await f.tx(client => claimLinkedEvent(client, A, f.integration, { ...body, id: 'evt_rollback' }, metadata)), true, 'Rollback permits safe retry of effects, committed duplicate does not');
});

test('new permission and callback tables enforce actual shared-office RLS and reference guards', async t => {
    const f = await fixture(t);
    const other = (await f.pool.query(`INSERT INTO office_integrations(law_firm_tenant_id,provider,settings) VALUES($1,'whatsapp','{}') RETURNING id`, [B])).rows[0].id;
    const installer = fs.readFileSync(path.join(__dirname, '../scripts/install-office-isolation.js'), 'utf8');
    for (const name of ['office_scope_id', 'guard_office_owner']) {
        const pattern = new RegExp('await client\\.query\\(`(CREATE OR REPLACE FUNCTION public\\.' + name + '[\\s\\S]*?)`\\);');
        await f.db.exec(installer.match(pattern)[1]);
    }
    await f.db.exec(`CREATE ROLE linked_permission_runtime NOSUPERUSER NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public TO linked_permission_runtime;
        GRANT SELECT,UPDATE ON office_integrations TO linked_permission_runtime;
        GRANT SELECT ON users TO linked_permission_runtime;`);
    await f.db.exec(sqlFile('2026-10-24_02_whatsapp_linked_device.sql'));
    await f.pool.query(`INSERT INTO whatsapp_contact_permissions(law_firm_tenant_id,phone,allowed,evidence,actor_user_id,source)
        VALUES($1,'+972502222222',true,'Synthetic A permission',1,'staff'),($2,'+972503333333',false,'Synthetic B opt-out',3,'staff')`, [A, B]);
    await f.pool.query(`INSERT INTO whatsapp_linked_webhook_events(law_firm_tenant_id,connection_id,event_id,session_name,payload_hash,event_timestamp)
        VALUES($1,$2,'synthetic-a',$5,$6,clock_timestamp()),($3,$4,'synthetic-b',$5,$6,clock_timestamp())`, [A, f.integration, B, other, session, 'a'.repeat(64)]);
    await f.db.exec(`SET ROLE linked_permission_runtime; SELECT set_config('app.office_mode','office',false),set_config('app.office_id','${A}',false);`);
    assert.equal((await f.pool.query('SELECT * FROM whatsapp_contact_permissions')).rows.length, 1);
    assert.equal((await f.pool.query('SELECT * FROM whatsapp_linked_webhook_events')).rows.length, 1);
    await assert.rejects(f.pool.query(`INSERT INTO whatsapp_contact_permissions(law_firm_tenant_id,phone,allowed,evidence,source) VALUES($1,'+972505555555',true,'Synthetic forbidden','staff')`, [B]), /row-level security/);
    await assert.rejects(f.pool.query(`INSERT INTO whatsapp_contact_permissions(law_firm_tenant_id,phone,allowed,evidence,actor_user_id,source) VALUES($1,'+972505555555',true,'Synthetic foreign actor',3,'staff')`, [A]), /office reference/);
    await assert.rejects(f.pool.query(`INSERT INTO whatsapp_linked_webhook_events(law_firm_tenant_id,connection_id,event_id,session_name,payload_hash,event_timestamp) VALUES($1,$2,'foreign-connection',$3,$4,clock_timestamp())`, [A, other, session, 'b'.repeat(64)]), /office reference/);
    await assert.rejects(f.pool.query('UPDATE whatsapp_contact_permissions SET law_firm_tenant_id=$1', [B]), /office owner is immutable/);
    await f.pool.query(`INSERT INTO whatsapp_contact_permissions(phone,allowed,evidence,actor_user_id,source) VALUES('+972506666666',true,'Synthetic default scope',1,'staff')`);
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM whatsapp_contact_permissions')).rows[0].n, 2);
    await f.db.exec(`SELECT set_config('app.office_mode','none',false),set_config('app.office_id','',false)`);
    assert.equal((await f.pool.query('SELECT * FROM whatsapp_contact_permissions')).rows.length, 0);
    assert.equal((await f.pool.query('SELECT * FROM whatsapp_linked_webhook_events')).rows.length, 0);
    await f.db.exec('RESET ROLE');
});

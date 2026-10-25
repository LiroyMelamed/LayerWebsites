'use strict';

// These are recovery-boundary tests only. Central is a loopback test server;
// the production SDK still receives and pins its normal HTTPS destination.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PGlite } = require('@electric-sql/pglite');
const { createSystemMessagesService, CONSENT_VERSION } = require('../lib/systemMessages');
const sdk = require('../lib/systemMessages/vendor/index.cjs');

const CRASH_CHILD = process.argv[2] === '--crash-after-claim';
const test = CRASH_CHILD ? null : require('node:test');
const START = Date.parse('2026-10-25T12:00:00.000Z');
const PAYMENT = 'd891bb21-1183-486a-8ea3-9686a7042121';
const SECRET = 'synthetic-local-sdk-recovery-not-a-provider-key';
const DEPLOYMENT = 'legal-sdk-recovery-test';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const testEnv = () => ({
    CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED: 'true',
    CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED: 'true',
    CENTRAL_SYSTEM_MESSAGES_MODE: 'dedicated',
    CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID: DEPLOYMENT,
    CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID: '1',
    CENTRAL_SYSTEM_MESSAGES_HMAC_KEY: SECRET,
    BACKGROUND_JOBS_ENABLED: 'false',
});

async function localCentral(now, { loseFirstMessageResponse = false } = {}) {
    const requests = [], accepted = new Map(), failures = [];
    let lost = false;
    const server = http.createServer(async (request, response) => {
        try {
            assert.equal(request.method, 'POST');
            assert.ok([sdk.CONSENT_PATH, sdk.MESSAGE_PATH].includes(request.url));
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const bytes = Buffer.concat(chunks);
            assert.ok(bytes.length > 0 && bytes.length <= 16_384);
            const body = bytes.toString('utf8');
            const payload = JSON.parse(body);
            assert.equal(request.headers['content-type'], 'application/json');
            assert.equal(request.headers['x-system-deployment'], DEPLOYMENT);
            const timestamp = request.headers['x-system-timestamp'];
            assert.equal(timestamp, String(now()));
            const signature = 'sha256=' + crypto.createHmac('sha256', SECRET)
                .update(`central-system-v1\n${DEPLOYMENT}\n${timestamp}\nPOST\n${request.url}\n`, 'utf8')
                .update(bytes).digest('hex');
            assert.equal(request.headers['x-system-signature'], signature);
            requests.push({ path: request.url, body, sha256: sha256(bytes), timestamp,
                signature: request.headers['x-system-signature'], eventId: payload.eventId });
            const key = request.url + ':' + payload.eventId;
            const previous = accepted.get(key);
            if (previous) assert.equal(previous.sha256, sha256(bytes), 'replayed UUID changed its original UTF-8 bytes');
            // A known receipt can be recovered after the new-event window. A
            // never-accepted stale request cannot become fresh through a retry.
            if (!previous && now() - Date.parse(payload.capturedAt || payload.occurredAt) > 300_000) {
                response.writeHead(409).end();
                return;
            }
            const receipt = previous || { sha256: sha256(bytes), id: crypto.randomUUID() };
            if (!previous) accepted.set(key, receipt);
            if (request.url === sdk.MESSAGE_PATH && loseFirstMessageResponse && !lost) {
                lost = true;
                // The receipt has committed in the independent Central stub.
                // Lose the actual HTTP response, rather than inventing a client result.
                response.destroy();
                return;
            }
            response.writeHead(previous ? 200 : 202, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(request.url === sdk.CONSENT_PATH ?
                { ok: true, replayed: Boolean(previous) } :
                { id: receipt.id, status: 'pending', replayed: Boolean(previous) }));
        } catch (error) {
            failures.push(error);
            if (!response.destroyed) response.writeHead(400).end();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const fetchImpl = async (url, options) => {
        const parsed = new URL(url);
        assert.equal(parsed.origin, sdk.CENTRAL_ORIGIN, 'SDK origin must stay pinned');
        assert.ok([sdk.CONSENT_PATH, sdk.MESSAGE_PATH].includes(parsed.pathname));
        assert.equal(options.redirect, 'error');
        // Only the test transport boundary is routed to the loopback server.
        // Neither SDK configuration nor application endpoint validation changes.
        return fetch(endpoint + parsed.pathname, options);
    };
    return { requests, accepted, failures, fetchImpl,
        close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

async function fixture(t, options) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-sdk-recovery-'));
    let pg = new PGlite(directory), milliseconds = START;
    const query = async (sql, parameters = []) => {
        const result = await pg.query(sql, parameters);
        return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    };
    const database = { query, async connect() { return { query, release() {} }; } };
    const central = await localCentral(() => milliseconds, options);
    t.after(async () => {
        await central.close();
        if (pg) await pg.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });
    await pg.exec(`
        CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY,owner_user_id integer);
        CREATE TABLE users(userid integer PRIMARY KEY,name text,phonenumber text,role text,law_firm_tenant_id uuid);
        CREATE TABLE platform_admins(user_id integer PRIMARY KEY,is_active boolean);
        CREATE TABLE firm_billing(id integer PRIMARY KEY,law_firm_tenant_id uuid,status text);
        CREATE TABLE firm_payment_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,kind text,status text,
            amount_ils numeric,settled_at timestamptz,signup_intent_id uuid);
        CREATE TABLE signup_intents(id uuid PRIMARY KEY,law_firm_tenant_id uuid,status text);
        INSERT INTO users VALUES(1,'מנוי סינתטי','0501234567','Admin',null);
        INSERT INTO platform_admins VALUES(1,true);
        INSERT INTO firm_billing VALUES(1,null,'active');
    `);
    await pg.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-10-25_system_messages.sql'), 'utf8'));
    const service = () => createSystemMessagesService({ database, env: testEnv(), now: () => new Date(milliseconds),
        clientFactory: config => sdk.createSystemMessagesClient({ ...config, now: () => milliseconds, fetchImpl: central.fetchImpl }) });
    const tx = async fn => {
        await query('BEGIN');
        try { const result = await fn(database); await query('COMMIT'); return result; }
        catch (error) { await query('ROLLBACK'); throw error; }
    };
    const initial = service();
    const actionId = crypto.randomUUID();
    await tx(client => initial.setConsent(client, { ownerUserId: 1, recipient: '+972501234567', optedIn: true,
        version: CONSENT_VERSION, actionId, sourceRef: 'settings:' + actionId }));
    assert.equal((await initial.flush({ limit: 1 })).accepted, 1);
    milliseconds += 100;
    await query(`INSERT INTO firm_payment_intents(id,kind,status,amount_ils,settled_at)
        VALUES($1,'renewal','succeeded',123.45,$2)`, [PAYMENT, new Date(milliseconds)]);
    const payment = await tx(client => initial.enqueuePaymentReceived(client, { intent: { id: PAYMENT } }));
    const row = async () => (await query('SELECT * FROM central_system_message_outbox WHERE id=$1', [payment.eventId])).rows[0];
    return { directory, central, service, row,
        advance(value) { milliseconds += value; },
        now() { return milliseconds; },
        async closeDb() { await pg.close(); pg = null; },
        async openDb() { assert.equal(pg, null); pg = new PGlite(directory); await pg.waitReady; } };
}

async function crashAfterCommittedClaim(directory, milliseconds) {
    const pg = new PGlite(directory);
    const query = async (sql, parameters = []) => {
        const result = await pg.query(sql, parameters);
        if (sql.trim().toUpperCase() === 'COMMIT') {
            // This is the first transaction in this isolated worker: the claim.
            // Flush the committed disk database, then really terminate the process
            // before the service can open its dispatch transaction or call the SDK.
            await pg.close();
            fs.writeSync(1, 'CLAIM_COMMITTED_NETWORK_NOT_STARTED\n');
            process.exit(73);
        }
        return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    };
    const database = { query, async connect() { return { query, release() {} }; } };
    const service = createSystemMessagesService({ database, env: testEnv(), now: () => new Date(milliseconds),
        clientFactory: config => sdk.createSystemMessagesClient({ ...config, now: () => milliseconds,
            fetchImpl: async () => { process.exit(75); } }) });
    await service.flush({ limit: 1 });
    process.exit(76);
}

if (CRASH_CHILD) {
    crashAfterCommittedClaim(process.argv[3], Number(process.argv[4])).catch(() => process.exit(74));
} else {
    test('real SDK lost HTTP receipt recovers original payment UUID and bytes after five minutes', { timeout: 30_000 }, async t => {
        const f = await fixture(t, { loseFirstMessageResponse: true });
        const original = await f.row();
        assert.equal(JSON.parse(original.prepared.body).message.amountCents, 12345);
        assert.equal((await f.service().flush({ limit: 1 })).retry, 1);
        const unknown = await f.row();
        assert.equal(unknown.status, 'pending');
        assert.equal(unknown.last_code, 'CENTRAL_ENQUEUE_OUTCOME_UNKNOWN');
        assert.equal(unknown.attempt_count, 1);
        assert.equal(unknown.central_queue_id, null);
        assert.deepEqual(unknown.prepared, original.prepared);
        const first = f.central.requests.find(request => request.path === sdk.MESSAGE_PATH);
        const receipt = f.central.accepted.get(sdk.MESSAGE_PATH + ':' + original.id);
        assert.ok(first && receipt, 'Central must commit before its connection is lost');
        f.advance(360_000);
        assert.equal((await f.service().flush({ limit: 1 })).accepted, 1);
        const recovered = await f.row();
        const payments = f.central.requests.filter(request => request.path === sdk.MESSAGE_PATH);
        assert.equal(payments.length, 2);
        assert.equal(payments[0].eventId, original.id);
        assert.equal(payments[1].eventId, original.id);
        assert.equal(payments[0].body, original.prepared.body);
        assert.equal(payments[1].body, original.prepared.body);
        assert.equal(payments[0].sha256, payments[1].sha256);
        assert.notEqual(payments[0].timestamp, payments[1].timestamp);
        assert.notEqual(payments[0].signature, payments[1].signature);
        assert.equal(recovered.status, 'accepted');
        assert.equal(recovered.central_queue_id, receipt.id);
        assert.equal(recovered.central_status, 'pending', 'receipt is intake acceptance, not delivery');
        assert.deepEqual(recovered.prepared, original.prepared);
        assert.equal(+recovered.occurred_at, +original.occurred_at);
        assert.equal(f.central.accepted.size, 2, 'one consent plus one payment, with no duplicate accepted event');
        assert.equal((await f.service().flush({ limit: 1 })).processed, 0);
        assert.equal(f.central.requests.filter(request => request.path === sdk.MESSAGE_PATH).length, 2);
        assert.deepEqual(f.central.failures, []);
    });

    test('real process crash after committed claim and before network recovers only original event after lease', { timeout: 30_000 }, async t => {
        const f = await fixture(t);
        const original = await f.row();
        await f.closeDb();
        const child = spawn(process.execPath, [__filename, '--crash-after-claim', f.directory, String(f.now())],
            { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr += data; });
        const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
        const exit = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', (code, signal) => resolve({ code, signal }));
        }).finally(() => clearTimeout(timer));
        assert.deepEqual(exit, { code: 73, signal: null }, 'worker must die at the committed-claim boundary');
        assert.equal(stdout, 'CLAIM_COMMITTED_NETWORK_NOT_STARTED\n');
        assert.equal(stderr, '');
        assert.equal(f.central.requests.filter(request => request.path === sdk.MESSAGE_PATH).length, 0);
        await f.openDb();
        const committed = await f.row();
        assert.equal(committed.status, 'sending');
        assert.equal(committed.attempt_count, 0);
        assert.ok(committed.lease_id);
        assert.equal(+committed.lease_until, f.now() + 60_000);
        assert.deepEqual(committed.prepared, original.prepared);
        f.advance(59_000);
        assert.equal((await f.service().flush({ limit: 1 })).processed, 0);
        assert.equal(f.central.requests.filter(request => request.path === sdk.MESSAGE_PATH).length, 0);
        f.advance(2_000);
        assert.equal((await f.service().flush({ limit: 1 })).accepted, 1);
        const recovered = await f.row();
        const payments = f.central.requests.filter(request => request.path === sdk.MESSAGE_PATH);
        assert.equal(payments.length, 1);
        assert.equal(payments[0].eventId, original.id);
        assert.equal(payments[0].body, original.prepared.body);
        assert.equal(recovered.id, original.id);
        assert.deepEqual(recovered.prepared, original.prepared);
        assert.equal(+recovered.occurred_at, +original.occurred_at);
        assert.equal(recovered.status, 'accepted');
        assert.equal(f.central.accepted.size, 2);
        assert.equal((await f.service().flush({ limit: 1 })).processed, 0);
        assert.deepEqual(f.central.failures, []);
    });
}

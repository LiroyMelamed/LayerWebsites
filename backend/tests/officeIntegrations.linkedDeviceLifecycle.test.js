'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const secrets = require('../services/integrations/secrets');
const { createLinkedDeviceService } = require('../services/integrations/linkedDeviceService');
const { linkedLiveEnabled, linkedDeliveryAllowed } = require('../services/integrations/linkedDevicePolicy');
const CID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PHONE = '972501234567';
const ACK = { acknowledgeUnofficial: true, acknowledgePermissions: true };
const BASE_ENV = { INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_WAHA_ENABLED: 'true',
    WHATSAPP_WAHA_DELIVERY_ENABLED: 'true', WHATSAPP_WAHA_CONNECT_ONLY: 'false' };
const copy = value => structuredClone(value);
function fixture(options = {}) {
    let row = { id: CID, provider: 'whatsapp', law_firm_tenant_id: options.tenant || null, enabled: false,
        status: 'disconnected', settings: { mode: 'demo' }, safety_state: {}, dispatch_claim: null,
        secret_ciphertext: null, phone_number_id: null, waba_id: null, display_phone: null, last_checked_at: null,
        ...copy(options.row || {}) };
    const env = { ...BASE_ENV, ...options.env }, calls = [];
    let clock = Date.parse('2026-10-24T15:00:00.000Z'), tail = Promise.resolve(), cancelled = 0, service, transactionCount = 0;
    const db = { query: async (sql, values = []) => {
        if (sql.startsWith('SELECT clock_timestamp()')) return { rows: [{ safety_now: new Date(clock += 1000) }] };
        if (sql.startsWith('UPDATE office_integrations SET enabled=$2,status=$3,settings=$4,secret_ciphertext=$5,')) {
            assert.equal(values[0], row.id);
            row = { ...row, enabled: values[1], status: values[2], settings: copy(values[3]), secret_ciphertext: values[4],
                phone_number_id: values[5], waba_id: values[6], display_phone: values[7], last_checked_at: copy(values[8]), safety_state: copy(values[9]) };
            return { rowCount: 1, rows: [] };
        }
        if (sql.startsWith('SELECT id FROM office_integrations')) return { rows: options.duplicatePhone ? [{ id: 'foreign' }] : [] };
        if (sql.startsWith('DELETE FROM integration_signup_sessions')) return { rowCount: 0, rows: [] };
        throw new Error('UNEXPECTED_SYNTHETIC_SQL');
    } };
    const tx = fn => {
        const transaction = ++transactionCount;
        const result = tail.then(async () => {
            const before = copy(row);
            try { return await fn(db); } catch (error) { row = before; throw error; }
        });
        tail = result.catch(() => {});
        // The hook runs after the simulated commit and lock release, allowing
        // a competing request into the precise durable-marker / next-tx gap.
        return result.then(async value => { await options.afterCommit?.(transaction); return value; });
    };
    const binding = c => `${c.law_firm_tenant_id || 'dedicated'}:${c.id}:whatsapp`;
    const provider = {
        configurationInfo: () => ({ configured: true }),
        createSession: async name => {
            calls.push(['createSession', name]);
            assert.equal(row.enabled, false);
            assert.equal(row.settings.linkedStartUncertain, true);
            assert.ok(row.secret_ciphertext);
            return { sessionName: name, status: 'STARTING' };
        },
        health: async name => { calls.push(['health', name]); return { sessionName: name, status: 'WORKING', connected: true,
            ready: true, restricted: false, phoneId: PHONE, displayPhone: `+${PHONE}` }; },
        listSessions: async () => [{ sessionName: row.settings.sessionName, status: 'WORKING', phoneId: PHONE }],
        qr: async name => { calls.push(['qr', name]); return { mimetype: 'image/png', data: 'iVBORw0KGgo=' }; },
        logout: async name => { calls.push(['logout', name]); },
        stopSession: async name => { calls.push(['stopSession', name]); },
        ...options.provider,
    };
    service = createLinkedDeviceService({ pool: db, provider, env, tx, connection: async () => copy(row),
        ensure: async () => copy(row), token: c => JSON.parse(secrets.open(c.secret_ciphertext, binding(c), env)).token,
        binding, cancelPending: async () => { cancelled++; } });
    return { service, provider, env, db, get row() { return copy(row); }, set row(value) { row = copy(value); }, calls,
        get cancelled() { return cancelled; }, binding };
}

test('linked policy separates Meta connect-only and requires explicit WAHA outbound flags', () => {
    assert.equal(linkedLiveEnabled({ ...BASE_ENV, WHATSAPP_CONNECT_ONLY: 'true' }), true);
    for (const env of [{ WHATSAPP_WAHA_ENABLED: 'false' }, { WHATSAPP_WAHA_DELIVERY_ENABLED: 'false' },
        { WHATSAPP_WAHA_CONNECT_ONLY: 'true' }, { WHATSAPP_DEMO_ONLY: 'true' }, { QA_OUTBOUND_MODE: 'noop' }])
        assert.equal(linkedLiveEnabled({ ...BASE_ENV, ...env }), false);
    const c = { settings: { gateway: 'waha' }, display_phone: `+${PHONE}` };
    assert.equal(linkedDeliveryAllowed(BASE_ENV, {}, c), true);
    assert.equal(linkedDeliveryAllowed(BASE_ENV, {}, { settings: { gateway: 'meta' } }), false);
});

test('race: disconnect after marker commit fences off the second-phase create POST', async () => {
    let f, disconnected;
    f = fixture({ afterCommit: async transaction => {
        if (transaction === 1) disconnected = await f.service.disconnect(null);
    } });
    const result = await f.service.start(null, ACK);
    assert.equal(disconnected.sessionStatus, 'disconnected');
    assert.equal(result.sessionStatus, 'disconnected');
    assert.equal(f.calls.filter(call => call[0] === 'createSession').length, 0);
    assert.equal(f.row.secret_ciphertext, null);
    assert.equal(f.row.enabled, false);
});

test('race: disconnect during create waits for the locked POST and saves its outcome before cleanup', async () => {
    const f = fixture(), sequence = [];
    let resolveCreate, entered;
    const created = new Promise(resolve => { entered = resolve; });
    f.provider.createSession = name => {
        sequence.push('create-entered');
        assert.equal(f.row.settings.linkedStartUncertain, true);
        assert.ok(f.row.secret_ciphertext);
        entered();
        return new Promise(resolve => { resolveCreate = () => {
            sequence.push('create-completed'); resolve({ sessionName: name, status: 'STARTING' });
        }; });
    };
    f.provider.logout = async () => { sequence.push('logout'); assert.equal(f.row.settings.linkedStartUncertain, false); };
    f.provider.stopSession = async () => { sequence.push('stop'); };
    const starting = f.service.start(null, ACK);
    await created;
    const disconnecting = f.service.disconnect(null);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(sequence, ['create-entered']);
    assert.equal(f.row.secret_ciphertext !== null, true);
    resolveCreate();
    await starting;
    assert.equal((await disconnecting).sessionStatus, 'disconnected');
    assert.deepEqual(sequence, ['create-entered', 'create-completed', 'logout', 'stop']);
    assert.equal(f.row.secret_ciphertext, null);
});

test('race: uncertain create plus logout/stop 404 retains ownership even if the remote create appears later', async () => {
    let remoteSessionExists = false, createCalls = 0;
    const f = fixture({ provider: {
        createSession: async () => { createCalls++; throw Object.assign(new Error('synthetic timeout'), { uncertain: true }); },
        logout: async () => { throw Object.assign(new Error('not found'), { httpStatus: 404, uncertain: false }); },
        stopSession: async () => { throw Object.assign(new Error('not found'), { httpStatus: 404, uncertain: false }); },
    } });
    await f.service.start(null, ACK);
    const marker = f.row.secret_ciphertext, generation = f.row.settings.connectionGeneration;
    const result = await f.service.disconnect(null);
    assert.equal(result.lastError, 'DISCONNECT_UNKNOWN');
    assert.equal(f.row.secret_ciphertext, marker);
    assert.equal(f.row.settings.linkedStartUncertain, true);
    assert.equal(f.row.settings.linkedDisconnectPending, true);
    remoteSessionExists = true; // The timed-out create completes after both 404s.
    await f.service.start(null, ACK);
    assert.equal(createCalls, 1);
    assert.equal(f.row.settings.connectionGeneration, generation);
    assert.equal(f.row.secret_ciphertext, marker);
    f.provider.logout = async () => { assert.equal(remoteSessionExists, true); remoteSessionExists = false; };
    f.provider.stopSession = async () => {};
    assert.equal((await f.service.disconnect(null)).sessionStatus, 'disconnected');
    assert.equal(remoteSessionExists, false);
    assert.equal(f.row.secret_ciphertext, null);
});

test('race: late restricted and FAILED checks override an overlapping healthy revision of the same session', async () => {
    for (const adverse of [{ status: 'WORKING', connected: true, ready: false, restricted: true, phoneId: PHONE, displayPhone: `+${PHONE}` },
        { status: 'FAILED', connected: false, ready: false }]) {
        const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
        f.row = { ...f.row, enabled: true };
        let finishAdverse, entered;
        const observed = new Promise(resolve => { entered = resolve; });
        f.provider.health = name => { entered(); return new Promise(resolve => {
            finishAdverse = () => resolve({ sessionName: name, ...adverse });
        }); };
        const oldCheck = f.service.check(null);
        await observed;
        f.provider.health = async name => ({ sessionName: name, status: 'WORKING', connected: true, ready: true,
            restricted: false, phoneId: PHONE, displayPhone: `+${PHONE}` });
        assert.equal((await f.service.check(null)).sessionStatus, 'connected');
        const benignRevision = f.row.settings.linkedRevision;
        finishAdverse();
        assert.equal((await oldCheck).sessionStatus, 'failed');
        assert.notEqual(f.row.settings.linkedRevision, benignRevision);
        assert.equal(f.row.enabled, false);
        assert.equal(f.row.last_checked_at, null);
        assert.equal(f.row.safety_state.paused, true);
    }
});

test('race: a late transport/auth failure cannot be dropped after a concurrent healthy check', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    let rejectHealth, entered;
    const observed = new Promise(resolve => { entered = resolve; });
    f.provider.health = () => { entered(); return new Promise((resolve, reject) => { rejectHealth = reject; }); };
    const failing = f.service.check(null);
    await observed;
    f.provider.health = async name => ({ sessionName: name, status: 'WORKING', connected: true, ready: true,
        phoneId: PHONE, displayPhone: `+${PHONE}` });
    assert.equal((await f.service.check(null)).sessionStatus, 'connected');
    rejectHealth(Object.assign(new Error('synthetic auth failure'), { safetyReason: 'PROVIDER_AUTH', httpStatus: 401 }));
    assert.equal((await failing).sessionStatus, 'failed');
    assert.equal(f.row.safety_state.paused, true);
    assert.equal(f.row.safety_state.reason, 'PROVIDER_AUTH');
    assert.equal(f.row.enabled, false);
    assert.equal(f.row.last_checked_at, null);
});

test('race: stale healthy check cannot undo a newer adverse check of the same generation', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    let finishHealthy, entered;
    const observed = new Promise(resolve => { entered = resolve; });
    f.provider.health = name => { entered(); return new Promise(resolve => { finishHealthy = () => resolve({ sessionName: name,
        status: 'WORKING', connected: true, ready: true, phoneId: PHONE, displayPhone: `+${PHONE}` }); }); };
    const healthy = f.service.check(null);
    await observed;
    f.provider.health = async name => ({ sessionName: name, status: 'WORKING', connected: true, ready: false,
        restricted: true, phoneId: PHONE, displayPhone: `+${PHONE}` });
    await f.service.check(null);
    const adverseRevision = f.row.settings.linkedRevision;
    finishHealthy();
    assert.equal((await healthy).sessionStatus, 'failed');
    assert.equal(f.row.settings.linkedRevision, adverseRevision);
    assert.equal(f.row.settings.linkedError, 'PROVIDER_RESTRICTED');
    assert.equal(f.row.safety_state.paused, true);
});

test('race: a late adverse check cannot overwrite pending disconnect', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    let finishHealth, healthEntered;
    const observed = new Promise(resolve => { healthEntered = resolve; });
    f.provider.health = name => { healthEntered(); return new Promise(resolve => { finishHealth = () => resolve({ sessionName: name,
        status: 'FAILED', connected: false, ready: false }); }); };
    const checking = f.service.check(null);
    await observed;
    let finishLogout, logoutEntered;
    const loggingOut = new Promise(resolve => { logoutEntered = resolve; });
    f.provider.logout = () => { logoutEntered(); return new Promise(resolve => { finishLogout = resolve; }); };
    const disconnecting = f.service.disconnect(null);
    await loggingOut;
    const pendingRevision = f.row.settings.linkedRevision;
    finishHealth();
    assert.equal((await checking).lastError, 'DISCONNECT_UNKNOWN');
    assert.equal(f.row.settings.linkedRevision, pendingRevision);
    finishLogout();
    await disconnecting;
    const oldGeneration = f.row.settings.connectionGeneration;
    f.provider.logout = async () => {};
    await f.service.start(null, ACK);
    assert.notEqual(f.row.settings.connectionGeneration, oldGeneration);
    // A different sealed marker and session remain outside the old observation's scope.
    assert.equal(f.service.snapshot(f.row).sessionStatus, 'starting');
});

test('race: a retired generation adverse check cannot disable the replacement session', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    let finishHealth, entered;
    const observed = new Promise(resolve => { entered = resolve; });
    f.provider.health = name => { entered(); return new Promise(resolve => { finishHealth = () => resolve({ sessionName: name,
        status: 'FAILED', connected: false, ready: false }); }); };
    const checking = f.service.check(null);
    await observed;
    await f.service.disconnect(null);
    await f.service.start(null, ACK);
    const replacement = f.row;
    finishHealth();
    assert.equal((await checking).sessionStatus, 'starting');
    assert.equal(f.row.secret_ciphertext, replacement.secret_ciphertext);
    assert.equal(f.row.settings.connectionGeneration, replacement.settings.connectionGeneration);
    assert.equal(f.row.settings.linkedRevision, replacement.settings.linkedRevision);
    assert.equal(f.row.settings.linkedStatus, 'starting');
});

test('QA noop exception requires pilot flag, exact job marking and every linked/recipient number allowlisted', () => {
    const env = { ...BASE_ENV, QA_OUTBOUND_MODE: 'noop', WHATSAPP_WAHA_QA_PILOT_ENABLED: 'true',
        WHATSAPP_WAHA_PILOT_ALLOWLIST: '+972501234567,0509876543' };
    const c = { settings: { gateway: 'waha' }, display_phone: `+${PHONE}` };
    const job = { is_pilot: true, recipients: [{ phone: '+972509876543' }] };
    assert.equal(linkedLiveEnabled(env), true);
    assert.equal(linkedDeliveryAllowed(env, job, c), true);
    for (const patch of [{ is_pilot: false }, { recipients: [] }, { recipients: [{ phone: '+972501111111' }] },
        { recipients: [{ phone: '+972509876543' }, { phone: 'invalid' }] }]) assert.equal(linkedDeliveryAllowed(env, { ...job, ...patch }, c), false);
    assert.equal(linkedDeliveryAllowed(env, job, { ...c, display_phone: '+972501111111' }), false);
    assert.equal(linkedDeliveryAllowed({ ...env, WHATSAPP_WAHA_PILOT_ALLOWLIST: '+972501234567,bad' }, job, c), false);
    assert.equal(linkedDeliveryAllowed({ ...env, WHATSAPP_WAHA_CONNECT_ONLY: 'true' }, job, c), false);
});

test('start commits a sealed session/generation claim before POST, duplicate starts cannot create twice', async () => {
    const f = fixture();
    const [a, b] = await Promise.all([f.service.start(null, ACK), f.service.start(null, ACK)]);
    assert.equal(f.calls.filter(call => call[0] === 'createSession').length, 1);
    assert.equal(a.sessionStatus, 'starting');
    assert.equal(b.connectionGeneration, a.connectionGeneration);
    assert.match(f.row.settings.sessionName, /^off_a{32}_[a-f0-9]{16}$/);
    assert.equal(f.row.enabled, false);
    assert.equal(f.row.settings.linkedStartUncertain, false);
    const marker = JSON.parse(secrets.open(f.row.secret_ciphertext, f.binding(f.row), f.env));
    assert.equal(marker.generation, a.connectionGeneration);
    assert.equal(marker.sessionName, f.row.settings.sessionName);
    assert.equal(marker.gateway, 'waha');
    assert.equal(JSON.stringify(a).includes(marker.token), false);
    assert.equal(Object.hasOwn(a, 'sessionName'), false);
    assert.deepEqual(Object.keys(a).sort(), ['configured', 'enabled', 'provider', 'sessionStatus', 'displayPhone', 'liveEnabled', 'connectionGeneration', 'lastError'].sort());
});

test('start requires both acknowledgements, encryption, configured gateway, office binding and old Meta disconnection', async () => {
    const f = fixture();
    for (const ack of [{}, { acknowledgeUnofficial: true }, { acknowledgePermissions: true }])
        await assert.rejects(f.service.start(null, ack), { errorCode: 'WAHA_ACKNOWLEDGEMENT_REQUIRED' });
    assert.equal(f.calls.length, 0);
    const disabled = fixture({ env: { INTEGRATIONS_ENCRYPTION_KEY: undefined } });
    await assert.rejects(disabled.service.start(null, ACK), { errorCode: 'WAHA_SETUP_REQUIRED' });
    const meta = fixture({ row: { secret_ciphertext: 'synthetic-meta-secret', phone_number_id: '123456' } });
    await assert.rejects(meta.service.start(null, ACK), { errorCode: 'DISCONNECT_FIRST' });
    const tenant = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const unbound = fixture({ tenant });
    await assert.rejects(unbound.service.start(tenant, ACK), { errorCode: 'WAHA_OFFICE_NOT_ALLOWED' });
    const bound = fixture({ tenant, env: { WHATSAPP_WAHA_OFFICE_ID: tenant } });
    assert.equal((await bound.service.start(tenant, ACK)).sessionStatus, 'starting');
});

test('start atomically replaces an enabled disconnected Meta demo flag without touching a provider grant', async () => {
    const f = fixture({ row: { enabled: true, status: 'disconnected', secret_ciphertext: null, phone_number_id: null,
        settings: { gateway: 'meta', mode: 'demo', recipients: ['+972509876543'] } } });
    const result = await f.service.start(null, ACK);
    assert.equal(result.sessionStatus, 'starting');
    assert.equal(f.row.enabled, false);
    assert.equal(f.row.settings.gateway, 'waha');
    assert.equal(f.row.settings.mode, 'demo');
    assert.equal(f.cancelled, 1);
    assert.deepEqual(f.calls.map(call => call[0]), ['createSession']);
    for (const patch of [{ settings: { gateway: 'meta', mode: 'live' } },
        { status: 'connected' }, { secret_ciphertext: 'existing-meta-grant' }, { phone_number_id: '123456' }]) {
        const blocked = fixture({ row: { enabled: true, status: 'disconnected', settings: { gateway: 'meta', mode: 'demo' }, ...patch } });
        await assert.rejects(blocked.service.start(null, ACK), { errorCode: 'DISCONNECT_FIRST' });
        assert.equal(blocked.calls.length, 0);
        assert.equal(blocked.cancelled, 0);
        assert.equal(blocked.row.enabled, true);
    }
});

test('unknown create results remain durable, paused and visible without blind retries', async () => {
    const f = fixture({ provider: { createSession: async () => { throw Object.assign(new Error('synthetic timeout'), { uncertain: true }); } } });
    const result = await f.service.start(null, ACK);
    assert.equal(result.sessionStatus, 'failed');
    assert.equal(result.lastError, 'CONNECTION_START_UNKNOWN');
    assert.equal(f.row.settings.linkedStartUncertain, true);
    assert.equal(f.row.safety_state.paused, true);
    const marker = f.row.secret_ciphertext;
    await f.service.start(null, ACK);
    assert.equal(f.row.secret_ciphertext, marker);
    assert.equal(f.row.settings.linkedStartUncertain, true);
});

test('only full verified fresh health marks connected; checks never enable delivery or clear a pause', async () => {
    const f = fixture();
    assert.equal(f.service.snapshot().sessionStatus, 'disconnected');
    await f.service.start(null, ACK);
    assert.equal(f.service.snapshot(f.row).sessionStatus, 'starting');
    f.row = { ...f.row, safety_state: { version: 1, groups: [], invites: [], lastMutationAt: null,
        lastObservedAt: '2026-10-24T14:59:00.000Z', paused: true, reason: 'MANUAL_PAUSE', pausedAt: '2026-10-24T14:59:00.000Z' } };
    const result = await f.service.check(null);
    assert.equal(result.sessionStatus, 'connected');
    assert.equal(result.displayPhone, `+${PHONE}`);
    assert.equal(f.row.status, 'ready');
    assert.equal(f.row.enabled, false);
    assert.equal(f.row.safety_state.reason, 'MANUAL_PAUSE');
    assert.ok(f.row.last_checked_at);
    const forged = { ...f.row, secret_ciphertext: 'invalid', status: 'ready' };
    assert.equal(f.service.snapshot(forged).sessionStatus, 'failed');
});

test('restrictions, unsupported probes, identity drift and cross-session phone reuse all block readiness', async () => {
    for (const patch of [{ restricted: true, ready: false }, { incompatibleVersion: true, ready: false },
        { phoneId: '972501111111' }, { displayPhone: null }, { ready: false }]) {
        const f = fixture(); await f.service.start(null, ACK);
        const normal = f.provider.health;
        f.provider.health = async name => ({ ...await normal(name), ...patch });
        const result = await f.service.check(null);
        assert.equal(result.sessionStatus, 'failed');
        assert.equal(f.row.enabled, false);
        assert.equal(f.row.last_checked_at, null);
        assert.equal(f.row.safety_state.paused, true);
    }
    const f = fixture({ provider: { listSessions: async () => [{ sessionName: 'administrator-owned-session', phoneId: PHONE }] } });
    await f.service.start(null, ACK);
    assert.equal((await f.service.check(null)).lastError, 'PHONE_CONFLICT');
    const other = fixture({ duplicatePhone: true }); await other.service.start(null, ACK);
    assert.equal((await other.service.check(null)).lastError, 'PHONE_CONFLICT');
});

test('QR observation returns controlled pixels without persisting them or issuing another create', async () => {
    const f = fixture(); await f.service.start(null, ACK);
    f.provider.health = async name => ({ sessionName: name, status: 'SCAN_QR_CODE', connected: false, ready: false });
    const result = await f.service.qr(null);
    assert.equal(result.status, 'qr');
    assert.equal(result.qrDataUrl, 'data:image/png;base64,iVBORw0KGgo=');
    assert.equal(JSON.stringify(f.row).includes('iVBORw0KGgo='), false);
    assert.equal(f.calls.filter(call => call[0] === 'createSession').length, 1);
});

test('sanitized adverse status callbacks pause immediately; healthy WORKING never reconnects', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    const body = { event: 'session.status', session: f.row.settings.sessionName, payload: { status: 'FAILED' } };
    assert.equal(await f.service.receiveEvent(null, CID, body), true);
    assert.equal(f.row.enabled, false);
    assert.equal(f.row.last_checked_at, null);
    assert.equal(f.row.safety_state.paused, true);
    assert.equal(await f.service.receiveEvent(null, CID, { ...body, payload: { status: 'WORKING' } }), false);
    assert.equal(f.service.snapshot(f.row).sessionStatus, 'failed');
    assert.equal(await f.service.receiveEvent(null, CID, { ...body, payload: { status: 'FAILED', name: 'foreign-session' } }), false);
    assert.equal(await f.service.receiveEvent(null, CID, { ...body, session: 'foreign-session' }), false);
    assert.equal(await f.service.receiveEvent(null, CID, { ...body, payload: { status: 'WORKING', restricted: true } }), true);
    assert.equal(f.row.settings.linkedError, 'PROVIDER_RESTRICTED');
});

test('a check begun before an adverse event cannot overwrite the newer failed state', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    let resolveHealth, entered;
    const started = new Promise(resolve => { entered = resolve; });
    f.provider.health = name => { entered(); return new Promise(resolve => { resolveHealth = () => resolve({ sessionName: name,
        status: 'WORKING', connected: true, ready: true, phoneId: PHONE, displayPhone: `+${PHONE}` }); }); };
    const checking = f.service.check(null);
    await started;
    await f.service.receiveEvent(null, CID, { event: 'session.status', session: f.row.settings.sessionName, payload: { status: 'FAILED' } });
    resolveHealth();
    assert.equal((await checking).sessionStatus, 'failed');
    assert.equal(f.row.last_checked_at, null);
});

test('disconnect disables and cancels before logout/stop; its own STOPPED callback cannot prevent confirmed cleanup', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    const session = f.row.settings.sessionName;
    f.provider.logout = async name => {
        f.calls.push(['logout', name]);
        assert.equal(f.row.enabled, false); assert.equal(f.row.settings.linkedDisconnectPending, true);
        assert.ok(f.cancelled > 0);
        assert.equal(await f.service.receiveEvent(null, CID, { event: 'session.status', session: name, payload: { status: 'STOPPED' } }), false);
    };
    const result = await f.service.disconnect(null);
    assert.equal(result.sessionStatus, 'disconnected');
    assert.equal(f.row.secret_ciphertext, null);
    assert.equal(f.row.phone_number_id, null);
    assert.deepEqual(f.calls.slice(-2), [['logout', session], ['stopSession', session]]);
    const next = await f.service.start(null, ACK);
    assert.notEqual(next.connectionGeneration, result.connectionGeneration);
    assert.notEqual(f.row.settings.sessionName, session);
});

test('uncertain disconnect retains its exact marker/session and blocks a new start', async () => {
    const f = fixture(); await f.service.start(null, ACK);
    const marker = f.row.secret_ciphertext, generation = f.row.settings.connectionGeneration;
    f.provider.logout = async name => { f.calls.push(['logout', name]); throw Object.assign(new Error('synthetic timeout'), { uncertain: true }); };
    const result = await f.service.disconnect(null);
    assert.equal(result.lastError, 'DISCONNECT_UNKNOWN');
    assert.equal(f.row.secret_ciphertext, marker);
    assert.equal(f.row.settings.linkedDisconnectPending, true);
    await f.service.start(null, ACK);
    assert.equal(f.row.settings.connectionGeneration, generation);
    assert.equal(f.calls.filter(call => call[0] === 'createSession').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'stopSession').length, 1);
});

test('receiveEvent accepts an existing transaction/locked row without opening a nested transaction', async () => {
    const f = fixture(); await f.service.start(null, ACK); await f.service.check(null);
    assert.equal(await f.service.receiveEvent(null, CID, { event: 'session.status', session: f.row.settings.sessionName,
        payload: { status: 'WORKING', data: { messageCapping: { cappingStatus: 'FIRST_WARNING' } } } }, f.db, f.row), true);
    assert.equal(f.row.settings.linkedError, 'PROVIDER_RESTRICTED');
});

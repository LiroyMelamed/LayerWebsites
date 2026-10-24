'use strict';
const crypto = require('node:crypto');
const secrets = require('./secrets');
const { fail } = require('./validation');
const { isLinkedDevice, linkedLiveEnabled, normalizedPhone } = require('./linkedDevicePolicy');
const { pauseSafety, normalizeFailure } = require('./whatsappSafety');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SESSION = /^off_[a-f0-9]{32}_[a-f0-9]{16}$/;
const PUBLIC_STATUSES = new Set(['disconnected', 'starting', 'qr', 'connected', 'failed']);
const PUBLIC_ERRORS = new Set(['CONNECTION_START_UNKNOWN', 'CONNECTION_FAILED', 'PROVIDER_RESTRICTED',
    'PROVIDER_INCOMPATIBLE', 'PHONE_CONFLICT', 'RECONNECT_REQUIRED', 'DISCONNECT_UNKNOWN']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function createLinkedDeviceService({ pool, provider, env = process.env, tx, connection, ensure, token, binding, cancelPending }) {
    const enabled = () => env.WHATSAPP_WAHA_ENABLED === 'true' && env.WHATSAPP_DEMO_ONLY !== 'true';
    const officeAllowed = tenantId => tenantId == null
        ? !env.WHATSAPP_WAHA_OFFICE_ID || env.WHATSAPP_WAHA_OFFICE_ID === 'dedicated'
        : env.WHATSAPP_WAHA_OFFICE_ID === tenantId;
    function configured(c) {
        try {
            secrets.key(env);
            return provider.configurationInfo().configured === true && (!c || officeAllowed(c.law_firm_tenant_id));
        } catch { return false; }
    }
    function identity(c) {
        if (!isLinkedDevice(c) || !UUID.test(c.id || '') || !object(c.settings) ||
            !SESSION.test(c.settings.sessionName || '') || !UUID.test(c.settings.connectionGeneration || '') ||
            !c.settings.sessionName.startsWith(`off_${c.id.replace(/-/g, '')}_`) || !c.secret_ciphertext) return null;
        try {
            const marker = JSON.parse(secrets.open(c.secret_ciphertext, binding(c), env));
            if (!object(marker) || marker.gateway !== 'waha' || marker.sessionName !== c.settings.sessionName ||
                marker.generation !== c.settings.connectionGeneration || typeof marker.token !== 'string' ||
                !/^[A-Za-z0-9_-]{43}$/.test(marker.token) || token && token(c) !== marker.token) return null;
            return { sessionName: marker.sessionName, generation: marker.generation };
        } catch { return null; }
    }
    function snapshot(c) {
        const linked = isLinkedDevice(c), active = identity(c);
        let sessionStatus = linked && PUBLIC_STATUSES.has(c.settings.linkedStatus) ? c.settings.linkedStatus : 'disconnected';
        let lastError = linked && PUBLIC_ERRORS.has(c.settings.linkedError) ? c.settings.linkedError : null;
        const displayPhone = active ? normalizedPhone(c.display_phone) : null;
        if (linked && c.secret_ciphertext && !active) { sessionStatus = 'failed'; lastError = 'RECONNECT_REQUIRED'; }
        if (active && c.settings.linkedDisconnectPending) { sessionStatus = 'failed'; lastError = 'DISCONNECT_UNKNOWN'; }
        else if (active && c.settings.linkedStartUncertain) { sessionStatus = 'failed'; lastError = 'CONNECTION_START_UNKNOWN'; }
        if (sessionStatus === 'connected' && (!active || !displayPhone || c.phone_number_id !== displayPhone.slice(1) ||
            c.status !== 'ready' || !c.last_checked_at || !Number.isFinite(new Date(c.last_checked_at).getTime()))) {
            sessionStatus = 'failed'; lastError = 'RECONNECT_REQUIRED';
        }
        if (active && sessionStatus === 'disconnected') { sessionStatus = 'failed'; lastError ||= 'RECONNECT_REQUIRED'; }
        return { configured: configured(c), enabled: enabled(), provider: 'waha', sessionStatus,
            displayPhone, liveEnabled: configured(c) && linkedLiveEnabled(env),
            connectionGeneration: linked && UUID.test(c.settings.connectionGeneration || '') ? c.settings.connectionGeneration : null,
            lastError };
    }
    function requireSetup(tenantId) {
        if (!officeAllowed(tenantId)) fail('WAHA_OFFICE_NOT_ALLOWED', 'חיבור המכשיר אינו מוגדר למשרד הזה', 403);
        if (!enabled() || !configured()) fail('WAHA_SETUP_REQUIRED', 'מנהל הפלטפורמה צריך להשלים את הגדרת חיבור המכשיר', 503);
    }
    const sameSession = (c, expected) => Boolean(c && expected && isLinkedDevice(c) && c.id === expected.id &&
        c.secret_ciphertext === expected.secret_ciphertext && c.settings.sessionName === expected.settings.sessionName &&
        c.settings.connectionGeneration === expected.settings.connectionGeneration);
    const current = (c, expected) => sameSession(c, expected) && c.settings.linkedRevision === expected.settings.linkedRevision;
    async function now(db) {
        return (await db.query('SELECT clock_timestamp() AS safety_now')).rows[0].safety_now;
    }
    async function save(db, c, patch) {
        const next = { ...c, ...patch };
        await db.query(`UPDATE office_integrations SET enabled=$2,status=$3,settings=$4,secret_ciphertext=$5,
            phone_number_id=$6,waba_id=$7,display_phone=$8,token_expires_at=NULL,last_checked_at=$9,safety_state=$10,
            updated_at=now() WHERE id=$1`, [next.id, next.enabled, next.status, next.settings, next.secret_ciphertext,
            next.phone_number_id, next.waba_id, next.display_phone, next.last_checked_at, next.safety_state || {}]);
        return next;
    }
    async function failed(db, c, error, reason, extra = {}) {
        const safetyReason = reason || normalizeFailure(error).reason;
        return save(db, c, { enabled: false, status: 'reauthorization_required', last_checked_at: null,
            safety_state: pauseSafety(c.safety_state, safetyReason, await now(db)),
            settings: { ...c.settings, linkedStatus: 'failed', linkedError: 'CONNECTION_FAILED',
                linkedRevision: crypto.randomUUID(), ...extra } });
    }
    async function lockedResult(tenantId, expected, fn, { adverse = false } = {}) {
        return tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!sameSession(c, expected)) return snapshot(c);
            const mustBlock = typeof adverse === 'function' ? adverse(c) : adverse;
            // An adverse observation of this exact sealed session must not be
            // lost when another overlapping check merely advanced readiness.
            // Healthy results retain strict revision fencing, and neither kind
            // can replace a disconnect or a different connection generation.
            if (mustBlock ? c.settings.linkedDisconnectPending : !current(c, expected)) return snapshot(c);
            return snapshot(await fn(db, c));
        });
    }
    async function start(tenantId, input = {}) {
        if (input.acknowledgeUnofficial !== true || input.acknowledgePermissions !== true)
            fail('WAHA_ACKNOWLEDGEMENT_REQUIRED', 'יש לאשר את אופי החיבור ואת ההרשאות לפני יצירת קוד סריקה', 409);
        requireSetup(tenantId);
        const prepared = await tx(async db => {
            const c = await ensure(db, tenantId, 'whatsapp');
            if (c.dispatch_claim) fail('SAFETY_PENDING_RESULT', 'יש לברר תחילה את הפעולה שעדיין בטיפול', 409);
            const replaceableDemo = c.status === 'disconnected' && c.settings?.mode === 'demo' &&
                (c.settings.gateway == null || c.settings.gateway === 'meta');
            if (!isLinkedDevice(c) && (c.secret_ciphertext || c.phone_number_id || c.enabled && !replaceableDemo))
                fail('DISCONNECT_FIRST', 'יש לנתק את החיבור הקודם לפני חיבור מכשיר', 409);
            // An existing marker is a durable claim on exactly one session. A
            // duplicate click or crash cannot cause another session-create POST.
            if (isLinkedDevice(c) && c.secret_ciphertext) return { existing: snapshot(c) };
            if (isLinkedDevice(c) && (c.settings.linkedDisconnectPending || c.settings.linkedStartUncertain))
                fail('WAHA_RECONCILIATION_REQUIRED', 'יש להשלים את בירור החיבור הקודם לפני התחלה מחדש', 409);
            const sessionName = `off_${c.id.replace(/-/g, '')}_${crypto.randomBytes(8).toString('hex')}`;
            const generation = crypto.randomUUID();
            const settings = { ...c.settings, gateway: 'waha', connectionType: 'linked_device', sessionName,
                connectionGeneration: generation, linkedStatus: 'starting', linkedError: null,
                linkedRevision: crypto.randomUUID(), linkedStartUncertain: true, linkedDisconnectPending: false };
            const marker = secrets.seal(JSON.stringify({ token: crypto.randomBytes(32).toString('base64url'),
                gateway: 'waha', sessionName, generation }), binding(c), env);
            const result = await save(db, c, { enabled: false, status: 'connecting', settings, secret_ciphertext: marker,
                phone_number_id: null, waba_id: null, display_phone: null, last_checked_at: null });
            await cancelPending(db, c.id);
            await db.query('DELETE FROM integration_signup_sessions WHERE law_firm_tenant_id IS NOT DISTINCT FROM $1', [tenantId]);
            return { connection: result };
        });
        if (prepared.existing) return prepared.existing;
        const expected = prepared.connection;
        // The marker is already committed. Hold the conflicting connection lock
        // from the final ownership check through the external POST and its saved
        // outcome, so disconnect cannot clear ownership ahead of a late create.
        return lockedResult(tenantId, expected, async (db, c) => {
            let result;
            try { result = await provider.createSession(c.settings.sessionName); }
            catch (error) {
                return failed(db, c, error, undefined, {
                    linkedError: error?.uncertain === true ? 'CONNECTION_START_UNKNOWN' : 'CONNECTION_FAILED',
                    linkedStartUncertain: error?.uncertain === true,
                });
            }
            const state = result?.status === 'SCAN_QR_CODE' ? 'qr' : ['STARTING', 'WORKING'].includes(result?.status) ? 'starting' : 'failed';
            if (result?.sessionName !== c.settings.sessionName || state === 'failed')
                return failed(db, c, {}, 'PROVIDER_REJECTED', { linkedStartUncertain: false, linkedError: 'RECONNECT_REQUIRED' });
            return save(db, c, { settings: { ...c.settings, linkedStatus: state, linkedError: null,
                linkedStartUncertain: false, linkedRevision: crypto.randomUUID() } });
        });
    }
    async function check(tenantId) {
        requireSetup(tenantId);
        const checkedAt = await now(pool);
        const expected = await connection(pool, tenantId, 'whatsapp');
        const owner = identity(expected);
        if (!owner) fail('WHATSAPP_DISCONNECTED', 'יש לחבר מכשיר WhatsApp תחילה', 409);
        if (expected.settings.linkedDisconnectPending) return snapshot(expected);
        let health, sessions;
        try {
            health = await provider.health(owner.sessionName);
            if (health?.sessionName !== owner.sessionName) throw Object.assign(new Error('WAHA_IDENTITY_UNVERIFIED'), { safetyReason: 'PROVIDER_REJECTED' });
            if (health.connected && health.phoneId && typeof provider.listSessions === 'function') sessions = await provider.listSessions();
        } catch (error) {
            return lockedResult(tenantId, expected, (db, c) => failed(db, c, error, undefined, {
                linkedError: c.settings.linkedStartUncertain ? 'CONNECTION_START_UNKNOWN' : 'CONNECTION_FAILED',
            }), { adverse: true });
        }
        try {
            const adverse = c => {
                const waiting = ['STARTING', 'SCAN_QR_CODE'].includes(health.status);
                if (health.status !== 'WORKING') return !waiting || Boolean(c.phone_number_id);
                const phone = normalizedPhone(health.displayPhone);
                return !health.connected || !phone || health.phoneId !== phone.slice(1) ||
                    Boolean(c.phone_number_id && c.phone_number_id !== health.phoneId) ||
                    Boolean(sessions && (!Array.isArray(sessions) || sessions.some(session =>
                        session?.sessionName !== owner.sessionName && session?.phoneId === health.phoneId))) ||
                    health.incompatibleVersion === true || health.restricted === true || health.ready !== true;
            };
            return await lockedResult(tenantId, expected, async (db, c) => {
                if (health.status !== 'WORKING') {
                    const waiting = health.status === 'STARTING' || health.status === 'SCAN_QR_CODE';
                    if (waiting && !c.phone_number_id) return save(db, c, { enabled: false, status: 'connecting', last_checked_at: null,
                        settings: { ...c.settings, linkedStatus: health.status === 'SCAN_QR_CODE' ? 'qr' : 'starting',
                            linkedError: null, linkedStartUncertain: false, linkedRevision: crypto.randomUUID() } });
                    return failed(db, c, {}, 'PROVIDER_DISCONNECTED', { linkedStartUncertain: false, linkedError: 'RECONNECT_REQUIRED' });
                }
                const phone = normalizedPhone(health.displayPhone);
                if (!health.connected || !phone || health.phoneId !== phone.slice(1))
                    return failed(db, c, {}, 'PROVIDER_REJECTED', { linkedError: 'RECONNECT_REQUIRED' });
                if (c.phone_number_id && c.phone_number_id !== health.phoneId)
                    return failed(db, c, {}, 'PROVIDER_REJECTED', { linkedError: 'PHONE_CONFLICT' });
                if (sessions && (!Array.isArray(sessions) || sessions.some(session => session?.sessionName !== owner.sessionName && session?.phoneId === health.phoneId)))
                    return failed(db, c, {}, 'PROVIDER_REJECTED', { linkedError: 'PHONE_CONFLICT' });
                const duplicate = await db.query(`SELECT id FROM office_integrations WHERE provider='whatsapp' AND id<>$1
                    AND (phone_number_id=$2 OR regexp_replace(COALESCE(display_phone,''),'[^0-9]','','g')=$2)
                    AND secret_ciphertext IS NOT NULL LIMIT 1`, [c.id, health.phoneId]);
                if (duplicate.rows.length) return failed(db, c, {}, 'PROVIDER_REJECTED', { linkedError: 'PHONE_CONFLICT' });
                if (health.incompatibleVersion || health.restricted || health.ready !== true) return failed(db, c, {},
                    health.restricted && !health.incompatibleVersion ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REJECTED', {
                        linkedStartUncertain: false, linkedError: health.incompatibleVersion ? 'PROVIDER_INCOMPATIBLE' : 'PROVIDER_RESTRICTED',
                    });
                // Readiness is a fresh observation. Existing circuit state and
                // allowances are retained; neither checking nor pairing resumes it.
                return save(db, c, { status: 'ready', phone_number_id: health.phoneId, waba_id: null, display_phone: phone,
                    last_checked_at: checkedAt, settings: { ...c.settings, linkedStatus: 'connected', linkedError: null,
                        linkedStartUncertain: false, linkedRevision: crypto.randomUUID() } });
            }, { adverse });
        } catch (error) {
            if (error.code !== '23505') throw error;
            return lockedResult(tenantId, expected, (db, c) => failed(db, c, {}, 'PROVIDER_REJECTED', { linkedError: 'PHONE_CONFLICT' }), { adverse: true });
        }
    }
    async function qr(tenantId) {
        const observed = await check(tenantId);
        if (observed.sessionStatus !== 'qr') return { ...observed, status: observed.sessionStatus };
        const expected = await connection(pool, tenantId, 'whatsapp');
        const owner = identity(expected);
        if (!owner || expected.settings.linkedStatus !== 'qr' || expected.settings.linkedDisconnectPending) return snapshot(expected);
        let pixels;
        try { pixels = await provider.qr(owner.sessionName); }
        catch { return { ...observed, status: observed.sessionStatus }; } // Expired QR is observed again; never persisted or recreated.
        return tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!current(c, expected) || c.settings.linkedStatus !== 'qr') return snapshot(c);
            if (pixels?.mimetype !== 'image/png' || typeof pixels.data !== 'string' || pixels.data.length > 1398104 ||
                !/^[A-Za-z0-9+/]+={0,2}$/.test(pixels.data)) fail('WAHA_INVALID_QR', 'לא ניתן להציג את קוד הסריקה כעת', 502);
            return { ...snapshot(c), status: 'qr', qrDataUrl: `data:image/png;base64,${pixels.data}` };
        });
    }
    async function disconnect(tenantId) {
        const prepared = await tx(async db => {
            const c = await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (!isLinkedDevice(c)) fail('WHATSAPP_DISCONNECTED', 'אין מכשיר WhatsApp מחובר', 409);
            const owner = identity(c);
            if (!owner) {
                if (!c.secret_ciphertext && !c.settings.linkedDisconnectPending && !c.settings.linkedStartUncertain) return { existing: snapshot(c) };
                return { existing: snapshot(await failed(db, c, {}, 'PROVIDER_REJECTED', { linkedError: 'DISCONNECT_UNKNOWN', linkedDisconnectPending: true })) };
            }
            const next = await failed(db, c, {}, 'PROVIDER_DISCONNECTED', { linkedDisconnectPending: true, linkedError: 'DISCONNECT_UNKNOWN' });
            await cancelPending(db, c.id);
            return { connection: next, owner };
        });
        if (prepared.existing) return prepared.existing;
        let confirmed = true, logoutConfirmed = false;
        // Each explicit disconnect makes at most one logout and one stop call.
        // Both are attempted; an unconfirmed logout must never permit restart.
        for (const method of ['logout', 'stopSession']) {
            try {
                await provider[method](prepared.owner.sessionName);
                if (method === 'logout') logoutConfirmed = true;
            }
            catch (error) { if (error.httpStatus !== 404 || error.uncertain === true) confirmed = false; }
        }
        // A timed-out create can still be executing remotely after its local
        // lock is released. A pair of 404s does not prove that it cannot appear
        // later; keep its ownership until an actual logout is confirmed.
        if (prepared.connection.settings.linkedStartUncertain && !logoutConfirmed) confirmed = false;
        return lockedResult(tenantId, prepared.connection, (db, c) => confirmed
            ? save(db, c, { enabled: false, status: 'disconnected', secret_ciphertext: null, phone_number_id: null,
                waba_id: null, display_phone: null, last_checked_at: null, settings: { ...c.settings,
                    linkedStatus: 'disconnected', linkedError: null, linkedStartUncertain: false,
                    linkedDisconnectPending: false, linkedRevision: crypto.randomUUID() } })
            : failed(db, c, {}, 'RESULT_UNKNOWN', { linkedDisconnectPending: true, linkedError: 'DISCONNECT_UNKNOWN' }));
    }
    async function receiveEvent(tenantId, connectionId, body, suppliedDb, lockedConnection) {
        if (body?.event !== 'session.status' || typeof body.session !== 'string' || !object(body.payload) ||
            body.payload.name !== undefined && body.payload.name !== body.session || typeof body.payload.status !== 'string') return false;
        const handle = async db => {
            const c = lockedConnection || await connection(db, tenantId, 'whatsapp', 'FOR UPDATE');
            if (c?.id !== connectionId || !identity(c) || c.settings.sessionName !== body.session) return false;
            // Logout emits STOPPED/QR updates too. The durable disconnect state
            // already blocks delivery, and those events must not invalidate its
            // own successful cleanup finalizer.
            if (c.settings.linkedDisconnectPending) return false;
            const status = body.payload.status, data = body.payload.data;
            const restricted = body.payload.restricted === true || data?.reachoutTimelock?.isActive === true ||
                object(data?.messageCapping) && data.messageCapping.cappingStatus !== 'NONE';
            const waiting = ['STARTING', 'SCAN_QR_CODE'].includes(status);
            if (status === 'WORKING' && !restricted || waiting && !c.phone_number_id && ['starting', 'qr'].includes(c.settings.linkedStatus)) return false;
            await failed(db, c, {}, restricted ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_DISCONNECTED', {
                linkedError: restricted ? 'PROVIDER_RESTRICTED' : 'RECONNECT_REQUIRED',
            });
            await cancelPending(db, c.id);
            return true;
        };
        return suppliedDb ? handle(suppliedDb) : tx(handle);
    }
    return { snapshot, start, qr, check, disconnect, receiveEvent };
}

module.exports = { createLinkedDeviceService };

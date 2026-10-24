'use strict';
const { linkedDeliveryAllowed } = require('./linkedDevicePolicy');

// Contract checked against WAHA's official OpenAPI (info.version 2026.8.2)
// and https://waha.devlike.pro/docs/how-to/{sessions,groups,send-messages,security}/.
// Capabilities are probed: the published version alone does not establish that
// an installed engine supports the fresh timelock and capping endpoints.
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_QR_JSON_BYTES = Math.ceil(MAX_RESPONSE_BYTES / 3) * 4 + 128;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SESSION_STATUSES = new Set(['STOPPED', 'STARTING', 'SCAN_QR_CODE', 'WORKING', 'FAILED',
    'PASSKEY_REQUIRED', 'PASSKEY_CONFIRMATION_REQUIRED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function providerError(code, { status, uncertain = false, safetyReason = 'PROVIDER_REJECTED' } = {}) {
    const error = new Error(code);
    error.code = code;
    error.uncertain = uncertain;
    error.safetyReason = safetyReason;
    if (Number.isInteger(status)) {
        error.httpStatus = status;
        error.providerStatus = status;
    }
    return error;
}
function sessionId(value) {
    // Names are generated and persisted by the application, never from the UI.
    // Tenant authorization still belongs to the service loading that record.
    if (typeof value !== 'string' || !/^off_[a-f0-9]{32}_[a-f0-9]{16}$/.test(value))
        throw providerError('WAHA_INVALID_SESSION');
    return value;
}
function apiBase(value) {
    if (typeof value !== 'string' || value !== value.trim() || /[\\?#\u0000-\u001f\u007f]/.test(value)) return null;
    try {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash || !['/', '/api', '/api/'].includes(url.pathname)) return null;
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
        return `${url.origin}/api`;
    } catch { return null; }
}
function webhookConfig(env) {
    const value = env.WHATSAPP_WAHA_WEBHOOK_URL, secret = env.WHATSAPP_WAHA_WEBHOOK_SECRET;
    if (typeof value !== 'string' || value !== value.trim() || /[\\?#\u0000-\u001f\u007f]/.test(value) ||
        typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 || secret.length > 4096 || /[\r\n]/.test(secret)) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
            url.pathname !== '/api/webhooks/whatsapp-linked') return null;
        return { url: url.href, events: ['session.status', 'message'], hmac: { key: secret } };
    } catch { return null; }
}
function phoneFromMe(me) {
    if (!object(me) || typeof me.id !== 'string' || !/^[1-9]\d{7,14}@c\.us$/.test(me.id)) return null;
    return me.id.slice(0, -5);
}
function controlledLink(value) {
    if (typeof value !== 'string' || value.length > 512 || /[\\?#\u0000-\u0020\u007f]/.test(value)) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'chat.whatsapp.com' &&
            !url.username && !url.password && !url.port && !url.search && !url.hash &&
            /^\/[A-Za-z0-9_-]{10,128}$/.test(url.pathname) ? url.href : null;
    } catch { return null; }
}
function groupId(result) {
    // WAHA deliberately returns the engine's result. NOWEB uses id, WEBJS
    // uses gid._serialized, and GOWS returns its GroupInfo.JID.
    if (!object(result)) return null;
    const candidates = [result.id, result.gid?._serialized, result.JID].filter(value => value != null);
    if (!candidates.length || candidates.some(value => typeof value !== 'string' || !/^\d{5,30}(?:-\d{5,20})?@g\.us$/.test(value)) ||
        new Set(candidates).size !== 1) return null;
    return candidates[0];
}
function timestamp(value) {
    return value == null ? null : Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000 ? value : undefined;
}
function validPng(bytes) {
    if (bytes.length < 57 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
    let offset = 8, imageData = false, header = false;
    while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        if (size > bytes.length - offset - 12) return false;
        if (!header) {
            if (type !== 'IHDR' || size !== 13) return false;
            const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
            if (!width || !height || width > 2048 || height > 2048) return false;
            header = true;
        } else if (type === 'IHDR') return false;
        if (type === 'IDAT' && size > 0) imageData = true;
        offset += size + 12;
        if (type === 'IEND') return size === 0 && offset === bytes.length && imageData;
    }
    return false;
}

function createWahaProvider({ env = process.env, fetchImpl = global.fetch } = {}) {
    function configurationInfo() {
        if (!apiBase(env.WHATSAPP_WAHA_BASE_URL)) return { configured: false, reason: 'WAHA_BASE_URL_REQUIRED' };
        if (typeof env.WHATSAPP_WAHA_API_KEY !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(env.WHATSAPP_WAHA_API_KEY))
            return { configured: false, reason: 'WAHA_API_KEY_REQUIRED' };
        if (!webhookConfig(env)) return { configured: false, reason: 'WAHA_WEBHOOK_SETUP_REQUIRED' };
        return { configured: true };
    }
    function assertConfigured() {
        const configuration = configurationInfo();
        if (!configuration.configured) throw providerError(configuration.reason);
        if (env.WHATSAPP_WAHA_ENABLED !== 'true') throw providerError('WHATSAPP_WAHA_DISABLED');
        if (env.WHATSAPP_DEMO_ONLY === 'true') throw providerError('WHATSAPP_DEMO_ONLY');
        return apiBase(env.WHATSAPP_WAHA_BASE_URL);
    }
    function assertDelivery(connection, job) {
        if (!linkedDeliveryAllowed(env, job, connection))
            throw providerError('WHATSAPP_DELIVERY_DISABLED');
    }
    async function readBytes(response, limit) {
        const length = response.headers.get('content-length');
        if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw providerError('WAHA_RESPONSE_TOO_LARGE');
        if (!response.body) return Buffer.alloc(0);
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > limit) throw providerError('WAHA_RESPONSE_TOO_LARGE');
                chunks.push(Buffer.from(value));
            }
        } catch (error) {
            await reader.cancel().catch(() => {});
            throw error;
        } finally { reader.releaseLock(); }
        return Buffer.concat(chunks, size);
    }
    async function request(path, { method = 'GET', body, qr = false } = {}) {
        const base = assertConfigured();
        let response;
        try {
            response = await fetchImpl(`${base}/${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
                headers: { 'X-Api-Key': env.WHATSAPP_WAHA_API_KEY, Accept: 'application/json',
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        } catch {
            throw providerError('WAHA_RESULT_UNKNOWN', { uncertain: method !== 'GET',
                safetyReason: method === 'GET' ? 'PROVIDER_DISCONNECTED' : 'RESULT_UNKNOWN' });
        }
        if (response.redirected || response.status >= 300 && response.status < 400) {
            await response.body?.cancel().catch(() => {});
            throw providerError('WAHA_REDIRECT_REJECTED', { status: response.status, uncertain: method !== 'GET',
                safetyReason: method === 'GET' ? 'PROVIDER_REJECTED' : 'RESULT_UNKNOWN' });
        }
        if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            const uncertain = method !== 'GET' && response.status >= 500;
            throw providerError('WAHA_REQUEST_REJECTED', { status: response.status, uncertain,
                safetyReason: uncertain ? 'RESULT_UNKNOWN' : response.status === 429 ? 'PROVIDER_RATE_LIMIT' :
                    [401, 403].includes(response.status) ? 'PROVIDER_AUTH' : 'PROVIDER_REJECTED' });
        }
        try {
            const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
            const bytes = await readBytes(response, qr ? MAX_QR_JSON_BYTES : MAX_RESPONSE_BYTES);
            if (qr && type === 'image/png') return { mimetype: type, data: bytes.toString('base64') };
            if (response.status === 204 && bytes.length === 0) return null;
            if (type !== 'application/json') throw providerError('WAHA_INVALID_RESPONSE');
            return JSON.parse(bytes.toString('utf8'));
        } catch {
            throw providerError('WAHA_INVALID_RESPONSE', { uncertain: method !== 'GET',
                safetyReason: method === 'GET' ? 'PROVIDER_REJECTED' : 'RESULT_UNKNOWN' });
        }
    }
    function normalizeSession(data, expected) {
        if (!object(data) || data.name !== expected || !SESSION_STATUSES.has(data.status))
            throw providerError('WAHA_INVALID_SESSION_RESPONSE');
        const phoneId = phoneFromMe(data.me);
        return { sessionName: expected, status: data.status, connected: data.status === 'WORKING' && Boolean(phoneId),
            phoneId, displayPhone: phoneId ? `+${phoneId}` : null, ready: false };
    }
    async function createSession(name, options = {}) {
        name = sessionId(name);
        const webhook = webhookConfig(env);
        // This optional service argument is not a browser configuration surface.
        // The only accepted target/key is the trusted server configuration.
        if (!object(options) || options.webhookUrl !== undefined && options.webhookUrl !== webhook?.url ||
            options.webhookSecret !== undefined && options.webhookSecret !== webhook?.hmac.key)
            throw providerError('WAHA_INVALID_WEBHOOK_OVERRIDE');
        const data = await request('sessions', { method: 'POST', body: { name, start: true, config: { webhooks: [webhook],
            gows: { storage: { messages: false, groups: false, chats: false, labels: false, contacts: false, messageSecrets: false } },
            noweb: { store: { enabled: false, fullSync: false } } } } });
        try { return normalizeSession(data, name); }
        catch { throw providerError('WAHA_INVALID_SESSION_RESPONSE', { uncertain: true, safetyReason: 'RESULT_UNKNOWN' }); }
    }
    async function sessionStatus(name) {
        name = sessionId(name);
        return normalizeSession(await request(`sessions/${name}`), name);
    }
    async function listSessions() {
        const sessions = await request('sessions?all=true');
        if (!Array.isArray(sessions) || sessions.length > 1000 || sessions.some(session => !object(session) ||
            typeof session.name !== 'string' || !session.name || session.name.length > 128 ||
            /[\u0000-\u001f\u007f]/.test(session.name) || !SESSION_STATUSES.has(session.status)))
            throw providerError('WAHA_INVALID_SESSION_LIST');
        // Include foreign/administrator-created session names in this internal
        // inventory so the same phone cannot be silently shared with another one.
        return sessions.map(session => ({ sessionName: session.name, status: session.status, phoneId: phoneFromMe(session.me) }));
    }
    async function qr(name) {
        name = sessionId(name);
        const data = await request(`${name}/auth/qr?format=image`, { qr: true });
        if (!object(data) || data.mimetype !== 'image/png' || typeof data.data !== 'string' ||
            !data.data.length || data.data.length > Math.ceil(MAX_RESPONSE_BYTES / 3) * 4 || data.data.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(data.data))
            throw providerError('WAHA_INVALID_QR');
        const bytes = Buffer.from(data.data, 'base64');
        if (bytes.length > MAX_RESPONSE_BYTES || !validPng(bytes) || bytes.toString('base64') !== data.data)
            throw providerError('WAHA_INVALID_QR');
        return { mimetype: 'image/png', data: data.data };
    }
    async function logout(name) {
        await request(`sessions/${sessionId(name)}/logout`, { method: 'POST', body: {} });
        return { success: true };
    }
    async function stopSession(name) {
        await request(`sessions/${sessionId(name)}/stop`, { method: 'POST', body: {} });
        return { success: true };
    }
    async function health(name) {
        name = sessionId(name);
        const session = await sessionStatus(name);
        if (session.status !== 'WORKING') return { ...session, restricted: false };
        const me = await request(`sessions/${name}/me`);
        const phoneId = phoneFromMe(me);
        if (!phoneId || session.phoneId && session.phoneId !== phoneId) throw providerError('WAHA_IDENTITY_UNVERIFIED');
        const connected = { ...session, connected: true, phoneId, displayPhone: `+${phoneId}` };
        let timelock, capping;
        try {
            timelock = await request(`sessions/${name}/timelock`);
            capping = await request(`sessions/${name}/capping`);
        } catch (error) {
            if (![404, 405, 501].includes(error.httpStatus)) throw error;
            return { ...connected, ready: false, restricted: true, incompatibleVersion: true, restrictionReason: 'WAHA_RESTRICTION_CHECK_UNSUPPORTED' };
        }
        if (!object(timelock) || typeof timelock.isActive !== 'boolean' || timestamp(timelock.timeEnforcementEnds) === undefined ||
            !object(capping) || typeof capping.cappingStatus !== 'string' || !capping.cappingStatus ||
            timestamp(capping.cycleEnd) === undefined)
            return { ...connected, ready: false, restricted: true, incompatibleVersion: true, restrictionReason: 'WAHA_RESTRICTION_CHECK_INVALID' };
        const restricted = timelock.isActive || capping.cappingStatus !== 'NONE';
        return { ...connected, ready: !restricted, restricted, incompatibleVersion: false,
            restrictionReason: timelock.isActive ? 'WAHA_TIMELOCK' : restricted ? 'WAHA_MESSAGE_CAPPING' : null,
            timeEnforcementEnds: timestamp(timelock.timeEnforcementEnds), cycleEnd: timestamp(capping.cycleEnd) };
    }
    function connectionSession(connection, job) {
        if (!object(connection?.settings) || connection.settings.gateway !== 'waha' || connection.settings.connectionType !== 'linked_device')
            throw providerError('WAHA_INVALID_CONNECTION');
        const name = sessionId(connection.settings.sessionName);
        if (typeof connection.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(connection.id) ||
            !name.startsWith(`off_${connection.id.replace(/-/g, '')}_`) || job?.session_name !== name ||
            job.gateway !== 'waha' || job.connection_id != null && job.connection_id !== connection.id)
            throw providerError('WAHA_INVALID_SESSION');
        return name;
    }
    async function createGroup(connection, token, job) {
        const name = connectionSession(connection, job);
        assertDelivery(connection, job);
        if (typeof job?.subject !== 'string' || !job.subject.trim() || job.subject.length > 100 || /[\u0000-\u001f\u007f]/.test(job.subject))
            throw providerError('WAHA_INVALID_GROUP_SUBJECT');
        const result = await request(`${name}/groups`, { method: 'POST', body: { name: job.subject, participants: [] } });
        // A successful POST may already have created the group. No parsing or
        // invite-code failure after this point may authorize a second POST.
        let id;
        try {
            id = groupId(result);
            if (!id) throw providerError('WAHA_INVALID_GROUP_RESPONSE');
            const code = await request(`${name}/groups/${encodeURIComponent(id)}/invite-code`);
            if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{10,128}$/.test(code)) throw providerError('WAHA_INVALID_INVITE_CODE');
            const link = controlledLink(`https://chat.whatsapp.com/${code}`);
            if (!link) throw providerError('WAHA_INVALID_INVITE_CODE');
            return { groupId: id, inviteLink: link };
        } catch {
            const error = providerError('WAHA_GROUP_RESULT_UNKNOWN', { uncertain: true, safetyReason: 'RESULT_UNKNOWN' });
            if (id) error.partialGroupId = id;
            throw error;
        }
    }
    async function invite(connection, token, job, phone) {
        const name = connectionSession(connection, job);
        assertDelivery(connection, job);
        const link = controlledLink(job?.invite_link);
        if (!link || typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone) ||
            !Number.isSafeInteger(job?.case_id) || job.case_id < 1) throw providerError('WAHA_INVALID_INVITATION');
        const language = job.recipients?.find(recipient => recipient?.phone === phone)?.language;
        const text = language === 'ar'
            ? `أنت مدعو للانضمام إلى مجموعة WhatsApp للملف ${job.case_id}.\n${link}\nلإيقاف الدعوات الإضافية، أرسل STOP وتواصل مع المكتب.`
            : language === 'en'
                ? `You are invited to join the WhatsApp group for case ${job.case_id}.\n${link}\nTo stop further invitations, reply STOP and contact the office.`
                : `הוזמנת להצטרף לקבוצת WhatsApp עבור תיק ${job.case_id}.\n${link}\nלהפסקת הזמנות נוספות, יש להשיב STOP ולפנות למשרד.`;
        const result = await request('sendText', { method: 'POST', body: { session: name, chatId: `${phone.slice(1)}@c.us`, text,
            linkPreview: false } });
        if (!object(result) || typeof result.id !== 'string' || !/^[A-Za-z0-9_:@.\-]{1,512}$/.test(result.id))
            throw providerError('WAHA_MESSAGE_RESULT_UNKNOWN', { uncertain: true, safetyReason: 'RESULT_UNKNOWN' });
        return { messages: [{ id: result.id }] }; // Acceptance only; not delivery or read confirmation.
    }
    return { configurationInfo, createSession, sessionStatus, listSessions, qr, logout, stopSession, health, createGroup, invite };
}

module.exports = { createWahaProvider };

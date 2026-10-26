'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWahaProvider } = require('../services/integrations/wahaProvider');

const SESSION = `off_${'a'.repeat(32)}_${'b'.repeat(16)}`;
const PHONE = '972501234567';
const GROUP = '120363123456789012@g.us';
const CODE = 'AbcdEFGHijkLMNOPqrSTUV';
const LINK = `https://chat.whatsapp.com/${CODE}`;
const KEY = 'synthetic-server-only-waha-api-key';
const WEBHOOK = 'https://office-api.example.invalid/api/webhooks/whatsapp-linked';
const WEBHOOK_KEY = 'synthetic-server-only-webhook-hmac-key';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2vL8AAAAASUVORK5CYII=';
const baseEnv = { WHATSAPP_WAHA_ENABLED: 'true', WHATSAPP_WAHA_DELIVERY_ENABLED: 'true',
    WHATSAPP_WAHA_BASE_URL: 'https://gateway.example.invalid', WHATSAPP_WAHA_API_KEY: KEY,
    WHATSAPP_WAHA_WEBHOOK_URL: WEBHOOK, WHATSAPP_WAHA_WEBHOOK_SECRET: WEBHOOK_KEY,
    WHATSAPP_LIVE_ENABLED: 'true', QA_OUTBOUND_MODE: 'live' };
const connection = () => ({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', phone_number_id: PHONE,
    display_phone: `+${PHONE}`, settings: { gateway: 'waha', connectionType: 'linked_device', sessionName: SESSION } });
const job = () => ({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', case_id: 42, subject: 'תיק 42 · cccccccc',
    invite_link: LINK, session_name: SESSION, gateway: 'waha', recipients: [{ phone: '+972509876543', status: 'pending' }] });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(options = {}) {
    const requests = [], env = { ...baseEnv, ...options.env };
    const provider = createWahaProvider({ env, fetchImpl: async (url, request) => {
        const parsed = new URL(url);
        const call = { url: parsed.href, path: parsed.pathname, search: parsed.search, method: request.method,
            headers: request.headers, redirect: request.redirect, signal: request.signal,
            body: request.body === undefined ? undefined : JSON.parse(request.body) };
        requests.push(call);
        const override = await options.respond?.(call, requests.length);
        if (override !== undefined) return override instanceof Response ? override : json(override);
        if (call.path === '/api/sessions' && call.method === 'POST') return json({ name: SESSION, status: 'STARTING', config: { secret: 'must-not-return' } }, 201);
        if (call.path === `/api/sessions/${SESSION}`) return json({ name: SESSION, status: 'WORKING', me: { id: `${PHONE}@c.us`, pushName: 'Private Name' } });
        if (call.path.endsWith('/me')) return json({ id: `${PHONE}@c.us`, pushName: 'Private Name' });
        if (call.path.endsWith('/timelock')) return json({ isActive: false, timeEnforcementEnds: null });
        if (call.path.endsWith('/capping')) return json({ cappingStatus: 'NONE', cycleEnd: null });
        if (call.path.endsWith('/auth/qr')) return json({ mimetype: 'image/png', data: PNG });
        if (call.path.endsWith('/groups') && call.method === 'POST') return json({ id: GROUP }, 201);
        if (call.path.endsWith('/invite-code')) return json(CODE);
        if (call.path === '/api/sendText') return json({ id: `true_${PHONE}@c.us_SYNTHETIC`, ack: 0, body: 'private-provider-echo' }, 201);
        if (call.path.endsWith('/logout') || call.path.endsWith('/stop')) return json({ name: SESSION, status: 'STOPPED', config: { apiKey: KEY } }, 201);
        throw new Error('UNEXPECTED_SYNTHETIC_ROUTE');
    } });
    return { provider, requests, env };
}
const errorCode = (code, extra = {}) => error => error.code === code && Object.entries(extra).every(([key, value]) => error[key] === value);

test('WAHA configuration uses only a trusted server origin and never exposes the key', async () => {
    for (const url of ['https://gateway.example.invalid', 'https://gateway.example.invalid/api', 'https://gateway.example.invalid/api/', 'http://127.0.0.1:3000', 'http://localhost:3000/api']) {
        const f = fixture({ env: { WHATSAPP_WAHA_BASE_URL: url } });
        assert.deepEqual(f.provider.configurationInfo(), { configured: true });
        await f.provider.sessionStatus(SESSION);
        assert.equal(f.requests[0].url, `${new URL(url).origin}/api/sessions/${SESSION}`);
        assert.equal(f.requests[0].headers['X-Api-Key'], KEY);
        assert.equal(f.requests[0].redirect, 'error');
        assert.ok(f.requests[0].signal instanceof AbortSignal);
    }
    for (const url of ['http://gateway.example.invalid', 'http://127.0.0.2', 'http://[::1]', 'https://u:p@gateway.example.invalid',
        'https://gateway.example.invalid?key=x', 'https://gateway.example.invalid?', 'https://gateway.example.invalid#',
        'https://gateway.example.invalid/#fragment', 'https://gateway.example.invalid/arbitrary',
        'https://gateway.example.invalid\\api', ' https://gateway.example.invalid']) {
        const f = fixture({ env: { WHATSAPP_WAHA_BASE_URL: url } });
        assert.equal(f.provider.configurationInfo().configured, false);
        await assert.rejects(f.provider.sessionStatus(SESSION), errorCode('WAHA_BASE_URL_REQUIRED'));
        assert.equal(f.requests.length, 0);
    }
    for (const key of ['', null, 'key\nheader', 'key\u0000header', ' key ', 'x'.repeat(4097)]) {
        const f = fixture({ env: { WHATSAPP_WAHA_API_KEY: key } });
        assert.deepEqual(f.provider.configurationInfo(), { configured: false, reason: 'WAHA_API_KEY_REQUIRED' });
        assert.equal(JSON.stringify(f.provider.configurationInfo()).includes(KEY), false);
    }
});

test('session names are canonical server identities; invalid caller values never reach fetch', async () => {
    const f = fixture();
    for (const name of ['default', `off_${'a'.repeat(32)}`, `${SESSION}/../other`, SESSION.toUpperCase(),
        `${SESSION}?url=https://other.invalid`, {}, null, `off_${'a'.repeat(31)}_${'b'.repeat(16)}`]) {
        for (const method of ['createSession', 'sessionStatus', 'qr', 'logout', 'stopSession', 'health'])
            await assert.rejects(f.provider[method](name), errorCode('WAHA_INVALID_SESSION'));
    }
    assert.equal(f.requests.length, 0);
});

test('create/status/logout/stop use the documented endpoints and discard raw provider metadata', async () => {
    const f = fixture();
    assert.deepEqual(await f.provider.createSession(SESSION), { sessionName: SESSION, status: 'STARTING', connected: false, phoneId: null, displayPhone: null, ready: false });
    assert.deepEqual(f.requests[0].body, { name: SESSION, start: true, config: { webhooks: [
        { url: WEBHOOK, events: ['session.status', 'message'], hmac: { key: WEBHOOK_KEY } },
    ], gows: { storage: { messages: false, groups: false, chats: false, labels: false, contacts: false, messageSecrets: false } },
    noweb: { store: { enabled: false, fullSync: false } } } });
    assert.deepEqual(await f.provider.sessionStatus(SESSION), { sessionName: SESSION, status: 'WORKING', connected: true, phoneId: PHONE, displayPhone: `+${PHONE}`, ready: false });
    assert.deepEqual(await f.provider.logout(SESSION), { success: true });
    assert.deepEqual(await f.provider.stopSession(SESSION), { success: true });
    assert.deepEqual(f.requests.map(r => [r.method, r.path]), [
        ['POST', '/api/sessions'], ['GET', `/api/sessions/${SESSION}`], ['POST', `/api/sessions/${SESSION}/logout`], ['POST', `/api/sessions/${SESSION}/stop`],
    ]);
    assert.deepEqual(f.requests.slice(2).map(r => r.body), [{}, {}]);
});

test('signed STOP/status callback requires trusted server configuration and refuses caller overrides', async () => {
    for (const env of [{ WHATSAPP_WAHA_WEBHOOK_URL: undefined }, { WHATSAPP_WAHA_WEBHOOK_SECRET: 'short' },
        { WHATSAPP_WAHA_WEBHOOK_URL: 'http://localhost/api/webhooks/whatsapp-linked' },
        { WHATSAPP_WAHA_WEBHOOK_URL: 'https://office-api.example.invalid/api/webhooks/other' },
        { WHATSAPP_WAHA_WEBHOOK_URL: WEBHOOK + '?key=secret' },
        { WHATSAPP_WAHA_WEBHOOK_URL: 'https://u:p@office-api.example.invalid/api/webhooks/whatsapp-linked' }]) {
        const f = fixture({ env });
        assert.deepEqual(f.provider.configurationInfo(), { configured: false, reason: 'WAHA_WEBHOOK_SETUP_REQUIRED' });
        await assert.rejects(f.provider.createSession(SESSION), errorCode('WAHA_WEBHOOK_SETUP_REQUIRED'));
        assert.equal(f.requests.length, 0);
    }
    const f = fixture();
    for (const options of [{ webhookUrl: 'https://foreign.invalid/api/webhooks/whatsapp-linked' },
        { webhookSecret: 'foreign-secret' }, null]) {
        await assert.rejects(f.provider.createSession(SESSION, options), errorCode('WAHA_INVALID_WEBHOOK_OVERRIDE'));
        assert.equal(f.requests.length, 0);
    }
    const result = await f.provider.createSession(SESSION, { webhookUrl: WEBHOOK, webhookSecret: WEBHOOK_KEY });
    assert.equal(JSON.stringify(result).includes(WEBHOOK_KEY), false);
    assert.equal(JSON.stringify(f.provider.configurationInfo()).includes(WEBHOOK_KEY), false);
});

test('session identity mismatches and unknown statuses fail closed, including uncertain create response', async () => {
    const f = fixture({ respond: () => ({ name: SESSION + '_foreign', status: 'WORKING' }) });
    await assert.rejects(f.provider.sessionStatus(SESSION), errorCode('WAHA_INVALID_SESSION_RESPONSE'));
    await assert.rejects(f.provider.createSession(SESSION), errorCode('WAHA_INVALID_SESSION_RESPONSE', { uncertain: true }));
    const unknown = fixture({ respond: () => ({ name: SESSION, status: 'NEW_PROVIDER_STATUS' }) });
    await assert.rejects(unknown.provider.sessionStatus(SESSION), errorCode('WAHA_INVALID_SESSION_RESPONSE'));
});

test('all transport operations are disabled by server feature flags and demo mode before fetch', async () => {
    for (const env of [{ WHATSAPP_WAHA_ENABLED: 'false' }, { WHATSAPP_DEMO_ONLY: 'true' }]) {
        const f = fixture({ env });
        for (const method of ['createSession', 'sessionStatus', 'qr', 'logout', 'stopSession', 'health'])
            await assert.rejects(f.provider[method](SESSION));
        assert.equal(f.requests.length, 0);
    }
});

test('QR supports documented base64 and binary PNG, never a provider URL or HTML', async () => {
    const f = fixture();
    assert.deepEqual(await f.provider.qr(SESSION), { mimetype: 'image/png', data: PNG });
    assert.equal(f.requests[0].path, `/api/${SESSION}/auth/qr`);
    assert.equal(f.requests[0].search, '?format=image');
    assert.equal(f.requests[0].headers.Accept, 'application/json');
    const binary = fixture({ respond: () => new Response(Buffer.from(PNG, 'base64'), { headers: { 'Content-Type': 'image/png' } }) });
    assert.deepEqual(await binary.provider.qr(SESSION), { mimetype: 'image/png', data: PNG });
    for (const payload of [{ url: 'https://attacker.invalid/qr.png' }, { mimetype: 'image/svg+xml', data: PNG },
        { mimetype: 'image/png', data: '<script>alert(1)</script>' }, { mimetype: 'image/png', data: 'data:image/png;base64,' + PNG },
        { mimetype: 'image/png', data: Buffer.from('not-a-png').toString('base64') },
        { mimetype: 'image/png', data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') },
        { mimetype: 'image/png', data: PNG.slice(0, 20) }, { mimetype: 'image/png', data: PNG + '\n' }]) {
        const bad = fixture({ respond: () => payload });
        await assert.rejects(bad.provider.qr(SESSION), errorCode('WAHA_INVALID_QR'));
    }
    const html = fixture({ respond: () => new Response('<img src="https://attacker.invalid">', { headers: { 'Content-Type': 'text/html' } }) });
    await assert.rejects(html.provider.qr(SESSION), errorCode('WAHA_INVALID_RESPONSE'));
});

test('QR and regular responses are bounded even if content length is absent or dishonest', async () => {
    const oversized = fixture({ respond: () => json({ mimetype: 'image/png', data: 'A'.repeat(1398108) }) });
    await assert.rejects(oversized.provider.qr(SESSION));
    const streaming = fixture({ respond: () => new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(600000)); controller.enqueue(new Uint8Array(600000)); controller.close();
    } }), { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } }) });
    await assert.rejects(streaming.provider.sessionStatus(SESSION), errorCode('WAHA_INVALID_RESPONSE'));
    const length = fixture({ respond: () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' } }) });
    await assert.rejects(length.provider.sessionStatus(SESSION), errorCode('WAHA_INVALID_RESPONSE'));
});

test('health verifies account identity and fresh restrictions before returning ready', async () => {
    const f = fixture();
    const result = await f.provider.health(SESSION);
    assert.deepEqual(result, { sessionName: SESSION, status: 'WORKING', connected: true, phoneId: PHONE,
        displayPhone: `+${PHONE}`, ready: true, restricted: false, incompatibleVersion: false,
        restrictionReason: null, timeEnforcementEnds: null, cycleEnd: null });
    assert.deepEqual(f.requests.map(r => r.path), [`/api/sessions/${SESSION}`, `/api/sessions/${SESSION}/me`,
        `/api/sessions/${SESSION}/timelock`, `/api/sessions/${SESSION}/capping`]);
    assert.equal(JSON.stringify(result).includes('Private Name'), false);
    const mismatch = fixture({ respond: call => call.path.endsWith('/me') ? { id: '972501111111@c.us' } : undefined });
    await assert.rejects(mismatch.provider.health(SESSION), errorCode('WAHA_IDENTITY_UNVERIFIED'));
    for (const id of ['1234@lid', '12345@s.whatsapp.net', 'arbitrary', null]) {
        const bad = fixture({ respond: call => call.path.endsWith('/me') ? { id } : undefined });
        await assert.rejects(bad.provider.health(SESSION), errorCode('WAHA_IDENTITY_UNVERIFIED'));
    }
});

test('WORKING with timelock, any capping warning or unknown capping stays blocked without re-pairing', async () => {
    for (const status of ['FIRST_WARNING', 'SECOND_WARNING', 'CAPPED', 'FUTURE_VALUE']) {
        const f = fixture({ respond: call => call.path.endsWith('/capping') ? { cappingStatus: status, cycleEnd: 1000 } : undefined });
        const result = await f.provider.health(SESSION);
        assert.equal(result.connected, true);
        assert.equal(result.ready, false);
        assert.equal(result.restricted, true);
        assert.equal(result.restrictionReason, 'WAHA_MESSAGE_CAPPING');
        assert.ok(f.requests.every(call => call.method === 'GET'));
    }
    const f = fixture({ respond: call => call.path.endsWith('/timelock') ? { isActive: true, timeEnforcementEnds: 1 } : undefined });
    const result = await f.provider.health(SESSION);
    assert.equal(result.restricted, true); // Expired diagnostic timestamp cannot auto-resume.
    assert.equal(result.restrictionReason, 'WAHA_TIMELOCK');
    assert.ok(f.requests.every(call => call.method === 'GET'));
});

test('unsupported and malformed restriction probes report incompatible readiness rather than safe', async () => {
    for (const endpoint of ['/timelock', '/capping']) for (const status of [404, 405, 501]) {
        const f = fixture({ respond: call => call.path.endsWith(endpoint) ? json({ message: 'synthetic' }, status) : undefined });
        const result = await f.provider.health(SESSION);
        assert.equal(result.connected, true);
        assert.equal(result.ready, false);
        assert.equal(result.restricted, true);
        assert.equal(result.incompatibleVersion, true);
    }
    for (const [endpoint, data] of [['/timelock', {}], ['/timelock', { isActive: 'false' }],
        ['/capping', {}], ['/capping', { cappingStatus: false }], ['/capping', { cappingStatus: 'NONE', cycleEnd: 'tomorrow' }]]) {
        const f = fixture({ respond: call => call.path.endsWith(endpoint) ? data : undefined });
        const result = await f.provider.health(SESSION);
        assert.equal(result.incompatibleVersion, true);
        assert.equal(result.ready, false);
    }
    const stopped = fixture({ respond: call => call.path === `/api/sessions/${SESSION}` ? { name: SESSION, status: 'SCAN_QR_CODE' } : undefined });
    assert.equal((await stopped.provider.health(SESSION)).ready, false);
    assert.equal(stopped.requests.length, 1);
});

test('known HTTP rejections are typed, provider errors and API keys are never propagated', async () => {
    for (const [status, reason] of [[401, 'PROVIDER_AUTH'], [403, 'PROVIDER_AUTH'], [429, 'PROVIDER_RATE_LIMIT'], [422, 'PROVIDER_REJECTED']]) {
        const f = fixture({ respond: () => json({ error: `${KEY} private-case-content https://user:secret@example.invalid` }, status) });
        await assert.rejects(f.provider.createGroup(connection(), 'per-office-token-must-be-ignored', job()), error => {
            assert.equal(error.providerStatus, status);
            assert.equal(error.httpStatus, status);
            assert.equal(error.safetyReason, reason);
            assert.equal(error.uncertain, false);
            assert.equal(String(error).includes(KEY), false);
            assert.equal(JSON.stringify(error).includes('private-case-content'), false);
            return true;
        });
        assert.equal(f.requests.length, 1);
        assert.equal(f.requests[0].headers['X-Api-Key'], KEY);
        assert.equal(JSON.stringify(f.requests[0]).includes('per-office-token-must-be-ignored'), false);
    }
});

test('timeouts, 5xx, malformed mutation responses and redirects never cause automatic POST retries', async () => {
    const responders = [() => { throw new Error(`${KEY}: fetch timeout`); }, () => json({}, 503),
        () => new Response('not-json', { headers: { 'Content-Type': 'application/json' } }),
        () => new Response('', { status: 302, headers: { Location: 'https://foreign.invalid' } })];
    for (const respond of responders) {
        const f = fixture({ respond });
        await assert.rejects(f.provider.createGroup(connection(), null, job()), error => error.uncertain === true && error.safetyReason === 'RESULT_UNKNOWN' && !String(error).includes(KEY));
        assert.equal(f.requests.length, 1);
        assert.equal(f.requests[0].redirect, 'error');
    }
    const get = fixture({ respond: () => { throw new Error('synthetic timeout'); } });
    await assert.rejects(get.provider.sessionStatus(SESSION), errorCode('WAHA_RESULT_UNKNOWN', { uncertain: false, safetyReason: 'PROVIDER_DISCONNECTED' }));
});

test('empty-group creation only sends [] and normalizes documented engine IDs plus a verified invite code', async () => {
    for (const result of [{ id: GROUP }, { gid: { _serialized: GROUP } }, { JID: GROUP }]) {
        const f = fixture({ respond: call => call.path.endsWith('/groups') && call.method === 'POST' ? result : undefined });
        assert.deepEqual(await f.provider.createGroup(connection(), null, job()), { groupId: GROUP, inviteLink: LINK });
        assert.deepEqual(f.requests[0].body, { name: job().subject, participants: [] });
        assert.equal(f.requests[1].path, `/api/${SESSION}/groups/${encodeURIComponent(GROUP)}/invite-code`);
        assert.equal(f.requests.filter(call => call.method === 'POST').length, 1);
        assert.equal(f.requests.length, 2);
    }
});

test('empty-group rejection never falls back to adding a recipient; ambiguous results preserve uncertainty', async () => {
    const rejected = fixture({ respond: () => json({ message: 'empty participants unsupported by synthetic engine' }, 422) });
    await assert.rejects(rejected.provider.createGroup(connection(), null, job()), errorCode('WAHA_REQUEST_REJECTED', { uncertain: false }));
    assert.equal(rejected.requests.length, 1);
    assert.deepEqual(rejected.requests[0].body.participants, []);
    for (const result of [{}, { id: 'https://attacker.invalid' }, { id: GROUP, JID: '120363111111111111@g.us' }, 'created']) {
        const f = fixture({ respond: () => result });
        await assert.rejects(f.provider.createGroup(connection(), null, job()), errorCode('WAHA_GROUP_RESULT_UNKNOWN', { uncertain: true }));
        assert.equal(f.requests.length, 1);
    }
});

test('post-create invite lookup failures retain the verified group ID and never duplicate creation', async () => {
    for (const value of [json({}, 503), json('https://attacker.invalid/invite'), json({ code: CODE }), json('x')]) {
        const f = fixture({ respond: call => call.path.endsWith('/invite-code') ? value : undefined });
        await assert.rejects(f.provider.createGroup(connection(), null, job()), errorCode('WAHA_GROUP_RESULT_UNKNOWN', { uncertain: true, partialGroupId: GROUP }));
        assert.equal(f.requests.filter(call => call.method === 'POST').length, 1);
        assert.equal(f.requests.length, 2);
    }
});

test('invite-code lookup accepts a bounded primitive Nest text response only for the verified group resource', async () => {
    for (const type of ['text/plain', 'text/html; charset=utf-8', 'application/json']) {
        const f = fixture({ respond: call => call.path.endsWith('/invite-code')
            ? new Response(type === 'application/json' ? JSON.stringify(CODE) : CODE, { headers: { 'Content-Type': type } }) : undefined });
        assert.deepEqual(await f.provider.createGroup(connection(), null, job()), { groupId: GROUP, inviteLink: LINK });
        assert.equal(f.requests.length, 2);
        assert.equal(f.requests[1].method, 'GET');
        assert.equal(f.requests[1].path, `/api/${SESSION}/groups/${encodeURIComponent(GROUP)}/invite-code`);
        assert.equal(f.requests.filter(call => call.method === 'POST').length, 1);
    }
    const generalJson = fixture({ respond: () => new Response(JSON.stringify({ name: SESSION, status: 'WORKING' }),
        { headers: { 'Content-Type': 'text/plain' } }) });
    await assert.rejects(generalJson.provider.sessionStatus(SESSION), errorCode('WAHA_INVALID_RESPONSE'));
});

test('pinned runtime invite-code URL wire shape normalizes the controlled text/html URL without another POST', async () => {
    assert.equal(Buffer.byteLength(LINK, 'utf8'), 48);
    const f = fixture({ respond: call => call.path.endsWith('/invite-code')
        ? new Response(LINK, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : undefined });
    assert.deepEqual(await f.provider.createGroup(connection(), null, job()), { groupId: GROUP, inviteLink: LINK });
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.requests.map(call => call.method), ['POST', 'GET']);
    assert.equal(f.requests[1].path, `/api/${SESSION}/groups/${encodeURIComponent(GROUP)}/invite-code`);
    const general = fixture({ respond: () => new Response(LINK, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) });
    await assert.rejects(general.provider.sessionStatus(SESSION), errorCode('WAHA_INVALID_RESPONSE'));
});

test('invite-code text rejects HTML, controls, redirects and oversized responses while retaining partial group ownership', async () => {
    const responses = [
        () => new Response(`<html>${CODE}</html>`, { headers: { 'Content-Type': 'text/html' } }),
        () => new Response(`${CODE}\n`, { headers: { 'Content-Type': 'text/plain' } }),
        () => new Response(`${CODE}\u0000`, { headers: { 'Content-Type': 'text/plain' } }),
        () => new Response('A'.repeat(129), { headers: { 'Content-Type': 'text/plain' } }),
        () => new Response(CODE, { headers: { 'Content-Type': 'text/plain', 'Content-Length': '129' } }),
        () => new Response('', { status: 302, headers: { Location: 'https://foreign.invalid/invite-code' } }),
        () => new Response(JSON.stringify({ code: CODE }), { headers: { 'Content-Type': 'application/json' } }),
        ...[`https://foreign.invalid/${CODE}`, `https://chat.whatsapp.com.evil.invalid/${CODE}`,
            `${LINK}?tracking=1`, `${LINK}#fragment`, `https://chat.whatsapp.com:444/${CODE}`,
            `https://chat.whatsapp.com:443/${CODE}`, `https://user:pass@chat.whatsapp.com/${CODE}`,
            `http://chat.whatsapp.com/${CODE}`, `<html>${LINK}</html>`]
            .map(value => () => new Response(value, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
    ];
    for (const response of responses) {
        const f = fixture({ respond: call => call.path.endsWith('/invite-code') ? response() : undefined });
        await assert.rejects(f.provider.createGroup(connection(), null, job()), errorCode('WAHA_GROUP_RESULT_UNKNOWN', {
            uncertain: true, partialGroupId: GROUP,
        }));
        assert.equal(f.requests.length, 2);
        assert.equal(f.requests.filter(call => call.method === 'POST').length, 1);
        assert.equal(f.requests[1].redirect, 'error');
    }
});

test('direct invitations send one controlled case identifier and opt-out message without arbitrary case content', async () => {
    const f = fixture(), input = { ...job(), case_name: 'private-case-name', template_parameters: ['secret-value'], body: 'untrusted message' };
    assert.deepEqual(await f.provider.invite(connection(), null, input, '+972509876543'), { messages: [{ id: `true_${PHONE}@c.us_SYNTHETIC` }] });
    assert.deepEqual(f.requests[0].body, { session: SESSION, chatId: '972509876543@c.us',
        text: `הוזמנת להצטרף לקבוצת WhatsApp עבור תיק 42.\n${LINK}\nלהפסקת הזמנות נוספות, יש להשיב STOP ולפנות למשרד.`, linkPreview: false });
    assert.equal(f.requests[0].path, '/api/sendText');
    assert.equal(f.requests.length, 1);
    for (const secret of ['private-case-name', 'secret-value', 'untrusted message']) assert.equal(JSON.stringify(f.requests).includes(secret), false);
    const invalid = fixture({ respond: () => ({ ack: 3 }) });
    await assert.rejects(invalid.provider.invite(connection(), null, job(), '+972509876543'), errorCode('WAHA_MESSAGE_RESULT_UNKNOWN', { uncertain: true }));
    assert.equal(invalid.requests.length, 1);
});

test('invitation links, phone identifiers and connection/session snapshots cannot inject endpoints or content', async () => {
    for (const link of ['http://chat.whatsapp.com/ABCDEFGHIJK', 'https://chat.whatsapp.com.evil.invalid/ABCDEFGHIJK',
        'https://user:pass@chat.whatsapp.com/ABCDEFGHIJK', 'https://chat.whatsapp.com/ABCDEFGHIJK?tracking=1',
        'https://chat.whatsapp.com/ABCDEFGHIJK#fragment', 'https://chat.whatsapp.com:444/ABCDEFGHIJK', 'https://foreign.invalid/ABCDEFGHIJK']) {
        const f = fixture();
        await assert.rejects(f.provider.invite(connection(), null, { ...job(), invite_link: link }, '+972509876543'), errorCode('WAHA_INVALID_INVITATION'));
        assert.equal(f.requests.length, 0);
    }
    for (const phone of ['+972501234567@c.us', '972501234567', '+97250\ntext', 'https://foreign.invalid']) {
        const f = fixture();
        await assert.rejects(f.provider.invite(connection(), null, job(), phone), errorCode('WAHA_INVALID_INVITATION'));
        assert.equal(f.requests.length, 0);
    }
    for (const c of [{ ...connection(), settings: { ...connection().settings, gateway: 'meta' } },
        { ...connection(), settings: { ...connection().settings, connectionType: 'business_app' } }]) {
        const f = fixture();
        await assert.rejects(f.provider.createGroup(c, null, job()), errorCode('WAHA_INVALID_CONNECTION'));
        assert.equal(f.requests.length, 0);
    }
    const f = fixture();
    await assert.rejects(f.provider.createGroup(connection(), null, { ...job(), session_name: `${SESSION}x` }), errorCode('WAHA_INVALID_SESSION'));
    await assert.rejects(f.provider.createGroup({ ...connection(), id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }, null, job()), errorCode('WAHA_INVALID_SESSION'));
    for (const input of [{ ...job(), session_name: undefined }, { ...job(), gateway: 'meta' },
        { ...job(), connection_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }])
        await assert.rejects(f.provider.createGroup(connection(), null, input), errorCode('WAHA_INVALID_SESSION'));
    assert.equal(f.requests.length, 0);
});

test('outbound flags block group creation and messages while connection lifecycle remains available', async () => {
    for (const env of [{ WHATSAPP_WAHA_DELIVERY_ENABLED: 'false' }, { WHATSAPP_WAHA_CONNECT_ONLY: 'true' }, { QA_OUTBOUND_MODE: 'noop' }]) {
        const f = fixture({ env });
        await assert.rejects(f.provider.createGroup(connection(), null, job()), errorCode('WHATSAPP_DELIVERY_DISABLED'));
        await assert.rejects(f.provider.invite(connection(), null, job(), '+972509876543'), errorCode('WHATSAPP_DELIVERY_DISABLED'));
        assert.equal(f.requests.length, 0);
        await f.provider.createSession(SESSION);
        await f.provider.logout(SESSION);
        assert.equal(f.requests.length, 2);
    }
});

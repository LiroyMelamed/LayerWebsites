'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetaProvider, webhookCallbackConfig } = require('../services/integrations/metaProvider');
const { createIntegrationService } = require('../services/integrations/service');
const APP = '111111', PHONE = '123456', WABA = '654321';
const CALLBACK = 'https://office-api.example.invalid/api/webhooks/whatsapp';
const FOREIGN = 'https://another-deployment.example.invalid/api/webhooks/whatsapp';
const baseEnv = { WHATSAPP_META_APP_ID: APP, WHATSAPP_META_APP_SECRET: 'synthetic-app-secret',
    WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '222222', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'synthetic-verify-token',
    WHATSAPP_WEBHOOK_CALLBACK_URL: CALLBACK, INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_LIVE_ENABLED: 'true' };
const input = { code: 'synthetic-one-use-code', wabaId: WABA, phoneId: PHONE };
const connection = { phone_number_id: PHONE, waba_id: WABA, settings: { templateName: 'synthetic_invite', templateLanguage: 'he' } };
function fixture(options = {}) {
    const env = { ...baseEnv, ...options.env }, requests = [];
    const state = { subscribed: options.subscribed || false, override: options.override, posts: 0 };
    const scopes = ['whatsapp_business_management', 'whatsapp_business_messaging'];
    const ownApp = override => ({ whatsapp_business_api_data: { id: APP }, ...(override ? { override_callback_uri: override } : {}) });
    const provider = createMetaProvider({ env, fetchImpl: async (url, request) => {
        const parsed = new URL(url), endpoint = parsed.pathname.split('/').slice(2).join('/');
        const item = { endpoint, method: request.method, fields: parsed.searchParams.get('fields'), body: request.body && JSON.parse(request.body) };
        requests.push(item);
        let data;
        if (endpoint === 'oauth/access_token') data = { access_token: 'synthetic-office-token' };
        else if (endpoint === 'debug_token') data = { data: { is_valid: true, app_id: options.grantedApp || APP, scopes, granular_scopes: scopes.map(scope => ({ scope, target_ids: [WABA] })) } };
        else if (endpoint === `${WABA}/phone_numbers`) data = { data: [{ id: PHONE, is_on_biz_app: options.businessApp === true }] };
        else if (endpoint === PHONE && item.fields === 'webhook_configuration') data = options.phoneResponse || { id: PHONE, webhook_configuration: {
            application: 'https://app-default.example.invalid/api/webhooks/whatsapp',
            ...(options.phoneOverride ? { phone_number: options.phoneOverride } : {}),
            ...(state.override ? { whatsapp_business_account: state.override } : {}),
        } };
        else if (endpoint === PHONE && item.fields === 'official_business_account') data = options.oba || { id: PHONE, official_business_account: { oba_status: 'APPROVED' } };
        else if (endpoint === PHONE) data = { id: PHONE, is_on_biz_app: options.businessApp === true, platform_type: 'CLOUD_API', status: options.pending && state.posts === 0 ? 'PENDING' : 'CONNECTED' };
        else if (endpoint === `${WABA}/subscribed_apps` && item.method === 'GET') {
            if (options.subscriptionResponse) data = options.subscriptionResponse;
            else data = { data: [
                { whatsapp_business_api_data: { id: '999999' }, override_callback_uri: FOREIGN },
                ...(state.subscribed ? [ownApp(options.readbackMissing && state.posts ? undefined : state.override)] : []),
            ] };
        } else if (endpoint === `${WABA}/subscribed_apps` && item.method === 'POST') {
            state.posts++;
            if (options.postUnknown) throw Error('synthetic transport interrupted');
            if (options.postServerFailure) return { ok: false, status: 503, json: async () => ({ error: { code: 2, message: 'private provider payload' } }) };
            data = options.subscribeResult || { success: true };
            state.subscribed = true; state.override = item.body.override_callback_uri;
        } else if (endpoint === `${PHONE}/register`) data = { success: true };
        else if (endpoint === `${WABA}/message_templates`) data = { data: [{ name: 'synthetic_invite', language: 'he', status: 'APPROVED' }] };
        else throw Error(`Unexpected fake endpoint ${endpoint}`);
        return { ok: true, status: 200, json: async () => data };
    } });
    return { env, provider, requests, state };
}
const posts = requests => requests.filter(r => r.method === 'POST');

test('trusted callback configuration rejects missing, malformed or unsafe targets before any network or DB operation', async () => {
    const invalid = [undefined, '', 'http://office.example.invalid/webhook', 'https://user:pass@office.example.invalid/webhook',
        'https://office.example.invalid/webhook?route=office', 'https://office.example.invalid/webhook#fragment',
        ' https://office.example.invalid/webhook', 'https://office.example.invalid/' + 'x'.repeat(200)];
    for (const value of invalid) {
        const f = fixture({ env: { WHATSAPP_WEBHOOK_CALLBACK_URL: value } });
        assert.equal(webhookCallbackConfig(f.env), null);
        const service = createIntegrationService({ pool: {}, provider: f.provider, env: f.env });
        assert.equal(service.signupConfig().configurationReady, false); assert.equal(service.signupConfig().requirements.webhook, false);
        assert.equal(service.signupConfig().ready, false); assert.equal(service.signupConfig().liveEnabled, false);
        await assert.rejects(service.startSignup(null, 1), { errorCode: 'META_SETUP_REQUIRED' });
        await assert.rejects(f.provider.completeSignup(input), { errorCode: 'META_WEBHOOK_SETUP_REQUIRED' });
        assert.deepEqual(f.requests, []);
    }
    for (const token of [undefined, '', '  ', 'unsafe\ntoken']) assert.equal(webhookCallbackConfig({ ...baseEnv, WHATSAPP_WEBHOOK_VERIFY_TOKEN: token }), null);
    const prefix = 'https://callback.example.invalid/';
    assert.ok(webhookCallbackConfig({ ...baseEnv, WHATSAPP_WEBHOOK_CALLBACK_URL: prefix + 'x'.repeat(200 - prefix.length) }));
});

test('new subscription uses explicit trusted override, exact app readback and no empty-body mutation', async () => {
    const f = fixture({ pending: true }); const result = await f.provider.completeSignup(input);
    assert.equal(result.connectionType, 'cloud');
    const subscription = posts(f.requests).find(r => r.endpoint === `${WABA}/subscribed_apps`);
    assert.deepEqual(subscription.body, { override_callback_uri: CALLBACK, verify_token: baseEnv.WHATSAPP_WEBHOOK_VERIFY_TOKEN });
    assert.equal(f.requests.filter(r => r.endpoint === `${WABA}/subscribed_apps` && r.method === 'GET').length, 2);
    assert.equal(f.requests.filter(r => r.fields === 'webhook_configuration').length, 2);
    const registration = f.requests.findIndex(r => r.endpoint === `${PHONE}/register`);
    assert.ok(registration > f.requests.map(r => r.endpoint).lastIndexOf(`${WABA}/subscribed_apps`), 'Registration follows verified callback readback');
    assert.equal(posts(f.requests).filter(r => r.endpoint === `${WABA}/subscribed_apps`).length, 1);
    assert.equal(f.requests.some(r => r.endpoint.includes('official_business_account')), false, 'Onboarding must not promise group eligibility');
});

test('exact existing app-specific route is preserved without another POST; unrelated apps cannot supply the match', async () => {
    const f = fixture({ subscribed: true, override: CALLBACK, phoneOverride: CALLBACK });
    await f.provider.completeSignup(input); assert.deepEqual(posts(f.requests), []);
    const otherOnly = fixture(); await otherOnly.provider.completeSignup(input);
    assert.equal(posts(otherOnly.requests).filter(r => r.endpoint === `${WABA}/subscribed_apps`).length, 1);
});

test('different WABA or higher-priority phone override blocks before subscribe or register', async () => {
    for (const options of [{ subscribed: true, override: FOREIGN, pending: true }, { phoneOverride: FOREIGN, pending: true }]) {
        const f = fixture(options);
        await assert.rejects(f.provider.completeSignup(input), { errorCode: 'META_WEBHOOK_ROUTE_CONFLICT' });
        assert.deepEqual(posts(f.requests), []);
    }
});

test('malformed or ambiguous subscription/phone readback fails closed before mutation', async () => {
    for (const options of [
        { subscriptionResponse: {} },
        { subscriptionResponse: { data: [{}] } },
        { subscriptionResponse: { data: [null] } },
        { subscriptionResponse: { data: [{ whatsapp_business_api_data: { id: APP }, override_callback_uri: 42 }] } },
        { subscriptionResponse: { data: [], paging: { next: 'https://graph.example.invalid/next' } } },
        { subscriptionResponse: { data: [{ whatsapp_business_api_data: { id: APP } }, { whatsapp_business_api_data: { id: APP } }] } },
        { phoneResponse: { id: '999999', webhook_configuration: {} } },
        { phoneResponse: { id: PHONE } },
        { phoneResponse: { id: PHONE, webhook_configuration: [] } },
        { phoneResponse: { id: PHONE, webhook_configuration: { phone_number: 42 } } },
    ]) {
        const f = fixture(options); await assert.rejects(f.provider.completeSignup(input), { errorCode: 'META_WEBHOOK_ROUTE_UNVERIFIED' });
        assert.deepEqual(posts(f.requests), []);
    }
});

test('uncertain subscribe failures are never retried and cannot continue into phone registration', async () => {
    for (const options of [{ postUnknown: true }, { postServerFailure: true }]) {
        const f = fixture({ ...options, pending: true });
        await assert.rejects(f.provider.completeSignup(input), error => {
            assert.equal(error.uncertain, true); assert.equal(/token|private provider|https:\/\//.test(error.message), false); return true;
        });
        assert.equal(posts(f.requests).length, 1); assert.equal(f.state.posts, 1);
    }
});

test('subscribe success is insufficient without exact readback and cannot register an unverified route', async () => {
    for (const options of [{ readbackMissing: true }, { subscribeResult: { success: false } },
        { phoneResponse: { id: PHONE, webhook_configuration: { application: 'https://app-default.example.invalid/webhook' } } }]) {
        const f = fixture({ ...options, pending: true });
        await assert.rejects(f.provider.completeSignup(input), { errorCode: 'META_WEBHOOK_ROUTE_UNVERIFIED' });
        assert.equal(posts(f.requests).length, 1);
    }
});

test('browser supplied callback and verify-token properties cannot redirect server subscription', async () => {
    const f = fixture();
    await f.provider.completeSignup({ ...input, override_callback_uri: FOREIGN, verify_token: 'browser-value', callbackUrl: FOREIGN });
    assert.deepEqual(posts(f.requests)[0].body, { override_callback_uri: CALLBACK, verify_token: baseEnv.WHATSAPP_WEBHOOK_VERIFY_TOKEN });
});

test('QR connection follows the same verified routing contract and never registers the existing Business app phone', async () => {
    const f = fixture({ businessApp: true, env: { WHATSAPP_SIGNUP_FLOW: 'business_app', WHATSAPP_CONNECT_ONLY: 'true' } });
    const result = await f.provider.completeSignup({ code: input.code, wabaId: WABA });
    assert.equal(result.phoneId, PHONE); assert.equal(result.pin, null); assert.equal(result.connectionType, 'business_app');
    assert.deepEqual(posts(f.requests).map(r => r.endpoint), [`${WABA}/subscribed_apps`]);
});

test('OBA readiness requests phone official_business_account field and reads nested oba_status only', async () => {
    const f = fixture();
    assert.deepEqual(await f.provider.readiness(connection, 'synthetic-token'), { eligible: true, templateReady: true });
    assert.ok(f.requests.some(r => r.endpoint === PHONE && r.fields === 'official_business_account'));
    assert.equal(f.requests.some(r => r.endpoint === `${PHONE}/official_business_account`), false);
    for (const oba of [{ oba_status: 'APPROVED' }, { official_business_account: { oba_status: 'NOT_STARTED' } }, {}, { official_business_account: null }]) {
        const denied = fixture({ oba }); assert.equal((await denied.provider.readiness(connection, 'synthetic-token')).eligible, false);
    }
    assert.deepEqual(posts(f.requests), []);
});

test('disabled/demo configuration does not break construction; existing connection health stays read-only without callback settings', async () => {
    const f = fixture({ env: { WHATSAPP_WEBHOOK_CALLBACK_URL: undefined } });
    assert.deepEqual(await f.provider.connectionHealth(connection, 'synthetic-token'), { connected: true });
    assert.deepEqual(posts(f.requests), []);
    const demo = fixture({ env: { WHATSAPP_DEMO_ONLY: 'true', WHATSAPP_WEBHOOK_CALLBACK_URL: undefined } });
    await assert.rejects(demo.provider.completeSignup(input), { message: 'WHATSAPP_DEMO_ONLY' });
    assert.deepEqual(demo.requests, []);
    const service = createIntegrationService({ pool: {}, provider: demo.provider, env: demo.env });
    assert.equal(service.signupConfig().ready, false); assert.equal(service.signupConfig().liveEnabled, false);
});

test('ungranted Meta app cannot reach routing mutations or registration', async () => {
    const f = fixture({ grantedApp: '999999', pending: true });
    await assert.rejects(f.provider.completeSignup(input), { errorCode: 'META_ASSET_NOT_GRANTED' });
    assert.deepEqual(posts(f.requests), []);
});


test('missing or invalid trusted callback blocks actual group and invitation transport despite live flags', async () => {
    for (const value of [undefined, 'http://unsafe.example.invalid/webhook']) {
        const f = fixture({ env: { WHATSAPP_WEBHOOK_CALLBACK_URL: value } });
        await assert.rejects(f.provider.createGroup(connection, 'synthetic-token', { subject: 'Synthetic case' }), { message: 'WHATSAPP_DELIVERY_DISABLED' });
        await assert.rejects(f.provider.invite(connection, 'synthetic-token', { group_id: 'synthetic-group' }, '+972500000001'), { message: 'WHATSAPP_DELIVERY_DISABLED' });
        assert.deepEqual(f.requests, []);
    }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetaProvider } = require('../services/integrations/metaProvider');
const { createIntegrationService } = require('../services/integrations/service');
const { appSyncStatus } = require('../services/integrations/appSyncStatus');
const env = { WHATSAPP_CONNECT_ONLY: 'true', WHATSAPP_SIGNUP_FLOW: 'business_app', WHATSAPP_META_APP_ID: '111111',
    WHATSAPP_META_APP_SECRET: 'synthetic', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '222222', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'synthetic', WHATSAPP_WEBHOOK_CALLBACK_URL: 'https://synthetic-api.example.invalid/api/webhooks/whatsapp',
    INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32), WHATSAPP_LIVE_ENABLED: 'true' };
function fixture({ phones = [{ id: '123456', is_on_biz_app: true }], bizApp = true } = {}) {
    let subscribed = false;
    const requests = [], scopes = ['whatsapp_business_management', 'whatsapp_business_messaging'];
    const provider = createMetaProvider({ env, fetchImpl: async (url, options) => {
        const endpoint = new URL(url).pathname.split('/').slice(2).join('/');
        requests.push({ endpoint, method: options.method, body: options.body && JSON.parse(options.body) });
        let data;
        if (endpoint === 'oauth/access_token') data = { access_token: 'synthetic-token' };
        else if (endpoint === 'debug_token') data = { data: { is_valid: true, app_id: env.WHATSAPP_META_APP_ID, scopes, granular_scopes: scopes.map(scope => ({ scope, target_ids: ['654321'] })) } };
        else if (endpoint === '654321/phone_numbers') data = { data: phones };
        else if (endpoint === '123456' && new URL(url).searchParams.get('fields') === 'webhook_configuration') data = { id: '123456', webhook_configuration: { application: 'https://synthetic-app.example.invalid/webhook', ...(subscribed ? { whatsapp_business_account: env.WHATSAPP_WEBHOOK_CALLBACK_URL } : {}) } };
        else if (endpoint === '123456') data = { id: '123456', is_on_biz_app: bizApp, platform_type: 'CLOUD_API', status: 'CONNECTED' };
        else if (endpoint === '654321/subscribed_apps' && options.method === 'GET') data = { data: subscribed ? [{ whatsapp_business_api_data: { id: env.WHATSAPP_META_APP_ID }, override_callback_uri: env.WHATSAPP_WEBHOOK_CALLBACK_URL }] : [] };
        else if (endpoint === '654321/subscribed_apps') { assert.deepEqual(JSON.parse(options.body), { override_callback_uri: env.WHATSAPP_WEBHOOK_CALLBACK_URL, verify_token: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN }); subscribed = true; data = { success: true }; }
        else if (endpoint === '123456/smb_app_data') data = { request_id: 'synthetic-request' };
        else throw Error('Unexpected Meta request: ' + endpoint);
        return { ok: true, status: 200, json: async () => data };
    } });
    return { provider, requests };
}
test('QR completion resolves the sole verified app number, never registers it or checks group eligibility', async () => {
    const { provider, requests } = fixture();
    const result = await provider.completeSignup({ code: 'synthetic-code', wabaId: '654321' });
    assert.equal(result.phoneId, '123456'); assert.equal(result.connectionType, 'business_app'); assert.equal(result.pin, null);
    const connection = { phone_number_id: result.phoneId, waba_id: result.wabaId, settings: {} };
    await provider.syncBusinessApp(connection, result.token);
    assert.deepEqual(requests.filter(r => r.method === 'POST').map(r => r.endpoint), ['654321/subscribed_apps', '123456/smb_app_data', '123456/smb_app_data']);
    assert.deepEqual(requests.slice(-2).map(r => r.body.sync_type), ['smb_app_state_sync', 'history']);
    assert.equal((await provider.connectionHealth(connection, result.token)).connected, true);
});
test('QR never guesses between multiple numbers or accepts a foreign/non-app number', async () => {
    for (const options of [{ phones: [] }, { phones: [{ id: '123456', is_on_biz_app: true }, { id: '777777', is_on_biz_app: true }] }]) {
        const { provider, requests } = fixture(options);
        await assert.rejects(provider.completeSignup({ code: 'synthetic-code', wabaId: '654321' }), { errorCode: 'META_PHONE_AMBIGUOUS' });
        assert.ok(requests.every(r => r.method === 'GET'));
    }
    const { provider, requests } = fixture({ bizApp: false });
    await assert.rejects(provider.completeSignup({ code: 'synthetic-code', wabaId: '654321', phoneId: '123456' }), { errorCode: 'META_BUSINESS_APP_REQUIRED' });
    await assert.rejects(provider.completeSignup({ code: 'synthetic-code', wabaId: '654321', phoneId: '999999' }), { errorCode: 'META_PHONE_NOT_GRANTED' });
    assert.ok(requests.every(r => r.method === 'GET'));
});
test('connection-only and QA noop each block delivery at the provider even with live flags', async () => {
    for (const flags of [{ WHATSAPP_CONNECT_ONLY: 'true' }, { QA_OUTBOUND_MODE: 'noop' }]) {
        let requests = 0;
        const config = { ...env, WHATSAPP_CONNECT_ONLY: 'false', ...flags };
        const provider = createMetaProvider({ env: config, fetchImpl: async () => { requests++; throw Error('No outbound network'); } });
        const service = createIntegrationService({ pool: {}, provider, env: config });
        assert.equal(service.signupConfig().ready, true); assert.equal(service.signupConfig().liveEnabled, false);
        const c = { phone_number_id: '123456', settings: {} };
        await assert.rejects(provider.createGroup(c, 'token', { subject: 'test' }), /WHATSAPP_DELIVERY_DISABLED/);
        await assert.rejects(provider.invite(c, 'token', {}, '+972500000001'), /WHATSAPP_DELIVERY_DISABLED/);
        assert.equal(requests, 0);
    }
});
test('sync receipts retain only a known status and respect declined history', () => {
    assert.equal(appSyncStatus('history', { history: [{ errors: [{ code: 2593109 }] }] }), 'history_declined');
    assert.equal(appSyncStatus('history', { history: [{ metadata: { progress: 100 }, threads: [{ messages: [{ text: 'private' }] }] }] }), 'complete');
    assert.equal(appSyncStatus('history', { history: [{ metadata: { progress: 10 } }] }), null);
    assert.equal(appSyncStatus('smb_app_state_sync', { contacts: ['private'] }), null);
});
test('known Meta onboarding rejection blocks signup; price preview is exempt and cannot activate billing', async () => {
    const service = createIntegrationService({ pool: {}, provider: {}, env: { ...env, WHATSAPP_META_APPROVAL_PENDING: 'true', WHATSAPP_PRICING_PREVIEW: 'true' } });
    const config = service.signupConfig();
    assert.equal(config.configurationReady, true); assert.equal(config.ready, false); assert.equal(config.appId, null);
    assert.equal(config.pricing.monthlyAmount, 99); assert.equal(config.pricing.vatMode, 'exempt');
    assert.equal(config.pricing.setupAmount, 0); assert.equal(config.pricing.billingActive, false);
    await assert.rejects(service.startSignup(null, 1), { errorCode: 'META_SETUP_REQUIRED' });
});

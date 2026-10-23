'use strict';
const crypto = require('node:crypto');
const { fail } = require('./validation');
const { deliveryAllowed } = require('./deliveryPolicy');
const { webhookCallbackConfig } = require('./callbackConfiguration');

function createMetaProvider({ env = process.env, fetchImpl = global.fetch } = {}) {
    const version = /^v\d+\.0$/.test(env.WHATSAPP_GRAPH_VERSION || '') ? env.WHATSAPP_GRAPH_VERSION : 'v26.0';
    const appToken = () => `${env.WHATSAPP_META_APP_ID}|${env.WHATSAPP_META_APP_SECRET}`;
    async function graph(path, token, { method = 'GET', body, query = {} } = {}) {
        if (env.WHATSAPP_DEMO_ONLY === 'true') throw new Error('WHATSAPP_DEMO_ONLY');
        if (method !== 'GET' && /\/(groups|messages)(?:\/|$)/.test(path) && !deliveryAllowed(env)) throw new Error('WHATSAPP_DELIVERY_DISABLED');
        const url = new URL(`https://graph.facebook.com/${version}/${path}`);
        Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        let response, data;
        try {
            response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}) });
            data = await response.json();
        } catch {
            const error = new Error('META_RESULT_UNKNOWN'); error.uncertain = method !== 'GET'; throw error;
        }
        if (!response.ok || data.error) {
            // Never propagate URLs, tokens, user content, or raw provider errors to logs/UI.
            const error = new Error('META_REQUEST_FAILED');
            error.providerCode = Number(data?.error?.code) || 0;
            error.uncertain = method !== 'GET' && response.status >= 500;
            throw error;
        }
        return data;
    }
    const id = value => {
        if (!/^\d{5,30}$/.test(String(value || ''))) fail('INVALID_META_ASSET', 'מזהה החשבון שהתקבל מ־Meta אינו תקין');
        return String(value);
    };
    async function webhookRouteState(wabaId, phoneId, token, callbackUrl) {
        // A phone override takes priority over the WABA override. Check it before
        // any subscribe/register mutation, rather than silently redirecting it.
        const phone = await graph(phoneId, token, { query: { fields: 'webhook_configuration' } });
        const config = phone.webhook_configuration;
        if (String(phone.id) !== phoneId || !config || typeof config !== 'object' || Array.isArray(config))
            fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
        for (const key of ['phone_number', 'whatsapp_business_account']) {
            const current = config[key];
            if (current != null && typeof current !== 'string') fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
            if (current && current !== callbackUrl) fail('META_WEBHOOK_ROUTE_CONFLICT', 'חשבון WhatsApp כבר מנתב עדכונים לחיבור אחר. נדרשת בדיקת מנהל הפלטפורמה', 409);
        }
        const result = await graph(`${wabaId}/subscribed_apps`, token, { query: { limit: 100 } });
        if (!Array.isArray(result.data) || result.data.length > 100 || result.paging?.next ||
            result.data.some(row => !/^\d{5,30}$/.test(String(row?.whatsapp_business_api_data?.id || ''))))
            fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
        const matches = result.data.filter(row => String(row?.whatsapp_business_api_data?.id || '') === String(env.WHATSAPP_META_APP_ID));
        if (matches.length > 1) fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
        const current = matches[0]?.override_callback_uri;
        if (current != null && typeof current !== 'string') fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
        if (current && current !== callbackUrl) fail('META_WEBHOOK_ROUTE_CONFLICT', 'חשבון WhatsApp כבר מנתב עדכונים לחיבור אחר. נדרשת בדיקת מנהל הפלטפורמה', 409);
        if (matches.length === 1 && current === callbackUrl) {
            const effectiveOverride = config.phone_number || config.whatsapp_business_account;
            if (effectiveOverride !== callbackUrl) fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
            return true;
        }
        return false;
    }
    async function configureWebhookRoute(wabaId, phoneId, token, config) {
        if (await webhookRouteState(wabaId, phoneId, token, config.callbackUrl)) return;
        // An empty POST body removes an existing alternate callback. Always send
        // the explicit trusted target, and never retry an uncertain POST blindly.
        const subscribed = await graph(`${wabaId}/subscribed_apps`, token, { method: 'POST', body: {
            override_callback_uri: config.callbackUrl, verify_token: config.verifyToken,
        } });
        if (subscribed.success !== true) fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
        if (!await webhookRouteState(wabaId, phoneId, token, config.callbackUrl))
            fail('META_WEBHOOK_ROUTE_UNVERIFIED', 'לא ניתן לאמת את ניתוב עדכוני WhatsApp', 502);
    }
    async function completeSignup({ code, wabaId, phoneId }) {
        if (env.WHATSAPP_DEMO_ONLY === 'true') throw new Error('WHATSAPP_DEMO_ONLY');
        const callback = webhookCallbackConfig(env);
        if (!callback) fail('META_WEBHOOK_SETUP_REQUIRED', 'מנהל הפלטפורמה צריך להשלים את הגדרת חיבור WhatsApp', 503);
        const businessApp = env.WHATSAPP_SIGNUP_FLOW === 'business_app';
        wabaId = id(wabaId);
        phoneId = businessApp && !phoneId ? null : id(phoneId);
        if (typeof code !== 'string' || code.length < 10 || code.length > 4096) fail('INVALID_SIGNUP_CODE', 'קוד החיבור אינו תקין');
        const exchange = await graph('oauth/access_token', appToken(), { query: {
            client_id: env.WHATSAPP_META_APP_ID, client_secret: env.WHATSAPP_META_APP_SECRET, code,
        } });
        const token = exchange.access_token;
        if (!token) fail('META_AUTH_FAILED', 'Meta לא החזירה הרשאת חיבור', 502);
        const { data: debug } = await graph('debug_token', appToken(), { query: { input_token: token } });
        const scopes = ['whatsapp_business_management', 'whatsapp_business_messaging'];
        if (!debug?.is_valid || String(debug.app_id) !== String(env.WHATSAPP_META_APP_ID) ||
            !scopes.every(scope => debug.scopes?.includes(scope) && debug.granular_scopes?.some(g => g.scope === scope && g.target_ids?.map(String).includes(wabaId)))) {
            fail('META_ASSET_NOT_GRANTED', 'יש לאשר את הרשאות החשבון שנבחר בחלון Meta', 403);
        }
        const assets = await graph(`${wabaId}/phone_numbers`, token, { query: { fields: businessApp ? 'id,is_on_biz_app' : 'id', limit: 100 } });
        if (!phoneId) {
            const candidates = (assets.data || []).filter(p => p.is_on_biz_app === true);
            // Meta may omit phone_number_id for coexistence. Never choose the first
            // phone of an ambiguous account or accept an unverified browser asset.
            if (candidates.length !== 1 || assets.paging?.next) fail('META_PHONE_AMBIGUOUS', 'לא ניתן לזהות מספר יחיד בחשבון שאושר. יש להתחיל שוב ולבחור מספר', 409);
            phoneId = id(candidates[0].id);
        }
        if (!assets.data?.some(p => String(p.id) === phoneId)) fail('META_PHONE_NOT_GRANTED', 'המספר אינו שייך לחשבון שאושר', 403);
        const phone = await graph(phoneId, token, { query: { fields: 'id,display_phone_number,status,platform_type,is_on_biz_app' } });
        if (businessApp && (phone.is_on_biz_app !== true || phone.platform_type !== 'CLOUD_API')) fail('META_BUSINESS_APP_REQUIRED', 'יש לחבר מספר פעיל באפליקציית WhatsApp Business דרך המסלול שנפתח', 409);
        await configureWebhookRoute(wabaId, phoneId, token, callback);
        const pin = businessApp || phone.status === 'CONNECTED' ? null : String(crypto.randomInt(100000, 1000000));
        if (pin) await graph(`${phoneId}/register`, token, { method: 'POST', body: { messaging_product: 'whatsapp', pin } });
        const expiry = Math.min(...[debug.expires_at, debug.data_access_expires_at].filter(v => Number(v) > 0).map(Number));
        return { token, pin, wabaId, phoneId, displayPhone: phone.display_phone_number || '',
            expiresAt: Number.isFinite(expiry) ? new Date(expiry * 1000) : null,
            connectionType: businessApp ? 'business_app' : 'cloud', eligible: false };
    }
    async function syncBusinessApp(connection, token) {
        const phoneId = id(connection.phone_number_id);
        // Mandatory coexistence handshake. Incoming contacts/message content is
        // discarded in connection-only QA; only synchronization status is retained.
        for (const sync_type of ['smb_app_state_sync', 'history']) {
            await graph(`${phoneId}/smb_app_data`, token, { method: 'POST', body: { messaging_product: 'whatsapp', sync_type } });
        }
    }
    async function connectionHealth(connection, token) {
        const phone = await graph(id(connection.phone_number_id), token, { query: { fields: 'id,status,platform_type,is_on_biz_app' } });
        return { connected: phone.status === 'CONNECTED' && phone.platform_type === 'CLOUD_API' };
    }
    async function readiness(connection, token) {
        const phoneId = id(connection.phone_number_id);
        const phone = await graph(phoneId, token, { query: { fields: 'id,status,platform_type,display_phone_number,is_on_biz_app' } });
        if (phone.is_on_biz_app === true) return { eligible: false, templateReady: false };
        const oba = await graph(phoneId, token, { query: { fields: 'official_business_account' } });
        const templates = await graph(`${id(connection.waba_id)}/message_templates`, token, { query: {
            name: connection.settings.templateName || '', fields: 'name,status,language,components', limit: 100,
        } });
        const template = templates.data?.find(t => t.name === connection.settings.templateName && t.language === connection.settings.templateLanguage && t.status === 'APPROVED');
        return { eligible: phone.status === 'CONNECTED' && phone.platform_type === 'CLOUD_API' && oba.official_business_account?.oba_status === 'APPROVED', templateReady: Boolean(template) };
    }
    async function createGroup(connection, token, job) {
        return graph(`${id(connection.phone_number_id)}/groups`, token, { method: 'POST', body: {
            messaging_product: 'whatsapp', subject: job.subject, join_approval_mode: 'auto_approve',
        } });
    }
    async function invite(connection, token, job, phone) {
        return graph(`${id(connection.phone_number_id)}/messages`, token, { method: 'POST', body: {
            messaging_product: 'whatsapp', to: phone.replace(/^\+/, ''), type: 'template',
            template: { name: job.template_name, language: { code: job.template_language }, components: [{ type: 'body', parameters: [
                { type: 'group_id', group_id: job.group_id },
                ...(job.template_parameters || []).map(text => ({ type: 'text', text })),
            ] }] },
        } });
    }
    return { completeSignup, connectionHealth, syncBusinessApp, readiness, createGroup, invite };
}
module.exports = { createMetaProvider, webhookCallbackConfig };

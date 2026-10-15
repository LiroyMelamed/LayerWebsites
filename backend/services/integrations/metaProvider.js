'use strict';
const crypto = require('node:crypto');
const { fail } = require('./validation');

function createMetaProvider({ env = process.env, fetchImpl = global.fetch } = {}) {
    const version = /^v\d+\.0$/.test(env.WHATSAPP_GRAPH_VERSION || '') ? env.WHATSAPP_GRAPH_VERSION : 'v25.0';
    const appToken = () => `${env.WHATSAPP_META_APP_ID}|${env.WHATSAPP_META_APP_SECRET}`;
    async function graph(path, token, { method = 'GET', body, query = {} } = {}) {
        if (env.WHATSAPP_DEMO_ONLY === 'true') throw new Error('WHATSAPP_DEMO_ONLY');
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
    async function completeSignup({ code, wabaId, phoneId }) {
        wabaId = id(wabaId); phoneId = id(phoneId);
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
        const assets = await graph(`${wabaId}/phone_numbers`, token, { query: { fields: 'id', limit: 100 } });
        if (!assets.data?.some(p => String(p.id) === phoneId)) fail('META_PHONE_NOT_GRANTED', 'המספר אינו שייך לחשבון שאושר', 403);
        const phone = await graph(phoneId, token, { query: { fields: 'id,display_phone_number,status,platform_type' } });
        const oba = await graph(`${phoneId}/official_business_account`, token);
        const pin = phone.status === 'CONNECTED' ? null : String(crypto.randomInt(100000, 1000000));
        if (phone.status !== 'CONNECTED') await graph(`${phoneId}/register`, token, { method: 'POST', body: { messaging_product: 'whatsapp', pin } });
        await graph(`${wabaId}/subscribed_apps`, token, { method: 'POST', body: {} });
        const expiry = Math.min(...[debug.expires_at, debug.data_access_expires_at].filter(v => Number(v) > 0).map(Number));
        return { token, pin, wabaId, phoneId, displayPhone: phone.display_phone_number || '',
            expiresAt: Number.isFinite(expiry) ? new Date(expiry * 1000) : null,
            eligible: phone.platform_type === 'CLOUD_API' && oba.oba_status === 'APPROVED' };
    }
    async function readiness(connection, token) {
        const phoneId = id(connection.phone_number_id);
        const phone = await graph(phoneId, token, { query: { fields: 'id,status,platform_type,display_phone_number' } });
        const oba = await graph(`${phoneId}/official_business_account`, token);
        const templates = await graph(`${id(connection.waba_id)}/message_templates`, token, { query: {
            name: connection.settings.templateName || '', fields: 'name,status,language,components', limit: 100,
        } });
        const template = templates.data?.find(t => t.name === connection.settings.templateName && t.language === connection.settings.templateLanguage && t.status === 'APPROVED');
        return { eligible: phone.status === 'CONNECTED' && phone.platform_type === 'CLOUD_API' && oba.oba_status === 'APPROVED', templateReady: Boolean(template) };
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
    return { completeSignup, readiness, createGroup, invite };
}
module.exports = { createMetaProvider };

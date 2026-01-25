const axios = require('axios');
require('dotenv').config();

// Constants for company name and website domain (mirror SMS module)
const {
    COMPANY_NAME,
    WEBSITE_DOMAIN,
    isProduction,
} = require('./sendMessage');

// For short-term testing: when true, send real EMAIL even in dev.
const FORCE_SEND_EMAIL_ALL = process.env.FORCE_SEND_EMAIL_ALL === 'true';

const ALLOWED_CAMPAIGN_KEYS = ['SIGN_INVITE', 'SIGN_REMINDER', 'CASE_UPDATE', 'DOC_SIGNED'];

const ALLOWED_CUSTOM_FIELD_KEYS = [
    'client_name',
    'case_number',
    'case_title',
    'action_url',
    'lawyer_name',
];

/**
 * Send an email via Smoove in a campaign-based way.
 *
 * Why campaigns?
 * - Smoove email sending is designed around campaigns/templates, not one-off transactional emails.
 * - Dynamic case data is injected via Contact Custom Fields that the template references.
 *
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.campaignKey
 * @param {object} args.contactFields
 */
async function sendEmailCampaign({ toEmail, campaignKey, contactFields } = {}) {
    const email = String(toEmail || '').trim();
    const key = String(campaignKey || '').trim().toUpperCase();

    if (!email || !isValidEmail(email)) {
        console.error('Invalid email for campaign:', email);
        return { ok: false, errorCode: 'INVALID_EMAIL' };
    }

    if (!key || !ALLOWED_CAMPAIGN_KEYS.includes(key)) {
        console.error('Invalid campaignKey for email campaign:', key);
        return { ok: false, errorCode: 'INVALID_CAMPAIGN_KEY' };
    }

    if (contactFields != null && (typeof contactFields !== 'object' || Array.isArray(contactFields))) {
        console.error('Invalid contactFields (expected object).');
        return { ok: false, errorCode: 'INVALID_CONTACT_FIELDS' };
    }

    const shouldSendRealEmail = isProduction || FORCE_SEND_EMAIL_ALL;

    const mapped = getCampaignMapping(key);

    if (!shouldSendRealEmail) {
        console.log('--- EMAIL Campaign Simulation (Dev Mode) ---');
        console.log('To:', email);
        console.log('CampaignKey:', key);
        console.log('ContactFields:', safeJsonString(truncateForLog(sanitizeFieldsForLog(filterAllowedContactFields(contactFields)), 1200)));
        console.log('-------------------------------------------');
        return { ok: true, simulated: true };
    }

    try {
        const baseUrlRaw = String(process.env.SMOOVE_BASE_URL || '').trim();
        const apiKey = String(process.env.SMOOVE_API_KEY || '').trim();

        const missing = [];
        if (!baseUrlRaw) missing.push('SMOOVE_BASE_URL');
        if (!apiKey) missing.push('SMOOVE_API_KEY');

        // Explicit requirement: template-based send must be configured.
        // This keeps sending single-recipient safe and avoids accidental list/campaign blasts.
        if (!mapped.templateName) {
            missing.push(mapped.envTemplateNameKey);
        }

        if (missing.length) {
            console.error(`Smoove env vars missing (${missing.join('/')}). Cannot send email campaign.`);
            return { ok: false, errorCode: 'MISSING_ENV', details: { missing } };
        }

        const baseUrl = baseUrlRaw.replace(/\/+$/g, '');

        // 1) Upsert contact and update only the relevant custom fields.
        const allowedFields = filterAllowedContactFields(contactFields);
        const upsertRes = await upsertContactByEmail({ baseUrl, apiKey, email, customFields: allowedFields, listId: mapped.listId });
        if (!upsertRes.ok) {
            return upsertRes;
        }

        // 2) Trigger send
        // Prefer template-based sending to a single email address, to avoid blasting list recipients.
        if (mapped.templateName) {
            const createRes = await createAndSendCampaignFromTemplate({
                baseUrl,
                apiKey,
                templateName: mapped.templateName,
                toEmail: email,
            });

            if (!createRes.ok) {
                return { ...createRes, contactId: upsertRes.contactId || null };
            }

            return {
                ok: true,
                contactId: upsertRes.contactId || null,
                campaignSendId: createRes.campaignSendId || null,
            };
        }

        // Fallback: send an existing saved campaign (WARNING: may send to its configured recipients).
        const sendRes = await sendExistingCampaign({ baseUrl, apiKey, campaignId: mapped.campaignId });
        if (!sendRes.ok) {
            return { ...sendRes, contactId: upsertRes.contactId || null };
        }

        return {
            ok: true,
            contactId: upsertRes.contactId || null,
            campaignSendId: sendRes.campaignSendId || null,
        };
    } catch (error) {
        console.error(`Smoove email campaign failed to ${email}:`, safeStringify(error));
        return { ok: false, errorCode: 'UNKNOWN_ERROR' };
    }
}

function getCampaignMapping(campaignKey) {
    const key = String(campaignKey || '').trim().toUpperCase();

    const envCampaignIdKey = `SMOOVE_EMAIL_${key}_CAMPAIGN_ID`;
    const envListIdKey = `SMOOVE_EMAIL_${key}_LIST_ID`;
    const envTemplateNameKey = `SMOOVE_EMAIL_${key}_TEMPLATE_NAME`;

    const campaignIdRaw = String(process.env[envCampaignIdKey] || '').trim();
    const listIdRaw = String(process.env[envListIdKey] || '').trim();
    const templateName = String(process.env[envTemplateNameKey] || '').trim();

    const campaignId = campaignIdRaw ? String(campaignIdRaw) : '';
    const listId = listIdRaw && isPositiveIntString(listIdRaw) ? Number(listIdRaw) : null;

    return {
        campaignId,
        listId,
        templateName,
        envCampaignIdKey,
        envListIdKey,
        envTemplateNameKey,
    };
}

async function upsertContactByEmail({ baseUrl, apiKey, email, customFields, listId }) {
    try {
        const url = `${baseUrl}/v1/Contacts`;

        const body = {
            email: String(email || '').trim(),
            // Only include the custom fields we want to update.
            customFields: customFields || {},
            options: {
                customFields: Object.keys(customFields || {}).map((id) => ({ id, mode: 'replace' })),
            },
        };

        // Attempt to subscribe to a list when configured.
        // Smoove docs indicate Contacts can be added to lists; some accounts accept lists_ToSubscribe on contact update.
        if (Number.isFinite(listId) && listId > 0) {
            body.lists_ToSubscribe = [listId];
        }

        const headers = {
            ApiKey: apiKey,
            'Content-Type': 'application/json',
        };

        const res = await axios.post(url, body, {
            headers,
            params: {
                updateIfExists: true,
                restoreIfDeleted: true,
                restoreIfUnsubscribed: true,
                overrideNullableValue: false,
            },
            timeout: 15000,
            validateStatus: () => true,
        });

        if (res.status >= 200 && res.status < 300) {
            const contactId = Number(res.data?.id) || null;
            console.log(`Smoove contact upserted by email: ${email}`);
            return { ok: true, contactId };
        }

        const errorMessage = extractSmooveErrorMessage(res.data);
        console.error(`Smoove contact upsert failed: HTTP ${res.status} ${safeJsonString(truncateForLog(res.data))}`);
        return { ok: false, errorCode: 'CONTACT_UPSERT_FAILED', error: errorMessage };
    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;

        if (status) {
            const errorMessage = extractSmooveErrorMessage(data);
            console.error(`Smoove contact upsert failed: HTTP ${status} ${safeJsonString(truncateForLog(data))}`);
            return { ok: false, errorCode: 'CONTACT_UPSERT_FAILED', error: errorMessage };
        }

        console.error('Smoove contact upsert failed:', safeStringify(error));
        return { ok: false, errorCode: 'CONTACT_UPSERT_FAILED' };
    }
}

async function createAndSendCampaignFromTemplate({ baseUrl, apiKey, templateName, toEmail }) {
    try {
        const t = String(templateName || '').trim();
        if (!t) {
            return { ok: false, errorCode: 'MISSING_TEMPLATE_NAME' };
        }

        const url = `${baseUrl}/v1/Campaigns`;

        const headers = {
            ApiKey: apiKey,
            'Content-Type': 'application/json',
        };

        const body = {
            // Target a single recipient by email.
            toMembersByEmail: [String(toEmail || '').trim()],
            trackLinks: true,
        };

        const res = await axios.post(url, body, {
            headers,
            params: {
                sendNow: true,
                templateName: t,
            },
            timeout: 15000,
            validateStatus: () => true,
        });

        if (res.status >= 200 && res.status < 300) {
            const campaignSendId = Number(res.data?.id) || null;
            console.log(`Smoove email campaign created+sent (template=${t}) to ${toEmail}`);
            return { ok: true, campaignSendId };
        }

        const errorMessage = extractSmooveErrorMessage(res.data);
        console.error(`Smoove campaign create failed: HTTP ${res.status} ${safeJsonString(truncateForLog(res.data))}`);
        return { ok: false, errorCode: 'CAMPAIGN_CREATE_FAILED', error: errorMessage };
    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;

        if (status) {
            const errorMessage = extractSmooveErrorMessage(data);
            console.error(`Smoove campaign create failed: HTTP ${status} ${safeJsonString(truncateForLog(data))}`);
            return { ok: false, errorCode: 'CAMPAIGN_CREATE_FAILED', error: errorMessage };
        }

        console.error('Smoove campaign create failed:', safeStringify(error));
        return { ok: false, errorCode: 'CAMPAIGN_CREATE_FAILED' };
    }
}

async function sendExistingCampaign({ baseUrl, apiKey, campaignId }) {
    try {
        const id = String(campaignId || '').trim();
        if (!id) {
            return { ok: false, errorCode: 'MISSING_CAMPAIGN_ID' };
        }

        const url = `${baseUrl}/v1/Campaigns/${encodeURIComponent(id)}/Send`;

        const headers = {
            ApiKey: apiKey,
            'Content-Type': 'application/json',
        };

        const res = await axios.post(url, {}, {
            headers,
            params: {
                by: 'CampaignId',
            },
            timeout: 15000,
            validateStatus: () => true,
        });

        if (res.status >= 200 && res.status < 300) {
            console.log(`Smoove email campaign sent (campaignId=${id})`);
            return { ok: true, campaignSendId: null };
        }

        const errorMessage = extractSmooveErrorMessage(res.data);
        console.error(`Smoove campaign send failed: HTTP ${res.status} ${safeJsonString(truncateForLog(res.data))}`);
        return { ok: false, errorCode: 'CAMPAIGN_SEND_FAILED', error: errorMessage };
    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;

        if (status) {
            const errorMessage = extractSmooveErrorMessage(data);
            console.error(`Smoove campaign send failed: HTTP ${status} ${safeJsonString(truncateForLog(data))}`);
            return { ok: false, errorCode: 'CAMPAIGN_SEND_FAILED', error: errorMessage };
        }

        console.error('Smoove campaign send failed:', safeStringify(error));
        return { ok: false, errorCode: 'CAMPAIGN_SEND_FAILED' };
    }
}

function filterAllowedContactFields(contactFields) {
    const obj = contactFields && typeof contactFields === 'object' && !Array.isArray(contactFields) ? contactFields : {};

    const out = {};
    for (const k of ALLOWED_CUSTOM_FIELD_KEYS) {
        if (obj[k] == null) continue;
        // keep payload compact and predictable
        const v = String(obj[k]).trim();
        if (!v) continue;
        out[k] = v;
    }

    return out;
}

function sanitizeFieldsForLog(fields) {
    const obj = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
    const out = {};

    for (const [k, v] of Object.entries(obj)) {
        if (k === 'action_url') {
            const s = String(v || '');
            // Avoid leaking signed URLs / tokens into logs.
            const idx = s.indexOf('?');
            out[k] = idx >= 0 ? `${s.slice(0, idx)}?…` : s;
            continue;
        }
        out[k] = v;
    }

    return out;
}

function isPositiveIntString(value) {
    const s = String(value || '').trim();
    return /^\d+$/.test(s) && Number(s) > 0;
}

function isValidEmail(email) {
    const s = String(email || '').trim();
    if (!s) return false;
    if (s.length > 254) return false;
    // Pragmatic app-level validation.
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(s);
}

function truncateForLog(value, maxLen = 2000) {
    if (value == null) return value;

    if (typeof value === 'string') {
        if (value.length <= maxLen) return value;
        return `${value.slice(0, maxLen)}...`;
    }

    try {
        const s = safeStringify(value);
        if (s.length <= maxLen) return value;
        return `${s.slice(0, maxLen)}...`;
    } catch {
        return '[Unserializable]';
    }
}

function safeStringify(value) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(
            value,
            (k, v) => {
                if (typeof v === 'object' && v !== null) {
                    if (seen.has(v)) return '[Circular]';
                    seen.add(v);
                }
                return v;
            },
            2
        );
    } catch {
        try {
            return String(value);
        } catch {
            return '[Unstringifiable]';
        }
    }
}

function safeJsonString(value) {
    if (value == null) return 'null';

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return JSON.stringify(parsed);
        } catch {
            return JSON.stringify({ message: value });
        }
    }

    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify({ message: '[Unserializable]' });
    }
}

function extractSmooveErrorMessage(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data;

    try {
        if (typeof data?.message === 'string') return data.message;
        if (typeof data?.error === 'string') return data.error;
        if (typeof data?.Message === 'string') return data.Message;
        if (typeof data?.Error === 'string') return data.Error;
    } catch {
        // ignore
    }

    return safeStringify(data);
}

module.exports = {
    sendEmailCampaign,
    COMPANY_NAME,
    WEBSITE_DOMAIN,
    isProduction,
    FORCE_SEND_EMAIL_ALL,
};

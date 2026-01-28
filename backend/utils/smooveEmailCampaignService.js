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

const ALLOWED_CAMPAIGN_KEYS = ['SIGN_INVITE', 'SIGN_REMINDER', 'CASE_UPDATE', 'DOC_SIGNED', 'DOC_REJECTED'];

const SIGN_INVITE_REQUIRED_CUSTOM_FIELDS = [
    'recipient_name',
    'document_name',
    'action_url',
    'lawyer_name',
];

const SIGN_REMINDER_REQUIRED_CUSTOM_FIELDS = [
    'recipient_name',
    'document_name',
    'action_url',
    'lawyer_name',
];

const DEFAULT_SMOOVE_REST_BASE_URL = 'https://rest.smoove.io';

const TRANSACTIONAL_EMAIL_REQUIRED_ENV = [
    'SMOOVE_API_KEY',
    'SMOOVE_EMAIL_FROM_NAME',
    'SMOOVE_EMAIL_FROM_EMAIL',
];

const ALLOWED_CUSTOM_FIELD_KEYS = [
    'client_name',
    'case_number',
    'case_title',
    'case_stage',
    'action_url',
    'lawyer_name',
    'recipient_name',
    'document_name',
    'rejection_reason',
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

    const allowedFields = filterAllowedContactFieldsForCampaign(key, contactFields);

    if (key === 'SIGN_INVITE') {
        const missing = getMissingRequiredCustomFields(allowedFields, SIGN_INVITE_REQUIRED_CUSTOM_FIELDS);
        if (missing.length) {
            return { ok: false, errorCode: 'MISSING_CONTACT_FIELDS', missing };
        }

        const actionUrl = String(allowedFields.action_url || '').trim();
        if (!isLikelyHttpUrl(actionUrl)) {
            return { ok: false, errorCode: 'INVALID_CONTACT_FIELDS', details: { field: 'action_url' } };
        }

        // SIGN_INVITE primary path: transactional send (server-rendered HTML).
        return await sendTransactionalSignInvite({
            toEmail: email,
            contactFields: allowedFields,
            shouldSendRealEmail,
        });
    }

    if (key === 'SIGN_REMINDER') {
        const missing = getMissingRequiredCustomFields(allowedFields, SIGN_REMINDER_REQUIRED_CUSTOM_FIELDS);
        if (missing.length) {
            return { ok: false, errorCode: 'MISSING_CONTACT_FIELDS', missing };
        }

        const actionUrl = String(allowedFields.action_url || '').trim();
        if (!isLikelyHttpUrl(actionUrl)) {
            return { ok: false, errorCode: 'INVALID_CONTACT_FIELDS', details: { field: 'action_url' } };
        }
    }

    if (!shouldSendRealEmail) {
        console.log('--- EMAIL Campaign Simulation (Dev Mode) ---');
        console.log('To:', maskEmailForLog(email));
        console.log('CampaignKey:', key);
        console.log('ContactFields:', safeJsonString(truncateForLog(sanitizeFieldsForLog(allowedFields), 1200)));
        console.log('-------------------------------------------');
        return { ok: true, simulated: true };
    }

    try {
        const baseUrlRaw = String(process.env.SMOOVE_BASE_URL || DEFAULT_SMOOVE_REST_BASE_URL).trim();
        const apiKey = String(process.env.SMOOVE_API_KEY || '').trim();

        const missing = [];
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
        console.error(`Smoove email campaign failed to ${maskEmailForLog(email)}:`, safeStringify(error));
        return { ok: false, errorCode: 'UNKNOWN_ERROR' };
    }
}

async function sendTransactionalSignInvite({ toEmail, contactFields, shouldSendRealEmail }) {
    const email = String(toEmail || '').trim();
    const fields = contactFields || {};

    const fromName = String(process.env.SMOOVE_EMAIL_FROM_NAME || '').trim();
    const fromEmail = String(process.env.SMOOVE_EMAIL_FROM_EMAIL || '').trim();
    const replyTo = String(process.env.SMOOVE_EMAIL_REPLY_TO || '').trim();

    const baseUrlRaw = String(process.env.SMOOVE_BASE_URL || DEFAULT_SMOOVE_REST_BASE_URL).trim();
    const apiKey = String(process.env.SMOOVE_API_KEY || '').trim();

    const missing = [];
    for (const k of TRANSACTIONAL_EMAIL_REQUIRED_ENV) {
        if (!String(process.env[k] || '').trim()) missing.push(k);
    }

    if (missing.length) {
        console.error(`Smoove env vars missing (${missing.join('/')}). Cannot send transactional email.`);
        return { ok: false, errorCode: 'MISSING_ENV', details: { missing } };
    }

    const subject = `בקשה לחתימה: ${String(fields.document_name || '').trim()}`;

    const htmlTemplate = buildSignInviteHtmlTemplate();
    const htmlBody = replaceSignInvitePlaceholders(htmlTemplate, fields);

    if (!shouldSendRealEmail) {
        console.log('--- EMAIL Transactional Simulation (Dev Mode) ---');
        console.log('To:', maskEmailForLog(email));
        console.log('Subject:', truncateForLog(subject, 200));
        console.log('BodyBytes:', Buffer.byteLength(String(htmlBody || ''), 'utf8'));
        console.log('FieldKeys:', Object.keys(fields || {}).sort());
        console.log('------------------------------------------------');
        return { ok: true, simulated: true, mode: 'transactional' };
    }

    const baseUrl = baseUrlRaw.replace(/\/+$/g, '');
    const url = `${baseUrl}/v1/Campaigns?sendNow=true`;

    // Smoove REST v1 does not expose a “transactional email send” endpoint.
    // The supported way to send a one-off email programmatically is to create an
    // email campaign targeting a single recipient email and send it immediately.
    const payload = {
        trackLinks: true,
        subject: String(subject || '').trim(),
        body: String(htmlBody || ''),
        // Note: API supports customFromAddress/customReplyToAddress (no explicit from-name field).
        ...(fromEmail ? { customFromAddress: fromEmail } : null),
        ...(replyTo ? { customReplyToAddress: replyTo } : null),
        // Send to a single recipient (transactional-like)
        toMembersByEmail: [email],
    };

    const requestHeaders = {
        'Content-Type': 'application/json',
        // Swagger securityDefinitions: apiKey in header named "Authorization"
        Authorization: apiKey,
        // Defensive: some endpoints/accounts accept ApiKey header
        ApiKey: apiKey,
    };

    try {
        const res = await axios.post(url, payload, {
            headers: requestHeaders,
            timeout: 15000,
            validateStatus: () => true,
        });

        if (res.status >= 200 && res.status < 300) {
            console.log(`Smoove email campaign sent to ${maskEmailForLog(email)} (SIGN_INVITE)`);
            return { ok: true, mode: 'campaign-sendnow', campaignId: res.data?.id || null };
        }

        if (res.status === 401 || res.status === 403) {
            console.error('Smoove email auth failed; header names used:', Object.keys(requestHeaders).sort());
        }

        const msg = res.data?.message || res.data?.error || 'Email campaign send failed';
        console.error('Smoove email campaign send failed:', { status: res.status, message: String(msg).slice(0, 500) });
        return { ok: false, errorCode: 'EMAIL_SEND_FAILED', details: { status: res.status } };
    } catch (e) {
        console.error('Smoove email campaign send exception:', safeStringify(e));
        return { ok: false, errorCode: 'EMAIL_SEND_FAILED' };
    }
}

function buildSignInviteHtmlTemplate() {
    // User-provided SIGN_INVITE HTML body (placeholders replaced server-side).
    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="x-apple-disable-message-reformatting">
        <title>הזמנה לחתימה</title>
    </head>
    <body style="margin:0;padding:0;background-color:#EDF2F7;">
        <!-- Preheader (hidden) -->
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">ממתין/ה לחתימתך על המסמך: [[document_name]]</div>

        <table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;" width="100%">
            <tbody>
                <tr>
                    <td align="center" style="padding:24px 12px;">
                        <!-- Container -->

                        <table border="0" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);" width="640">
                            <tbody>
                                <!-- Header -->
                                <tr>
                                    <td style="background:#2A4365;padding:22px 24px;text-align:center;"><img src="https://client.melamedlaw.co.il/static/media/logoLMwhite.png" width="170" alt="MelamedLaw" style="border:0;outline:none;text-decoration:none;height:auto;max-width:100%;">
                                        <div style="height:14px;line-height:14px;">&nbsp;</div>
                                        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#FFFFFF;font-size:18px;font-weight:600;line-height:1.4;">בקשה לחתימה דיגיטלית</div>
                                    </td>
                                </tr>
                                <!-- Body -->
                                <tr>
                                    <td style="padding:26px 24px 8px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D3748;">
                                        <div style="font-size:16px;line-height:1.7;">שלום [[recipient_name]],
                                            <br>
                                            <br>נשלחה אליך בקשה לחתימה על המסמך: <span style="font-weight:600;color:#1A365D;">[[document_name]]</span>
                                            <br>
                                            <br>כדי לצפות ולחתום, לחץ/י על הכפתור:</div>
                                        <div style="height:18px;line-height:18px;">&nbsp;</div>
                                        <!-- CTA Button -->

                                        <table border="0" cellpadding="0" cellspacing="0" style="width:100%;">
                                            <tbody>
                                                <tr>
                                                    <td align="center" style="padding:0 0 8px 0;"><a href="[[action_url]]" rel="noopener" style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.10);" target="_blank">&nbsp;&nbsp;לצפייה וחתימה&nbsp;&nbsp;</a></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div style="height:10px;line-height:10px;">&nbsp;</div>
                                        <div style="font-size:13px;line-height:1.7;color:#718096;">אם הכפתור לא עובד, ניתן להעתיק ולהדביק בדפדפן את הקישור:
                                            <br><a href="[[action_url]]" rel="noopener" style="color:#1A365D;text-decoration:underline;word-break:break-all;" target="_blank">&nbsp;[[action_url]]&nbsp;</a></div>
                                        <div style="height:18px;line-height:18px;">&nbsp;</div>
                                        <!-- Info box -->

                                        <table border="0" cellpadding="0" cellspacing="0" style="background:#EDF2F7;border-radius:12px;" width="100%">
                                            <tbody>
                                                <tr>
                                                    <td style="padding:14px 14px;color:#2D3748;font-size:13px;line-height:1.6;">
                                                        <div style="font-weight:600;color:#1A365D;">מידע חשוב</div>
                                                        <div style="height:6px;line-height:6px;">&nbsp;</div>
                                                        <div>עו״ד מטפל: <span style="font-weight:600;">[[lawyer_name]]</span></div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div style="height:18px;line-height:18px;">&nbsp;</div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="padding:14px 24px 22px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#718096;font-size:12px;line-height:1.7;">הודעה זו נשלחה אוטומטית. אם אינך מצפה לבקשה זו, ניתן להתעלם ממנה.
                                        <br>&copy; MelamedLaw</td>
                                </tr>
                            </tbody>
                        </table>
                        <!-- /Container -->
                    </td>
                </tr>
            </tbody>
        </table>
    </body>
</html>`;
}

function replaceSignInvitePlaceholders(template, fields) {
    const safeRecipient = escapeHtml(String(fields.recipient_name || '').trim());
    const safeDocument = escapeHtml(String(fields.document_name || '').trim());
    const safeLawyer = escapeHtml(String(fields.lawyer_name || '').trim());

    const urlRaw = String(fields.action_url || '').trim();
    const safeUrl = escapeHtml(urlRaw);

    let out = String(template || '');
    out = replaceAllSafe(out, '[[recipient_name]]', safeRecipient);
    out = replaceAllSafe(out, '[[document_name]]', safeDocument);
    out = replaceAllSafe(out, '[[lawyer_name]]', safeLawyer);
    out = replaceAllSafe(out, '[[action_url]]', safeUrl);
    return out;
}

function replaceAllSafe(input, needle, value) {
    return String(input).split(String(needle)).join(String(value));
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(str) {
    // Attribute-safe: escape quotes + HTML meta chars. (We validate URL scheme separately.)
    return escapeHtml(str);
}

function isLikelyHttpUrl(url) {
    const u = String(url || '').trim();
    if (!u) return false;
    return u.startsWith('https://') || u.startsWith('http://');
}

function filterAllowedContactFieldsForCampaign(campaignKey, contactFields) {
    const key = String(campaignKey || '').trim().toUpperCase();
    const input = contactFields || {};
    const baseFiltered = filterAllowedContactFields(input);

    if (key === 'SIGN_INVITE') {
        const only = {};
        for (const k of SIGN_INVITE_REQUIRED_CUSTOM_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(baseFiltered, k)) {
                only[k] = baseFiltered[k];
            }
        }
        return only;
    }

    return baseFiltered;
}

function getMissingRequiredCustomFields(customFields, requiredKeys) {
    const fields = customFields || {};
    const missing = [];

    for (const k of requiredKeys || []) {
        const v = fields[k];
        if (v == null) {
            missing.push(k);
            continue;
        }
        if (String(v).trim() === '') {
            missing.push(k);
        }
    }

    return missing;
}

function maskEmailForLog(email) {
    const e = String(email || '').trim();
    const at = e.indexOf('@');
    if (at <= 0) return '[redacted-email]';
    const name = e.slice(0, at);
    const domain = e.slice(at + 1);
    const safeName = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
    return `${safeName}@${domain}`;
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
            // Swagger securityDefinitions: apiKey in header named "Authorization"
            Authorization: apiKey,
            // Defensive: some endpoints/accounts accept ApiKey header
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

        if (res.status === 401 || res.status === 403) {
            console.error('Smoove contact auth failed; header names used:', Object.keys(headers).sort());
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
            // Swagger securityDefinitions: apiKey in header named "Authorization"
            Authorization: apiKey,
            // Defensive: some endpoints/accounts accept ApiKey header
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

        if (res.status === 401 || res.status === 403) {
            console.error('Smoove campaign create auth failed; header names used:', Object.keys(headers).sort());
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
            // Swagger securityDefinitions: apiKey in header named "Authorization"
            Authorization: apiKey,
            // Defensive: some endpoints/accounts accept ApiKey header
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

        if (res.status === 401 || res.status === 403) {
            console.error('Smoove campaign send auth failed; header names used:', Object.keys(headers).sort());
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

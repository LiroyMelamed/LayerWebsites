const nodemailer = require('nodemailer');
require('dotenv').config();

// Constants for company name and website domain (mirror SMS module)
const {
    COMPANY_NAME,
    WEBSITE_DOMAIN,
    isProduction,
} = require('./sendMessage');

// For short-term testing: when true, send real EMAIL even in dev.
const FORCE_SEND_EMAIL_ALL = process.env.FORCE_SEND_EMAIL_ALL === 'true';

// DB-stored email template service + platform settings
const { getEmailTemplate, getSetting } = require('../services/settingsService');

const ALLOWED_CAMPAIGN_KEYS = [
    'SIGN_INVITE', 'SIGN_REMINDER', 'DOC_SIGNED', 'DOC_REJECTED',
    'CASE_CREATED', 'CASE_NAME_CHANGE', 'CASE_TYPE_CHANGE',
    'CASE_STAGE_CHANGE', 'CASE_CLOSED', 'CASE_REOPENED',
    'CASE_MANAGER_CHANGE', 'CASE_EST_DATE_CHANGE',
    'CASE_LICENSE_CHANGE', 'CASE_COMPANY_CHANGE', 'CASE_TAGGED',
    'NEW_CLIENT',
];

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

const DOC_SIGNED_REQUIRED_CUSTOM_FIELDS = [
    'recipient_name',
    'document_name',
    'lawyer_name',
];

const DOC_REJECTED_REQUIRED_CUSTOM_FIELDS = [
    'recipient_name',
    'document_name',
    'lawyer_name',
    'rejection_reason',
];

const TRANSACTIONAL_EMAIL_REQUIRED_ENV = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
];

const ALLOWED_CUSTOM_FIELD_KEYS = [
    'client_name',
    'case_number',
    'case_title',
    'case_stage',
    'action_url',
    'lawyer_name',
    'manager_name',
    'recipient_name',
    'document_name',
    'rejection_reason',
    'signed_document_url',
    'evidence_certificate_url',
    'firm_name',
];

/**
 * Send a campaign-based email using a DB-stored template.
 *
 * Dynamic data is injected via contact fields that the template references.
 *
 * @param {object} args
 * @param {string} args.toEmail
 * @param {string} args.campaignKey
 * @param {object} args.contactFields
 */
async function sendEmailCampaign({ toEmail, campaignKey, contactFields, attachments, fromEmail } = {}) {
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
    const allowedFields = filterAllowedContactFieldsForCampaign(key, contactFields);

    // ── Load template from DB ──
    // For DOC_SIGNED with attachments, use the DOC_SIGNED_ATTACHMENTS variant
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const templateKey = (key === 'DOC_SIGNED' && hasAttachments) ? 'DOC_SIGNED_ATTACHMENTS' : key;

    let dbTemplate;
    try {
        dbTemplate = await getEmailTemplate(templateKey);
    } catch (err) {
        console.error(`[EMAIL] Failed to load template ${templateKey} from DB:`, err?.message);
    }

    if (!dbTemplate) {
        console.error(`[EMAIL] Template "${templateKey}" not found in DB. Cannot send email.`);
        return { ok: false, errorCode: 'TEMPLATE_NOT_FOUND', details: { templateKey } };
    }

    // Build subject from template
    const subjectTemplate = dbTemplate.subject_template || '';
    const subject = replaceEmailPlaceholders(subjectTemplate, allowedFields);

    // Build HTML body from DB template
    const htmlBody = replaceEmailPlaceholders(dbTemplate.html_body, allowedFields);

    // DOC_SIGNED with attachments: send via Nodemailer with file attachments
    if (key === 'DOC_SIGNED' && hasAttachments) {
        return await sendEmailWithAttachments({
            toEmail: email,
            subject,
            htmlBody,
            attachments,
            logLabel: 'DOC_SIGNED',
            fromEmail: fromEmail || undefined,
        });
    }

    // All other campaigns: send via SMTP
    return await sendTransactionalEmail({
        toEmail: email,
        subject,
        htmlBody,
        fields: allowedFields,
        shouldSendRealEmail,
        logLabel: key,
    });
}

async function sendTransactionalEmail({ toEmail, subject, htmlBody, fields, shouldSendRealEmail, logLabel, ccEmails } = {}) {
    const email = String(toEmail || '').trim();

    const fromName = String(await getSetting('messaging', 'SMTP_FROM_NAME', process.env.SMTP_FROM_NAME) || '').trim();
    // CC list: optional array of email strings passed by callers (replaces old global CEO CC)
    const ccList = (Array.isArray(ccEmails) ? ccEmails : []).map(e => String(e || '').trim()).filter(Boolean);
    const ccEmail = ccList.length > 0 ? ccList.join(', ') : '';

    if (!shouldSendRealEmail) {
        console.log('--- EMAIL Transactional Simulation (Dev Mode) ---');
        console.log('To:', maskEmailForLog(email));
        console.log('Label:', String(logLabel || '').trim() || 'TRANSACTIONAL');
        console.log('Subject:', truncateForLog(String(subject || ''), 200));
        console.log('BodyBytes:', Buffer.byteLength(String(htmlBody || ''), 'utf8'));
        console.log('FieldKeys:', Object.keys(fields || {}).sort());
        console.log('------------------------------------------------');
        return { ok: true, simulated: true, mode: 'transactional' };
    }

    // ── SMTP/Nodemailer (exclusive transport) ──
    const smtpHost = String(process.env.SMTP_HOST || '').trim();
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASS || '').trim();
    const smtpFrom = String(await getSetting('messaging', 'SMTP_FROM_EMAIL', process.env.SMTP_FROM_EMAIL) || '').trim();

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.error('SMTP env vars missing (SMTP_HOST/SMTP_USER/SMTP_PASS). Cannot send email.');
        return { ok: false, errorCode: 'SMTP_NOT_CONFIGURED' };
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });

        const mailOptions = {
            from: fromName ? `${fromName} <${smtpFrom}>` : smtpFrom,
            to: email,
            ...(ccEmail && ccEmail.toLowerCase() !== email.toLowerCase() ? { cc: ccEmail } : {}),
            subject: String(subject || '').trim(),
            html: String(htmlBody || ''),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`SMTP email sent to ${maskEmailForLog(email)} (${String(logLabel || 'EMAIL').trim()}) messageId=${info.messageId}`);
        return { ok: true, mode: 'smtp', messageId: info.messageId };
    } catch (e) {
        console.error(`SMTP send failed for ${String(logLabel || 'EMAIL').trim()}:`, e?.message || e);
        return { ok: false, errorCode: 'EMAIL_SEND_FAILED', details: { error: e?.message } };
    }
}

/**
 * Send a one-off transactional HTML email.
 * Reuses the same SMTP transport as other transactional emails.
 */
async function sendTransactionalCustomHtmlEmail({ toEmail, subject, htmlBody, logLabel } = {}) {
    const email = String(toEmail || '').trim();
    const s = String(subject || '').trim();
    const body = String(htmlBody || '');
    const label = String(logLabel || 'CUSTOM').trim();

    const shouldSendRealEmail = isProduction || FORCE_SEND_EMAIL_ALL;

    return await sendTransactionalEmail({
        toEmail: email,
        subject: s,
        htmlBody: body,
        fields: {},
        shouldSendRealEmail,
        logLabel: label,
    });
}

/**
 * Send an email with file attachments via Nodemailer (SMTP).
 * Used for DOC_SIGNED when PDF attachments are provided.
 *
 * Requires env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Falls back gracefully if SMTP is not configured.
 */
async function sendEmailWithAttachments({ toEmail, subject, htmlBody, attachments, logLabel, fromEmail: fromEmailOverride, ccEmails } = {}) {
    const email = String(toEmail || '').trim();
    const fromName = String(await getSetting('messaging', 'SMTP_FROM_NAME', process.env.SMTP_FROM_NAME) || '').trim();
    // Always send FROM the SMTP account (noreply@) – cPanel rejects mismatched senders.
    const fromEmail = String(await getSetting('messaging', 'SMTP_FROM_EMAIL', process.env.SMTP_FROM_EMAIL) || '').trim();
    // CC list: optional array of email strings passed by callers (replaces old global CEO CC)
    const ccList = (Array.isArray(ccEmails) ? ccEmails : []).map(e => String(e || '').trim()).filter(Boolean);
    const ccEmail = ccList.length > 0 ? ccList.join(', ') : '';

    const smtpHost = String(process.env.SMTP_HOST || '').trim();
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASS || '').trim();

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.error('SMTP env vars missing (SMTP_HOST/SMTP_USER/SMTP_PASS). Cannot send email with attachments.');
        return { ok: false, errorCode: 'SMTP_NOT_CONFIGURED' };
    }

    const shouldSendRealEmail = isProduction || FORCE_SEND_EMAIL_ALL;

    if (!shouldSendRealEmail) {
        console.log('--- EMAIL Nodemailer Simulation (Dev Mode) ---');
        console.log('To:', maskEmailForLog(email));
        console.log('Label:', String(logLabel || '').trim() || 'NODEMAILER');
        console.log('Subject:', truncateForLog(String(subject || ''), 200));
        console.log('Attachments:', (attachments || []).map(a => a.filename).join(', '));
        console.log('----------------------------------------------');
        return { ok: true, simulated: true, mode: 'nodemailer' };
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });

        const mailOptions = {
            from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
            to: email,
            ...(ccEmail && ccEmail.toLowerCase() !== email.toLowerCase() ? { cc: ccEmail } : {}),
            subject: String(subject || '').trim(),
            html: String(htmlBody || ''),
            attachments: (attachments || []).map(att => ({
                filename: att.filename,
                content: att.content,
                contentType: att.contentType || 'application/pdf',
            })),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Nodemailer email sent to ${maskEmailForLog(email)} (${String(logLabel || 'EMAIL').trim()}) messageId=${info.messageId}`);
        return { ok: true, mode: 'nodemailer', messageId: info.messageId };
    } catch (e) {
        console.error('Nodemailer send exception:', e?.message || e);
        return { ok: false, errorCode: 'EMAIL_SEND_FAILED', details: { error: e?.message } };
    }
}

// ── Template builders removed — templates are now loaded from email_templates DB table ──

function replaceEmailPlaceholders(template, fields) {
    const safeRecipient = escapeHtml(String(fields.recipient_name || '').trim());
    const safeDocument = escapeHtml(String(fields.document_name || '').trim());
    const safeManager = escapeHtml(String(fields.manager_name || '').trim());
    const safeLawyer = escapeHtml(String(fields.lawyer_name || '').trim());
    const safeCaseTitle = escapeHtml(String(fields.case_title || '').trim());
    const safeCaseNumber = escapeHtml(String(fields.case_number || '').trim());
    const safeCaseStage = escapeHtml(String(fields.case_stage || '').trim());
    const safeRejection = escapeHtml(String(fields.rejection_reason || '').trim());

    const urlRaw = String(fields.action_url || '').trim();
    const safeUrl = escapeHtml(urlRaw);

    const signedDocUrl = escapeHtml(String(fields.signed_document_url || '').trim());
    const evidenceUrl = escapeHtml(String(fields.evidence_certificate_url || '').trim());
    const safeFirmName = escapeHtml(String(fields.firm_name || '').trim());

    let out = String(template || '');
    out = replaceAllSafe(out, '[[recipient_name]]', safeRecipient);
    out = replaceAllSafe(out, '[[document_name]]', safeDocument);
    out = replaceAllSafe(out, '[[manager_name]]', safeManager);
    out = replaceAllSafe(out, '[[lawyer_name]]', safeLawyer);
    out = replaceAllSafe(out, '[[case_title]]', safeCaseTitle);
    out = replaceAllSafe(out, '[[case_number]]', safeCaseNumber);
    out = replaceAllSafe(out, '[[case_stage]]', safeCaseStage);
    out = replaceAllSafe(out, '[[rejection_reason]]', safeRejection);
    out = replaceAllSafe(out, '[[action_url]]', safeUrl);
    out = replaceAllSafe(out, '[[signed_document_url]]', signedDocUrl);
    out = replaceAllSafe(out, '[[evidence_certificate_url]]', evidenceUrl);
    out = replaceAllSafe(out, '[[firm_name]]', safeFirmName);
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

function maskEmailForLog(email) {
    const e = String(email || '').trim();
    if (!e) return '(empty)';
    const atIdx = e.indexOf('@');
    if (atIdx < 0) return e.slice(0, 3) + '***';
    const local = e.slice(0, atIdx);
    const domain = e.slice(atIdx);
    const visible = Math.min(3, local.length);
    return local.slice(0, visible) + '***' + domain;
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

module.exports = {
    sendEmailCampaign,
    sendTransactionalCustomHtmlEmail,
    sendEmailWithAttachments,
    COMPANY_NAME,
    WEBSITE_DOMAIN,
    isProduction,
    FORCE_SEND_EMAIL_ALL,
};

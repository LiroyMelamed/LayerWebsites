const { sendEmailWithAttachments } = require('../../utils/smooveEmailCampaignService');
const settingsService = require('../../services/settingsService');
const { getPayUrl } = require('./tenantBillingDefaults');
const { wrapEmailHtml } = require('../../tasks/emailReminders/templates');
const { getBillingEmailBrandingFromEnv } = require('./billingEmailBranding');

const FAILED_PAYMENT_TITLE = 'חיוב המנוי נכשל';

function formatDeadline(date) {
    if (!date) return '';
    try {
        return new Intl.DateTimeFormat('he-IL', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(date));
    } catch {
        return String(date);
    }
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildFailedPaymentHtml({
    amountIls,
    last4,
    graceUntil,
    errorMessage,
    payUrl,
    firmName = '',
    firmLogoUrl = '',
} = {}) {
    const deadline = formatDeadline(graceUntil);
    const card = last4 ? `**** ${last4}` : 'לא שמור כרטיס';
    const err = escapeHtml(errorMessage || 'החיוב נכשל');
    const safePayUrl = escapeHtml(payUrl);
    const bodyHtml =
        'שלום,<br><br>' +
        'ניסיון לגבות את דמי המנוי החודשיים נכשל.<br>' +
        `סכום: <strong>₪${Number(amountIls || 0).toFixed(2)}</strong><br>` +
        `כרטיס: <strong>${escapeHtml(card)}</strong><br>` +
        `סיבה: ${err}<br><br>` +
        `יש להשלים תשלום עד <strong>${escapeHtml(deadline)}</strong>. לאחר מכן הגישה למערכת תיחסם.` +
        '<div style="margin:22px 0;">' +
        `<a href="${safePayUrl}" style="display:inline-block;background:#2A4365;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">לתשלום עכשיו</a>` +
        '</div>';

    return wrapEmailHtml(bodyHtml, {
        firmName,
        firmLogoUrl,
        title: FAILED_PAYMENT_TITLE,
    });
}

function getBillingEmailBranding() {
    return getBillingEmailBrandingFromEnv(process.env);
}

function parseBillingAlertEmails(raw) {
    return String(raw || '')
        .split(/[,;\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((email) => email.includes('@'));
}

async function collectBillingRecipients() {
    const emails = new Set();
    try {
        const admins = await settingsService.getPlatformAdmins();
        for (const a of admins || []) {
            const email = String(a.email || '').trim();
            if (email && email.includes('@')) emails.add(email.toLowerCase());
        }
    } catch (e) {
        console.warn('[billing-email] platform admins lookup failed:', e?.message);
    }
    for (const email of parseBillingAlertEmails(process.env.BILLING_ALERT_EMAIL)) {
        emails.add(email);
    }
    return [...emails];
}

async function sendFailedPaymentEmails({ amountIls, last4, graceUntil, errorMessage } = {}) {
    const payUrl = getPayUrl();
    const { firmName, firmLogoUrl } = getBillingEmailBranding();
    const html = buildFailedPaymentHtml({
        amountIls,
        last4,
        graceUntil,
        errorMessage,
        payUrl,
        firmName,
        firmLogoUrl,
    });
    const recipients = await collectBillingRecipients();
    if (recipients.length === 0) {
        console.warn('[billing-email] no recipients for failed payment');
        return { ok: false, errorCode: 'NO_RECIPIENTS' };
    }

    const results = [];
    for (const toEmail of recipients) {
        const r = await sendEmailWithAttachments({
            toEmail,
            subject: 'חיוב המנוי נכשל — נדרש תשלום תוך 72 שעות',
            htmlBody: html,
            logLabel: 'BILLING_PAYMENT_FAILED',
            fromName: 'MelaMedia Billing',
        });
        results.push({ toEmail, ...r });
    }
    return { ok: results.some((r) => r.ok), results };
}

module.exports = {
    sendFailedPaymentEmails,
    collectBillingRecipients,
    buildFailedPaymentHtml,
    getBillingEmailBranding,
    parseBillingAlertEmails,
};

const { sendEmailWithAttachments } = require('../../utils/smooveEmailCampaignService');
const settingsService = require('../../services/settingsService');
const { getPayUrl } = require('./tenantBillingDefaults');

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

function buildFailedPaymentHtml({ amountIls, last4, graceUntil, errorMessage, payUrl }) {
    const deadline = formatDeadline(graceUntil);
    const card = last4 ? `**** ${last4}` : 'לא שמור כרטיס';
    const err = String(errorMessage || 'החיוב נכשל').replace(/</g, '');
    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EDF2F7;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF2F7;"><tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#fff;border-radius:16px;">
<tr><td style="background:#9B2C2C;padding:22px 24px;color:#fff;font-family:system-ui,sans-serif;font-size:18px;font-weight:600;">חיוב המנוי נכשל</td></tr>
<tr><td style="padding:26px 24px;font-family:system-ui,sans-serif;color:#2D3748;font-size:16px;line-height:1.7;">
שלום,<br><br>
ניסיון לגבות את דמי המנוי החודשיים נכשל.<br>
סכום: <strong>₪${Number(amountIls || 0).toFixed(2)}</strong><br>
כרטיס: <strong>${card}</strong><br>
סיבה: ${err}<br><br>
יש להשלים תשלום עד <strong>${deadline}</strong>. לאחר מכן הגישה למערכת תיחסם.
<div style="margin:22px 0;">
<a href="${payUrl}" style="display:inline-block;background:#2A4365;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">לתשלום עכשיו</a>
</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
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
    const alert = String(process.env.BILLING_ALERT_EMAIL || '').trim();
    if (alert && alert.includes('@')) emails.add(alert.toLowerCase());
    return [...emails];
}

async function sendFailedPaymentEmails({ amountIls, last4, graceUntil, errorMessage } = {}) {
    const payUrl = getPayUrl();
    const html = buildFailedPaymentHtml({ amountIls, last4, graceUntil, errorMessage, payUrl });
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
};

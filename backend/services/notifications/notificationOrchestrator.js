const pool = require('../../config/db');
const sendAndStoreNotification = require('../../utils/sendAndStoreNotification');
const { sendMessage } = require('../../utils/sendMessage');
const { sendEmailCampaign } = require('../../utils/smooveEmailCampaignService');
const { formatPhoneNumber } = require('../../utils/phoneUtils');

function isExpoPushToken(token) {
    const t = String(token || '').trim();
    return /^ExponentPushToken\[[^\]]+\]$/.test(t) || /^ExpoPushToken\[[^\]]+\]$/.test(t);
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

function maskPhoneForLog(phone) {
    const p = String(phone || '').replace(/\D/g, '');
    if (!p) return '[redacted-phone]';
    const last2 = p.slice(-2);
    return `***${last2}`;
}

async function getUserContactById(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const res = await pool.query(
        'SELECT userid as "UserId", name as "Name", email as "Email", phonenumber as "PhoneNumber" FROM users WHERE userid = $1',
        [id]
    );

    if (!res.rows?.length) return null;
    const row = res.rows[0];

    return {
        userId: Number(row.UserId) || id,
        name: String(row.Name || '').trim(),
        email: String(row.Email || '').trim(),
        phoneNumber: String(row.PhoneNumber || '').trim(),
    };
}

async function userHasValidPush(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const res = await pool.query(
        'SELECT FcmToken FROM UserDevices WHERE UserId = $1 AND FcmToken IS NOT NULL',
        [id]
    );

    const tokens = (res.rows || []).map((r) => String(r.fcmtoken || r.FcmToken || '').trim()).filter(Boolean);
    return tokens.some(isExpoPushToken);
}

function isOtpNotificationType(notificationType) {
    const t = String(notificationType || '').trim().toUpperCase();
    return t === 'OTP' || t.endsWith('_OTP') || t.startsWith('OTP_');
}

function getContactFieldKeys(contactFields) {
    if (!contactFields || typeof contactFields !== 'object' || Array.isArray(contactFields)) return [];
    return Object.keys(contactFields).sort();
}

/**
 * Notification Orchestrator
 *
 * Rule (non-OTP):
 * - if recipient has valid push token => send PUSH + EMAIL
 * - else => send EMAIL + SMS
 *
 * OTP must be SMS-only and should NOT use this orchestrator.
 */
async function notifyRecipient({
    recipientUserId,
    recipientEmail,
    recipientPhone,
    notificationType,
    push,
    email,
    sms,
} = {}) {
    const type = String(notificationType || '').trim();

    if (!type) {
        return { ok: false, errorCode: 'MISSING_NOTIFICATION_TYPE' };
    }

    if (isOtpNotificationType(type)) {
        return { ok: false, errorCode: 'OTP_NOT_ALLOWED', error: 'OTP notifications must be SMS-only and must not use notificationOrchestrator' };
    }

    let resolvedEmail = String(recipientEmail || '').trim();
    let resolvedPhone = String(recipientPhone || '').trim();
    let resolvedUser = null;

    if (recipientUserId && (!resolvedEmail || !resolvedPhone || !resolvedUser)) {
        try {
            resolvedUser = await getUserContactById(recipientUserId);
            if (!resolvedEmail && resolvedUser?.email) resolvedEmail = resolvedUser.email;
            if (!resolvedPhone && resolvedUser?.phoneNumber) resolvedPhone = resolvedUser.phoneNumber;
        } catch {
            // Best-effort; continue without DB contact info.
        }
    }

    const hasPush = recipientUserId ? await userHasValidPush(recipientUserId) : false;

    const wantPush = Boolean(hasPush && push && recipientUserId);
    const wantEmail = Boolean(email && resolvedEmail);
    const wantSms = Boolean(!hasPush && sms && resolvedPhone);

    const outcomes = {
        decision: hasPush ? 'PUSH_EMAIL' : 'EMAIL_SMS',
        push: { attempted: wantPush, ok: null },
        email: { attempted: wantEmail, ok: null },
        sms: { attempted: wantSms, ok: null },
    };

    const errors = [];

    // Log only keys / outcomes, and mask PII.
    console.log(
        JSON.stringify({
            event: 'notify_orchestrator_attempt',
            type,
            decision: outcomes.decision,
            recipientUserId: recipientUserId ? Number(recipientUserId) : null,
            email: resolvedEmail ? maskEmailForLog(resolvedEmail) : null,
            phone: resolvedPhone ? maskPhoneForLog(resolvedPhone) : null,
            contactFieldKeys: getContactFieldKeys(email?.contactFields),
            channels: {
                push: outcomes.push.attempted,
                email: outcomes.email.attempted,
                sms: outcomes.sms.attempted,
            },
        })
    );

    const tasks = [];

    if (wantPush) {
        tasks.push(
            (async () => {
                try {
                    await sendAndStoreNotification(
                        Number(recipientUserId),
                        String(push.title || '').trim(),
                        String(push.body || '').trim(),
                        push.data || {}
                    );
                    outcomes.push.ok = true;
                } catch (e) {
                    outcomes.push.ok = false;
                    errors.push({ channel: 'push', error: e?.message || 'push_failed' });
                }
            })()
        );
    }

    if (wantEmail) {
        tasks.push(
            (async () => {
                try {
                    const r = await sendEmailCampaign({
                        toEmail: resolvedEmail,
                        campaignKey: String(email.campaignKey || '').trim(),
                        contactFields: email.contactFields || {},
                    });
                    outcomes.email.ok = Boolean(r?.ok);
                    if (!r?.ok) {
                        errors.push({ channel: 'email', errorCode: r?.errorCode || 'EMAIL_FAILED' });
                    }
                } catch (e) {
                    outcomes.email.ok = false;
                    errors.push({ channel: 'email', error: e?.message || 'email_failed' });
                }
            })()
        );
    }

    if (wantSms) {
        tasks.push(
            (async () => {
                try {
                    const formatted = formatPhoneNumber(resolvedPhone);
                    if (!formatted) {
                        outcomes.sms.ok = false;
                        errors.push({ channel: 'sms', error: 'invalid_phone' });
                        return;
                    }
                    await sendMessage(String(sms.messageBody || '').trim(), formatted);
                    outcomes.sms.ok = true;
                } catch (e) {
                    outcomes.sms.ok = false;
                    errors.push({ channel: 'sms', error: e?.message || 'sms_failed' });
                }
            })()
        );
    }

    await Promise.allSettled(tasks);

    const anyOk = [outcomes.push, outcomes.email, outcomes.sms]
        .filter((c) => c.attempted)
        .some((c) => c.ok === true);

    console.log(
        JSON.stringify({
            event: 'notify_orchestrator_result',
            type,
            decision: outcomes.decision,
            channels: {
                push: outcomes.push,
                email: outcomes.email,
                sms: outcomes.sms,
            },
            ok: anyOk,
            errorCount: errors.length,
        })
    );

    if (!anyOk) {
        return { ok: false, errorCode: 'ALL_CHANNELS_FAILED', outcomes, errors };
    }

    return { ok: true, outcomes, errors: errors.length ? errors : undefined };
}

module.exports = { notifyRecipient };

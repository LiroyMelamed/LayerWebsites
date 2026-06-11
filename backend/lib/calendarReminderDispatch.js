/**
 * Multi-channel dispatch for calendar event reminders.
 */

const pool = require('../config/db');
const sendAndStoreNotification = require('../utils/sendAndStoreNotification');
const { sendMessage } = require('../utils/sendMessage');
const { sendTransactionalCustomHtmlEmail } = require('../utils/smooveEmailCampaignService');
const { formatPhoneNumber } = require('../utils/phoneUtils');
const { getChannelConfig } = require('../services/settingsService');
const { parseStoredChannels } = require('./calendarEventReminders');

const NOTIFICATION_TYPE = 'CALENDAR_REMINDER';

async function _getUserContact(userId) {
    if (!userId) return null;
    const { rows } = await pool.query(
        `SELECT userid, name, email, phonenumber FROM users WHERE userid = $1`,
        [userId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        userId: r.userid,
        name: r.name || '',
        email: String(r.email || '').trim(),
        phone: String(r.phonenumber || '').trim(),
    };
}

/**
 * Send a reminder to one recipient on the channels selected on the event,
 * gated by firm notification_channel_config for CALENDAR_REMINDER.
 */
async function dispatchCalendarReminder({
    userId = null,
    email = null,
    phone = null,
    eventChannels,
    eventType = null,
    title,
    body,
    payload = {},
}) {
    const selected = parseStoredChannels(eventChannels);
    if (eventType && eventType !== 'reminder') {
        selected.push = false;
    }
    const firmCfg = await getChannelConfig(NOTIFICATION_TYPE);

    let resolvedEmail = String(email || '').trim();
    let resolvedPhone = String(phone || '').trim();

    if (userId && (!resolvedEmail || !resolvedPhone)) {
        const contact = await _getUserContact(userId);
        if (contact) {
            if (!resolvedEmail) resolvedEmail = contact.email;
            if (!resolvedPhone) resolvedPhone = contact.phone;
        }
    }

    const wantPush = selected.push && firmCfg.push_enabled && userId;
    const wantSms = selected.sms && firmCfg.sms_enabled && resolvedPhone;
    const wantEmail = selected.email && firmCfg.email_enabled && resolvedEmail;

    const tasks = [];

    if (wantPush) {
        tasks.push(
            sendAndStoreNotification(userId, title, body, payload).catch((err) => {
                console.error(`[calendar-reminders] push failed userId=${userId}:`, err.message);
                throw err;
            })
        );
    } else if (userId && title && body && (wantSms || wantEmail)) {
        tasks.push(
            sendAndStoreNotification(userId, title, body, payload, { sendPush: false }).catch(() => { })
        );
    }

    if (wantSms) {
        tasks.push(
            (async () => {
                const formatted = formatPhoneNumber(resolvedPhone);
                if (!formatted) throw new Error('invalid_phone');
                await sendMessage(body, formatted);
            })()
        );
    }

    if (wantEmail) {
        tasks.push(
            sendTransactionalCustomHtmlEmail({
                toEmail: resolvedEmail,
                subject: title,
                htmlBody: `<div dir="rtl" style="font-family:Arial,sans-serif">${body.replace(/\n/g, '<br>')}</div>`,
                logLabel: 'CALENDAR_REMINDER',
            }).then((r) => {
                if (!r?.ok) throw new Error(r?.errorCode || 'email_failed');
            })
        );
    }

    if (!tasks.length) return { sent: false, reason: 'no_channels_or_contact' };

    await Promise.all(tasks);
    return { sent: true, channels: { push: wantPush, sms: wantSms, email: wantEmail } };
}

module.exports = {
    NOTIFICATION_TYPE,
    dispatchCalendarReminder,
};

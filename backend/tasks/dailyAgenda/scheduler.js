'use strict';

/**
 * Daily agenda digest — per lawyer/admin settings in user_daily_agenda_settings.
 * Runs every 5 minutes; each user is sent once per Israel calendar day at their send_time.
 */

const cron = require('node-cron');
const pool = require('../../config/db');
const { sendMessage } = require('../../utils/sendMessage');
const { sendTransactionalCustomHtmlEmail } = require('../../utils/smooveEmailCampaignService');
const sendAndStoreNotification = require('../../utils/sendAndStoreNotification');
const { personalCalendarSql } = require('../../lib/calendarVisibility');

function _israelNowParts() {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        hhmm: `${parts.hour}:${parts.minute}`,
    };
}

function _parseRecipients(raw) {
    return String(raw || '')
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function _parseChannels(raw) {
    const set = new Set(
        String(raw || 'email')
            .toLowerCase()
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
    );
    return {
        push: set.has('push'),
        email: set.has('email'),
        sms: set.has('sms'),
    };
}

function _isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function _formatEventLine(ev) {
    const start = new Date(ev.start_time).toLocaleTimeString('he-IL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem',
    });
    const end = new Date(ev.end_time).toLocaleTimeString('he-IL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem',
    });
    const invite = ev.invite_status && ev.invite_status !== 'none' ? ` [${ev.invite_status}]` : '';
    const loc = ev.location ? ` @ ${ev.location}` : '';
    return `${start}–${end} ${ev.title || 'אירוע'}${loc}${invite}`;
}

function _resolveRecipients(row, channels) {
    const explicit = _parseRecipients(row.recipients);
    if (explicit.length) return explicit;
    const out = [];
    if (channels.email && row.email) out.push(String(row.email).trim());
    if (channels.sms && row.phonenumber) out.push(String(row.phonenumber).trim());
    return out.filter(Boolean);
}

async function _sendForUser(row, date) {
    const channels = _parseChannels(row.channels);
    if (!channels.email && !channels.sms && !channels.push) return false;

    const recipients = _resolveRecipients(row, channels);
    // Push alone is enough even without email/phone recipients.
    if (!recipients.length && !channels.push) return false;

    const { rows: events } = await pool.query(
        `SELECT ce.title, ce.location, ce.start_time, ce.end_time, ce.invite_status
         FROM calendar_events ce
         WHERE ${personalCalendarSql(2)}
           AND ce.start_time >= ($1::date AT TIME ZONE 'Asia/Jerusalem')
           AND ce.start_time < (($1::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Jerusalem')
           AND ce.event_type NOT IN ('leave')
         ORDER BY ce.start_time ASC
         LIMIT 200`,
        [date, row.user_id]
    );

    const lines = events.length
        ? events.map(_formatEventLine)
        : ['אין אירועים להיום'];
    const body = `יומן ליום ${date}\n\n${lines.join('\n')}`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h3>יומן ליום ${date}</h3><pre style="font-family:inherit;white-space:pre-wrap">${lines.join('\n')}</pre></div>`;
    const pushBody = events.length
        ? `${events.length} אירועים להיום`
        : 'אין אירועים להיום';

    let sentAny = false;

    if (channels.push) {
        try {
            await sendAndStoreNotification(
                row.user_id,
                `יומן יומי — ${date}`,
                pushBody,
                { type: 'DAILY_AGENDA', date },
                { sendPush: true }
            );
            sentAny = true;
        } catch (err) {
            console.error('[daily-agenda] push failed user=', row.user_id, err.message);
        }
    }

    for (const recipient of recipients) {
        try {
            const isMail = _isEmail(recipient);
            if (channels.email && isMail) {
                await sendTransactionalCustomHtmlEmail({
                    toEmail: recipient,
                    subject: `יומן יומי — ${date}`,
                    htmlBody: html,
                    logLabel: 'daily-agenda',
                });
                sentAny = true;
            } else if (channels.sms && !isMail) {
                await sendMessage(body, recipient);
                sentAny = true;
            } else if (channels.email && !isMail && channels.sms) {
                await sendMessage(body, recipient);
                sentAny = true;
            }
        } catch (err) {
            console.error('[daily-agenda] send failed user=', row.user_id, 'to=', recipient, err.message);
        }
    }
    return sentAny;
}

async function processDailyAgendaDigest() {
    const { date, hhmm } = _israelNowParts();

    let rows;
    try {
        const result = await pool.query(
            `SELECT s.user_id, s.enabled, s.channels, s.recipients, s.send_time, s.last_sent_date,
                    u.email, u.phonenumber, u.name
             FROM user_daily_agenda_settings s
             JOIN users u ON u.userid = s.user_id
             WHERE s.enabled = TRUE
               AND COALESCE(u.role, '') IN ('Admin', 'Lawyer', 'PlatformAdmin')`
        );
        rows = result.rows;
    } catch (err) {
        // Table may not exist yet on a rolling deploy.
        if (err?.code === '42P01') return;
        throw err;
    }

    for (const row of rows) {
        const sendTime = String(row.send_time || '07:30').trim().slice(0, 5);
        if (hhmm < sendTime) continue;
        if (String(row.last_sent_date || '') === date) continue;

        try {
            const sent = await _sendForUser(row, date);
            if (!sent) continue;
            await pool.query(
                `UPDATE user_daily_agenda_settings
                 SET last_sent_date = $2, updated_at = NOW()
                 WHERE user_id = $1`,
                [row.user_id, date]
            );
            console.log(`[daily-agenda] sent for ${date} user=${row.user_id}`);
        } catch (err) {
            console.error('[daily-agenda] user tick failed', row.user_id, err.message);
        }
    }
}

function startDailyAgendaScheduler() {
    cron.schedule('*/5 * * * *', () => {
        processDailyAgendaDigest().catch((err) => {
            console.error('[daily-agenda] tick failed:', err.message);
        });
    });
    console.log('[daily-agenda] scheduler started (every 5 min, per-user)');
}

module.exports = {
    processDailyAgendaDigest,
    startDailyAgendaScheduler,
};

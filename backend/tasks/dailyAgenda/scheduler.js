'use strict';

/**
 * Daily agenda digest — sends today's calendar summary to configured recipients.
 * Runs every 5 minutes; sends once per Israel calendar day at DAILY_AGENDA_SEND_TIME.
 */

const cron = require('node-cron');
const pool = require('../../config/db');
const settingsService = require('../../services/settingsService');
const { sendMessage } = require('../../utils/sendMessage');
const { sendTransactionalCustomHtmlEmail } = require('../../utils/smooveEmailCampaignService');

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

async function processDailyAgendaDigest() {
    const enabled = String(await settingsService.getSetting('calendar', 'DAILY_AGENDA_ENABLED', 'false')).toLowerCase() === 'true';
    if (!enabled) return;

    const sendTime = String(await settingsService.getSetting('calendar', 'DAILY_AGENDA_SEND_TIME', '07:30') || '07:30').trim();
    const { date, hhmm } = _israelNowParts();
    if (hhmm < sendTime.slice(0, 5)) return;

    const lastSent = String(await settingsService.getSetting('calendar', 'DAILY_AGENDA_LAST_SENT_DATE', '') || '');
    if (lastSent === date) return;

    const recipients = _parseRecipients(await settingsService.getSetting('calendar', 'DAILY_AGENDA_RECIPIENTS', ''));
    if (!recipients.length) return;

    const channelsRaw = String(await settingsService.getSetting('calendar', 'DAILY_AGENDA_CHANNELS', 'email') || 'email').toLowerCase();
    const wantEmail = channelsRaw.includes('email');
    const wantSms = channelsRaw.includes('sms');

    const { rows } = await pool.query(
        `SELECT title, location, start_time, end_time, invite_status
         FROM calendar_events
         WHERE start_time >= ($1::date)
           AND start_time < ($1::date + INTERVAL '1 day')
           AND event_type NOT IN ('leave')
         ORDER BY start_time ASC
         LIMIT 200`,
        [date]
    );

    const lines = rows.length
        ? rows.map(_formatEventLine)
        : ['אין אירועים להיום'];
    const body = `יומן ליום ${date}\n\n${lines.join('\n')}`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h3>יומן ליום ${date}</h3><pre style="font-family:inherit;white-space:pre-wrap">${lines.join('\n')}</pre></div>`;

    for (const recipient of recipients) {
        try {
            if (wantEmail && _isEmail(recipient)) {
                await sendTransactionalCustomHtmlEmail({
                    toEmail: recipient,
                    subject: `יומן יומי — ${date}`,
                    htmlBody: html,
                    logLabel: 'daily-agenda',
                });
            } else if (wantSms && !_isEmail(recipient)) {
                await sendMessage(body, recipient);
            } else if (wantSms && _isEmail(recipient) && !wantEmail) {
                // skip
            } else if (wantEmail && !_isEmail(recipient) && wantSms) {
                await sendMessage(body, recipient);
            }
        } catch (err) {
            console.error('[daily-agenda] send failed to', recipient, err.message);
        }
    }

    await settingsService.upsertSetting('calendar', 'DAILY_AGENDA_LAST_SENT_DATE', date, { updatedBy: null });
    console.log(`[daily-agenda] sent for ${date} to ${recipients.length} recipients`);
}

function startDailyAgendaScheduler() {
    cron.schedule('*/5 * * * *', () => {
        processDailyAgendaDigest().catch((err) => {
            console.error('[daily-agenda] tick failed:', err.message);
        });
    });
    console.log('[daily-agenda] scheduler started (every 5 min)');
}

module.exports = {
    processDailyAgendaDigest,
    startDailyAgendaScheduler,
};

'use strict';

/**
 * Daily agenda digest — per lawyer/admin settings in user_daily_agenda_settings.
 * Runs every 5 minutes; each user is sent once per Israel calendar day at their send_time.
 */

const cron = require('node-cron');
const crypto = require('node:crypto');
const pool = require('../../config/db');
const { sendMessage } = require('../../utils/sendMessage');
const { sendTransactionalCustomHtmlEmail } = require('../../utils/smooveEmailCampaignService');
const sendAndStoreNotification = require('../../utils/sendAndStoreNotification');
const { personalCalendarSql } = require('../../lib/calendarVisibility');
const { listHolidaysInRange } = require('../../lib/hebcalHolidays');

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

function _eventTypePrefix(eventType) {
    const map = {
        leave: '[חופשה]',
        holiday: '[חג]',
        reminder: '[תזכורת]',
        hearing: '[דיון]',
        appointment: '[פגישה]',
    };
    return map[String(eventType || '').toLowerCase()] || '';
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
    const prefix = _eventTypePrefix(ev.event_type);
    const title = ev.title || 'אירוע';
    return `${start}–${end} ${prefix ? `${prefix} ` : ''}${title}${loc}${invite}`;
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
        `SELECT ce.title, ce.location, ce.start_time, ce.end_time, ce.invite_status, ce.event_type
         FROM calendar_events ce
         WHERE ${personalCalendarSql(2)}
           AND ce.end_time > ($1::date AT TIME ZONE 'Asia/Jerusalem')
           AND COALESCE(ce.event_status, 'scheduled') = 'scheduled'
           AND ce.start_time < (($1::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Jerusalem')
         ORDER BY ce.start_time ASC
         LIMIT 200`,
        [date, row.user_id]
    );

    let holidayLines = [];
    try {
        const holidays = await listHolidaysInRange(date, date);
        holidayLines = (holidays || []).map((h) => `[חג] ${h.title || h.titleEn || 'חג'}`);
    } catch (holidayErr) {
        console.warn('[dailyAgenda] holiday enrich failed:', holidayErr?.message || holidayErr);
    }

    const eventLines = events.length ? events.map(_formatEventLine) : [];
    const lines = [...holidayLines, ...eventLines];
    if (!lines.length) lines.push('אין אירועים להיום');
    const body = `יומן ליום ${date}\n\n${lines.join('\n')}`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h3>יומן ליום ${date}</h3><pre style="font-family:inherit;white-space:pre-wrap">${lines.join('\n')}</pre></div>`;
    const pushBody = (holidayLines.length + events.length) > 0
        ? `${holidayLines.length + events.length} פריטים ביומן להיום`
        : 'אין אירועים להיום';

    const jobs = [];
    if (channels.push) jobs.push({ channel: 'push', recipient: String(row.user_id), send: () => sendAndStoreNotification(row.user_id, `יומן יומי — ${date}`, pushBody, { type: 'DAILY_AGENDA', date }, { sendPush: true, throwOnError: true }) });
    for (const recipient of [...new Set(recipients)]) {
        if (channels.email && _isEmail(recipient)) jobs.push({ channel: 'email', recipient, send: () => sendTransactionalCustomHtmlEmail({ toEmail: recipient, subject: `יומן יומי — ${date}`, htmlBody: html, logLabel: 'daily-agenda' }) });
        if (channels.sms && !_isEmail(recipient)) jobs.push({ channel: 'sms', recipient, send: () => sendMessage(body, recipient) });
    }
    if (!jobs.length) return false;
    let complete = true;
    for (const job of jobs) {
        const hash = crypto.createHash('sha256').update(job.recipient.trim().toLowerCase()).digest('hex').slice(0,24);
        const key = `${date}:${job.channel}:${hash}`;
        const { rows } = await pool.query('SELECT delivery_receipts FROM user_daily_agenda_settings WHERE user_id=$1', [row.user_id]);
        const receipt = rows[0]?.delivery_receipts?.[key];
        if (receipt?.status === 'sent') continue;
        if (['sending','uncertain'].includes(receipt?.status)) {
            complete = false;
            console.error('[daily-agenda] uncertain delivery needs inspection user=', row.user_id, 'channel=', job.channel);
            continue;
        }
        const write = async (status, error = null) => pool.query(`UPDATE user_daily_agenda_settings SET delivery_receipts=COALESCE(delivery_receipts,'{}'::jsonb)||jsonb_build_object($2::text,$3::jsonb),updated_at=NOW() WHERE user_id=$1`, [row.user_id, key, JSON.stringify({ status, channel: job.channel, date, at: new Date().toISOString(), error })]);
        await write('sending');
        try {
            const result = await job.send();
            if (job.channel !== 'push' && !result?.ok) {
                const error = new Error(result?.errorCode || result?.error || 'provider_rejected');
                error.providerRejected = true;
                throw error;
            }
            await write('sent');
        } catch (err) {
            complete = false;
            const uncertain = !err.providerRejected && (['ECONNRESET','ETIMEDOUT','ECONNABORTED'].includes(err.code) || /timeout|socket hang up/i.test(err.message));
            await write(uncertain ? 'uncertain' : 'failed', uncertain ? 'delivery_acceptance_unknown' : 'delivery_failed');
            console.error('[daily-agenda] send failed user=', row.user_id, 'channel=', job.channel, err.message);
        }
    }
    return complete;

}

async function processDailyAgendaDigest() {
    const { date, hhmm } = _israelNowParts();

    let rows;
    try {
        const result = await pool.query(
            `SELECT s.user_id, s.enabled, s.channels, s.recipients, s.send_time, s.last_sent_date, s.delivery_receipts,
                    u.email, u.phonenumber, u.name
             FROM user_daily_agenda_settings s
             JOIN users u ON u.userid = s.user_id
             WHERE s.enabled = TRUE
               AND COALESCE(u.role, '') IN ('Admin', 'Lawyer', 'PlatformAdmin', 'Staff')
               AND s.last_sent_date::text IS DISTINCT FROM (NOW() AT TIME ZONE 'Asia/Jerusalem')::date::text`
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

        const lock = await pool.connect();
        try {
            // Reserve only this user's digest while concurrent workers are active.
            const { rows: locks } = await lock.query('SELECT pg_try_advisory_lock(71920, $1::int) AS acquired', [row.user_id]);
            if (!locks[0]?.acquired) continue;
            const { rows: current } = await lock.query('SELECT last_sent_date::text AS last_sent_date, enabled FROM user_daily_agenda_settings WHERE user_id=$1', [row.user_id]);
            if (!current[0]?.enabled || current[0]?.last_sent_date === date) continue;
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
        } finally {
            await lock.query('SELECT pg_advisory_unlock(71920, $1::int)', [row.user_id]).catch(() => {});
            lock.release();
        }
    }
}

function startDailyAgendaScheduler() {
    cron.schedule('*/5 * * * *', () => {
        require('../../lib/tenant/officeJobs').forEachOffice(processDailyAgendaDigest).catch((err) => {
            console.error('[daily-agenda] tick failed:', err.message);
        });
    });
    console.log('[daily-agenda] scheduler started (every 5 min, per-user)');
}

module.exports = {
    processDailyAgendaDigest,
    startDailyAgendaScheduler,
};

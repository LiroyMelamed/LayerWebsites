/**
 * calendarReminders/scheduler.js
 *
 * Dispatches calendar event reminders from per-event lawyer/client offsets.
 * Shabbat quiet window (Fri 17:00 → Sat 20:30 Asia/Jerusalem): defer to Motzaei.
 */

'use strict';

const cron = require('node-cron');
const pool = require('../../config/db');
const settingsService = require('../../services/settingsService');
const {
    composeLawyerReminderMessage,
    composeClientReminderMessage,
    parseReminderTargets,
    parseStoredOffsets,
} = require('../../lib/calendarEventReminders');
const { dispatchCalendarReminder } = require('../../lib/calendarReminderDispatch');
const { effectiveFireAt } = require('../../lib/shabbatDeferral');

const DEEP_LINK_SCHEME = 'melamedia://appointment/';

function _buildDeepLinkPayload(eventId) {
    return {
        screen: 'appointment',
        eventId: String(eventId),
        url: `${DEEP_LINK_SCHEME}${eventId}`,
        deepLink: `${DEEP_LINK_SCHEME}${eventId}`,
    };
}

function _sentKey(role, offsetMinutes) {
    return `${role}:${offsetMinutes}`;
}

function _parseSentKeys(raw) {
    const keys = new Set();
    let list = raw;
    if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch { list = []; }
    }
    if (!Array.isArray(list)) return keys;
    for (const item of list) {
        if (typeof item === 'number' || (/^\d+$/.test(String(item)))) {
            // Legacy: numeric offset means both roles already sent.
            keys.add(_sentKey('lawyer', Number(item)));
            keys.add(_sentKey('client', Number(item)));
        } else {
            keys.add(String(item));
        }
    }
    return keys;
}

function _offsetsForRole(row, role) {
    const col = role === 'lawyer' ? row.lawyer_reminder_offsets : row.client_reminder_offsets;
    const parsed = parseStoredOffsets(col);
    if (parsed.length) return parsed;
    return parseStoredOffsets(row.reminder_offsets);
}

async function _enrichWithNames(rows) {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.id))];
    const { rows: enriched } = await pool.query(
        `
        SELECT ce.id,
               u_owner.name AS owner_name,
               COALESCE(u_client.name, ce.client_name) AS client_name
        FROM calendar_events ce
        LEFT JOIN users u_owner ON u_owner.userid = ce.owner_id
        LEFT JOIN users u_client ON u_client.userid = ce.client_user_id
        WHERE ce.id = ANY($1::int[])
        `,
        [ids]
    );
    const nameById = new Map(enriched.map((r) => [r.id, r]));

    // Multi-client names for lawyer SMS/email copy
    let clientsByEvent = new Map();
    try {
        const { rows: clientRows } = await pool.query(
            `SELECT cec.event_id, u.name
             FROM calendar_event_clients cec
             JOIN users u ON u.userid = cec.user_id
             WHERE cec.event_id = ANY($1::int[])
             ORDER BY cec.event_id, cec.sort_order, cec.user_id`,
            [ids]
        );
        for (const r of clientRows) {
            if (!clientsByEvent.has(r.event_id)) clientsByEvent.set(r.event_id, []);
            if (r.name) clientsByEvent.get(r.event_id).push(r.name);
        }
    } catch (err) {
        console.error('[calendar-reminders] multi-client enrich failed:', err.message);
    }

    return rows.map((r) => {
        const names = clientsByEvent.get(r.id) || [];
        const legacy = nameById.get(r.id)?.client_name || r.client_name || null;
        if (!names.length && legacy) names.push(legacy);
        return {
            ...r,
            owner_name: nameById.get(r.id)?.owner_name || null,
            client_name: names[0] || legacy || null,
            clients_names: names,
        };
    });
}

async function _eventHasClientAudience(ev) {
    if (ev.client_user_id || ev.lead_phone || ev.lead_email) return true;
    try {
        const { rows } = await pool.query(
            'SELECT 1 FROM calendar_event_clients WHERE event_id = $1 LIMIT 1',
            [ev.id]
        );
        return rows.length > 0;
    } catch {
        return false;
    }
}

async function _claimDueReminders(pollMinutes, limit = 200) {
    // Late-only grace: claim when fireAt is due or slightly overdue.
    // Do NOT look ahead by the poll interval (that caused "in 30 minutes" at +29 min early).
    const lateGrace = 5;
    const now = Date.now();
    const windowStart = now - lateGrace * 60 * 1000;
    const windowEnd = now;

    const { rows } = await pool.query(
        `
        SELECT ce.id,
               ce.owner_id,
               ce.manager_user_id,
               ce.client_user_id,
               ce.case_id,
               ce.title,
               ce.event_type,
               ce.location,
               ce.start_time,
               ce.lead_phone,
               ce.lead_email,
               ce.lead_name,
               ce.client_name,
               ce.reminder_channels,
               ce.reminder_targets,
               ce.reminder_offsets,
               ce.lawyer_reminder_offsets,
               ce.client_reminder_offsets,
               ce.invite_token,
               ce.client_reminder_sms,
               ce.reminders_sent_offsets AS prev_sent
        FROM calendar_events ce
        WHERE ce.event_type IN ('appointment', 'hearing', 'reminder')
          AND (
                jsonb_array_length(COALESCE(ce.lawyer_reminder_offsets, '[]'::jsonb)) > 0
             OR jsonb_array_length(COALESCE(ce.client_reminder_offsets, '[]'::jsonb)) > 0
             OR jsonb_array_length(COALESCE(ce.reminder_offsets, '[]'::jsonb)) > 0
          )
          AND (
                COALESCE(ce.reminder_channels->>'push', 'false') IN ('true', '1')
             OR COALESCE(ce.reminder_channels->>'sms', 'false') IN ('true', '1')
             OR COALESCE(ce.reminder_channels->>'email', 'false') IN ('true', '1')
          )
          AND ce.start_time > NOW() - INTERVAL '14 days'
          AND ce.start_time < NOW() + INTERVAL '14 days'
        ORDER BY ce.start_time ASC
        LIMIT 500
        `
    );

    const candidates = [];
    for (const row of rows) {
        const sent = _parseSentKeys(row.prev_sent);
        const targets = parseReminderTargets(row.reminder_targets);
        const roles = [];
        if (targets.managers) roles.push('lawyer');
        if (targets.client && row.event_type !== 'reminder') roles.push('client');

        for (const role of roles) {
            if (role === 'client' && !(await _eventHasClientAudience(row))) {
                continue;
            }
            for (const offsetMinutes of _offsetsForRole(row, role)) {
                const key = _sentKey(role, offsetMinutes);
                if (sent.has(key)) continue;
                const natural = new Date(new Date(row.start_time).getTime() - offsetMinutes * 60 * 1000);
                const fireAt = effectiveFireAt(natural);
                const t = fireAt.getTime();
                if (t >= windowStart && t <= windowEnd) {
                    candidates.push({
                        ...row,
                        role,
                        offset_minutes: offsetMinutes,
                        sent_key: key,
                        fire_at: fireAt,
                    });
                }
            }
        }
        if (candidates.length >= limit) break;
    }

    if (!candidates.length) return [];

    const dbClient = await pool.connect();
    const claimed = [];
    try {
        await dbClient.query('BEGIN');
        for (const row of candidates.slice(0, limit)) {
            const { rows: updated } = await dbClient.query(
                `
                UPDATE calendar_events
                SET reminders_sent_offsets = COALESCE(reminders_sent_offsets, '[]'::jsonb)
                    || to_jsonb($2::text)
                WHERE id = $1
                  AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($2::text)
                  AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($3::int)
                RETURNING id, owner_id, manager_user_id, client_user_id, case_id, title, event_type, location, start_time,
                          lead_phone, lead_email, lead_name, client_name, reminder_channels, reminder_targets,
                          invite_token, client_reminder_sms, reminders_sent_offsets
                `,
                [row.id, row.sent_key, row.offset_minutes]
            );
            if (updated.length) {
                claimed.push({
                    ...updated[0],
                    role: row.role,
                    offset_minutes: row.offset_minutes,
                    sent_key: row.sent_key,
                    prev_sent: row.prev_sent,
                });
            }
        }
        await dbClient.query('COMMIT');
    } catch (err) {
        try { await dbClient.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        dbClient.release();
    }

    return _enrichWithNames(claimed);
}

async function _revertSentKey(eventId, sentKey, prevSent) {
    try {
        let prev = [];
        if (Array.isArray(prevSent)) prev = prevSent;
        else if (typeof prevSent === 'string') {
            try { prev = JSON.parse(prevSent); } catch { prev = []; }
        }
        await pool.query(
            `UPDATE calendar_events SET reminders_sent_offsets = $2::jsonb WHERE id = $1`,
            [eventId, JSON.stringify(prev)]
        );
    } catch (err) {
        console.error(`[calendar-reminders] revert failed eventId=${eventId} key=${sentKey}:`, err.message);
    }
}

async function _resolveLawyerRecipients(ev) {
    const ids = new Set();
    try {
        const { rows } = await pool.query(
            'SELECT user_id FROM calendar_event_managers WHERE event_id = $1',
            [ev.id]
        );
        rows.forEach((r) => ids.add(r.user_id));
    } catch (err) {
        console.error(`[calendar-reminders] manager lookup failed eventId=${ev.id}:`, err.message);
    }
    if (ev.manager_user_id) ids.add(ev.manager_user_id);
    if (!ids.size && ev.owner_id) ids.add(ev.owner_id);
    return [...ids];
}

async function _resolveClientRecipients(ev) {
    const clients = [];
    try {
        const { rows } = await pool.query(
            `SELECT cec.user_id, u.phonenumber AS phone, u.email, u.name
             FROM calendar_event_clients cec
             JOIN users u ON u.userid = cec.user_id
             WHERE cec.event_id = $1
             ORDER BY cec.sort_order, cec.user_id`,
            [ev.id]
        );
        for (const r of rows) {
            clients.push({
                userId: r.user_id,
                phone: r.phone,
                email: r.email,
                name: r.name,
            });
        }
    } catch (err) {
        // Table may not exist yet on a tenant mid-migrate — fall back to legacy.
        console.error(`[calendar-reminders] clients lookup failed eventId=${ev.id}:`, err.message);
    }
    if (!clients.length && ev.client_user_id) {
        clients.push({ userId: ev.client_user_id, phone: null, email: null, name: ev.client_name });
    }
    if (!clients.length && (ev.lead_phone || ev.lead_email)) {
        clients.push({
            userId: null,
            phone: ev.lead_phone,
            email: ev.lead_email,
            name: ev.client_name || ev.lead_name,
        });
    }
    return clients;
}

async function _dispatchOne(ev) {
    const payload = _buildDeepLinkPayload(ev.id);
    const channels = ev.reminder_channels;

    if (ev.role === 'lawyer') {
        const lawyerMsg = await composeLawyerReminderMessage(ev.offset_minutes, ev);
        const lawyerIds = await _resolveLawyerRecipients(ev);
        if (!lawyerIds.length) return;
        let anySent = false;
        for (const lawyerId of lawyerIds) {
            try {
                const result = await dispatchCalendarReminder({
                    userId: lawyerId,
                    eventChannels: channels,
                    eventType: ev.event_type,
                    recipientRole: 'lawyer',
                    title: lawyerMsg.title,
                    body: lawyerMsg.body,
                    payload,
                    emailTemplateKey: 'CALENDAR_LAWYER_REMINDER',
                    emailEvent: ev,
                    emailOpts: {
                        clientsNames: ev.clients_names,
                        whenLabel: lawyerMsg.whenLabel,
                        bodyText: lawyerMsg.body.split('\n')[0] || lawyerMsg.body,
                    },
                });
                if (result.sent) anySent = true;
            } catch (err) {
                console.error(`[calendar-reminders] lawyer dispatch failed eventId=${ev.id} userId=${lawyerId}:`, err.message);
            }
        }
        if (!anySent) throw new Error('lawyer_reminder_not_sent');
        return;
    }

    // client role
    const recipients = await _resolveClientRecipients(ev);
    if (!recipients.length) return;

    const allClientNames = recipients.map((r) => r.name).filter(Boolean);
    if (Array.isArray(ev.clients_names) && ev.clients_names.length) {
        for (const n of ev.clients_names) {
            if (n && !allClientNames.includes(n)) allClientNames.push(n);
        }
    }

    let anySent = false;
    for (const recipient of recipients) {
        const clientMsg = await composeClientReminderMessage(ev.offset_minutes, {
            ...ev,
            client_name: recipient.name || ev.client_name || ev.lead_name,
            clients_names: allClientNames,
        });
        try {
            const result = await dispatchCalendarReminder({
                userId: recipient.userId,
                email: recipient.email,
                phone: recipient.phone,
                eventChannels: channels,
                eventType: ev.event_type,
                recipientRole: 'client',
                title: clientMsg.title,
                body: clientMsg.body,
                payload,
                emailTemplateKey: 'CALENDAR_REMINDER',
                emailEvent: {
                    ...ev,
                    client_name: recipient.name || ev.client_name || ev.lead_name,
                    clients_names: allClientNames,
                },
                emailOpts: {
                    recipientName: recipient.name || ev.client_name || ev.lead_name,
                    clientsNames: allClientNames,
                },
            });
            if (result.sent) anySent = true;
        } catch (err) {
            console.error(`[calendar-reminders] client dispatch failed eventId=${ev.id}:`, err.message);
        }
    }
    if (!anySent) throw new Error('client_reminder_not_sent');
}

async function _processClaimedRows(rows) {
    for (const ev of rows) {
        try {
            await _dispatchOne(ev);
            console.log(
                `[calendar-reminders] ${ev.sent_key} dispatched → eventId=${ev.id}`
            );
        } catch (err) {
            console.error(
                `[calendar-reminders] ${ev.sent_key} FAILED → eventId=${ev.id}:`,
                err.message
            );
            await _revertSentKey(ev.id, ev.sent_key, ev.prev_sent);
        }
    }
}

/** Flush invite SMS deferred past Shabbat / nighttime quiet windows. */
async function processDeferredInvites() {
    const { isInQuietWindow } = require('../../lib/shabbatDeferral');
    if (isInQuietWindow(new Date())) return;

    const { rows } = await pool.query(
        `SELECT id FROM calendar_events
         WHERE invite_deferred_until IS NOT NULL
           AND invite_deferred_until <= NOW()
         ORDER BY invite_deferred_until ASC
         LIMIT 50`
    );
    if (!rows.length) return;

    // Lazy-load to avoid circular require at module load.
    let sendFn = null;
    try {
        sendFn = require('../../controllers/calendarController').sendDeferredCalendarInvite;
    } catch (err) {
        console.error('[calendar-reminders] cannot load sendDeferredCalendarInvite:', err.message);
        return;
    }
    if (typeof sendFn !== 'function') return;

    for (const row of rows) {
        try {
            // Re-check at send time — never flush during a quiet window.
            if (isInQuietWindow(new Date())) return;
            await sendFn(row.id);
            await pool.query(
                `UPDATE calendar_events SET invite_deferred_until = NULL WHERE id = $1`,
                [row.id]
            );
        } catch (err) {
            console.error(`[calendar-reminders] deferred invite failed eventId=${row.id}:`, err.message);
        }
    }
}

async function processCalendarReminders() {
    const { pollMinutes } = await _readSchedulerSettings();
    try {
        const { warmShabbatCache } = require('../../lib/shabbatDeferral');
        await warmShabbatCache(new Date());
    } catch (err) {
        console.error('[calendar-reminders] Shabbat cache warm failed (using fail-closed fallback):', err.message);
    }

    let claimed;
    try {
        claimed = await _claimDueReminders(pollMinutes);
    } catch (err) {
        console.error('[calendar-reminders] claim phase failed:', err.message);
        return;
    }
    if (claimed.length) {
        console.log(`[calendar-reminders] claimed ${claimed.length} reminder(s)`);
        await _processClaimedRows(claimed);
    }
    try {
        await processDeferredInvites();
    } catch (err) {
        console.error('[calendar-reminders] deferred invites failed:', err.message);
    }
}

/**
 * Fire offset=0 ("מיידי") reminders immediately after create/update.
 * Respects quiet windows via effectiveFireAt — if deferred, leave for the poller.
 * Returns { attempted, sent, deferred, errors[] }.
 */
async function fireImmediateRemindersForEvent(eventId) {
    const id = parseInt(eventId, 10);
    const result = { attempted: 0, sent: 0, deferred: false, errors: [] };
    if (!Number.isFinite(id)) return result;

    const { rows } = await pool.query(
        `SELECT ce.*,
                ce.reminders_sent_offsets AS prev_sent
         FROM calendar_events ce
         WHERE ce.id = $1`,
        [id]
    );
    if (!rows.length) return result;
    const row = rows[0];
    if (!['appointment', 'hearing', 'reminder'].includes(String(row.event_type || ''))) {
        return result;
    }

    const { effectiveFireAt, deferQuietSendUntil } = require('../../lib/shabbatDeferral');
    const now = new Date();
    const quietUntil = deferQuietSendUntil(now);
    if (quietUntil) {
        result.deferred = true;
        return result;
    }

    const targets = parseReminderTargets(row.reminder_targets);
    const sent = _parseSentKeys(row.prev_sent);
    const jobs = [];

    if (targets.managers && _offsetsForRole(row, 'lawyer').includes(0)) {
        const key = _sentKey('lawyer', 0);
        if (!sent.has(key)) jobs.push({ role: 'lawyer', offset_minutes: 0, sent_key: key });
    }
    if (targets.client && row.event_type !== 'reminder' && _offsetsForRole(row, 'client').includes(0)) {
        const key = _sentKey('client', 0);
        if (!sent.has(key) && (await _eventHasClientAudience(row))) {
            jobs.push({ role: 'client', offset_minutes: 0, sent_key: key });
        }
    }

    if (!jobs.length) return result;

    // Ensure "now" is the effective fire (offset 0 at create ≠ start_time).
    for (const job of jobs) {
        const fireAt = effectiveFireAt(now);
        if (fireAt.getTime() > now.getTime() + 60 * 1000) {
            result.deferred = true;
            continue;
        }
        result.attempted += 1;
        const { rows: updated } = await pool.query(
            `
            UPDATE calendar_events
            SET reminders_sent_offsets = COALESCE(reminders_sent_offsets, '[]'::jsonb)
                || to_jsonb($2::text)
            WHERE id = $1
              AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($2::text)
            RETURNING id, owner_id, manager_user_id, client_user_id, case_id, title, event_type, location, start_time,
                      lead_phone, lead_email, lead_name, client_name, reminder_channels, reminder_targets,
                      invite_token, client_reminder_sms, reminders_sent_offsets
            `,
            [id, job.sent_key]
        );
        if (!updated.length) continue;
        const ev = {
            ...updated[0],
            role: job.role,
            offset_minutes: 0,
            sent_key: job.sent_key,
            prev_sent: row.prev_sent,
        };
        const [enriched] = await _enrichWithNames([ev]);
        try {
            await _dispatchOne(enriched || ev);
            result.sent += 1;
        } catch (err) {
            result.errors.push(err.message || String(err));
            await _revertSentKey(id, job.sent_key, row.prev_sent);
        }
    }
    return result;
}

function _minutesToCronExpression(minutes) {
    const m = Number.parseInt(String(minutes || ''), 10);
    if (!Number.isFinite(m) || m <= 0) return '*/5 * * * *';
    if (m === 1) return '* * * * *';
    return `*/${m} * * * *`;
}

async function _readSchedulerSettings() {
    const enabledRaw = await settingsService.getSetting(
        'calendar',
        'CALENDAR_REMINDERS_ENABLED',
        process.env.CALENDAR_REMINDERS_ENABLED || 'true'
    );
    const pollMinutesRaw = await settingsService.getSetting(
        'calendar',
        'CALENDAR_REMINDERS_POLL_MINUTES',
        process.env.CALENDAR_REMINDERS_POLL_MINUTES || '5'
    );

    return {
        enabled: String(enabledRaw).toLowerCase(),
        pollMinutes: Number.parseInt(String(pollMinutesRaw || '5'), 10),
    };
}

async function initCalendarReminderScheduler() {
    const { enabled, pollMinutes } = await _readSchedulerSettings();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[calendar-reminders] Disabled via calendar settings (platform_settings/env).');
        return { ok: true, enabled: false };
    }

    const cronExpr = _minutesToCronExpression(pollMinutes);
    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            await processCalendarReminders();
        } catch (err) {
            console.error('[calendar-reminders] Unhandled tick error:', err.message);
        } finally {
            running = false;
        }
    }

    const task = cron.schedule(cronExpr, () => {
        tick().catch(() => { /* logged inside */ });
    });

    tick().catch(() => { });

    console.log(`[calendar-reminders] Started. cron="${cronExpr}" (${pollMinutes}m poll, split offsets + Shabbat deferral)`);
    return { ok: true, enabled: true, pollMinutes, cronExpr, taskStarted: !!task };
}

module.exports = {
    initCalendarReminderScheduler,
    processCalendarReminders,
    fireImmediateRemindersForEvent,
};

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
    parseStoredChannels,
} = require('../../lib/calendarEventReminders');
const { dispatchCalendarReminder } = require('../../lib/calendarReminderDispatch');
const { effectiveFireAt } = require('../../lib/shabbatDeferral');
const { getAppScheme } = require('../../utils/appDeepLinks');

function _buildDeepLinkPayload(eventId) {
    const url = `${getAppScheme()}://appointment/${eventId}`;
    return {
        screen: 'appointment',
        eventId: String(eventId),
        url,
        deepLink: url,
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
            const key = String(item);
            keys.add(key);
            const claim = key.match(/^claim:(lawyer|client):(\d+):\d+$/);
            if (claim) keys.add(`${claim[1]}:${claim[2]}`);
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
    let reminderMetaByEvent = new Map();
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

    try {
        const { rows: reminderRows } = await pool.query(
            `SELECT calendar_event_id, template_key, subject
             FROM scheduled_email_reminders
             WHERE calendar_event_id = ANY($1::int[])`,
            [ids]
        );
        for (const r of reminderRows) {
            reminderMetaByEvent.set(r.calendar_event_id, r);
        }
    } catch (err) {
        console.error('[calendar-reminders] reminder template enrich failed:', err.message);
    }

    return rows.map((r) => {
        const names = clientsByEvent.get(r.id) || [];
        const legacy = nameById.get(r.id)?.client_name || r.client_name || null;
        if (!names.length && legacy) names.push(legacy);
        const reminderMeta = reminderMetaByEvent.get(r.id);
        return {
            ...r,
            owner_name: nameById.get(r.id)?.owner_name || null,
            client_name: names[0] || legacy || null,
            clients_names: names,
            reminder_template_key: reminderMeta?.template_key || r.reminder_template_key || null,
            reminder_subject: reminderMeta?.subject || r.reminder_subject || null,
        };
    });
}

async function _eventHasClientAudience(ev) {
    if (ev.client_user_id || ev.lead_phone || ev.lead_email) return true;
    let leads = ev.lead_participants;
    if (typeof leads === 'string') { try { leads = JSON.parse(leads); } catch { leads = []; } }
    if (Array.isArray(leads) && leads.some(p => p?.phone || p?.email)) return true;
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
    const lateGrace = Math.max(5, Math.min(60, Number(pollMinutes) || 5));
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
               ce.meeting_type,
               ce.start_time,
               ce.created_at,
               ce.reminder_deferred_until,
               ce.lead_phone,
               ce.lead_email,
               ce.lead_name,
               ce.lead_participants,
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
          AND (ce.start_time < NOW() + INTERVAL '14 days'
               OR COALESCE(ce.lawyer_reminder_offsets, '[]'::jsonb) @> '[0]'::jsonb
               OR COALESCE(ce.client_reminder_offsets, '[]'::jsonb) @> '[0]'::jsonb)
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
        if (targets.client) roles.push('client');

        for (const role of roles) {
            if (role === 'client' && !(await _eventHasClientAudience(row))) {
                continue;
            }
            for (const offsetMinutes of _offsetsForRole(row, role)) {
                const key = _sentKey(role, offsetMinutes);
                if (sent.has(key)) continue;
                const deferred = row.reminder_deferred_until?.[key];
                const natural = deferred ? new Date(deferred) : offsetMinutes === 0
                    ? new Date(row.created_at)
                    : new Date(new Date(row.start_time).getTime() - offsetMinutes * 60 * 1000);
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
            const claimKey = `claim:${row.sent_key}:${Date.now()}`;
            const { rows: updated } = await dbClient.query(
                `
                UPDATE calendar_events
                SET reminders_sent_offsets = COALESCE(reminders_sent_offsets, '[]'::jsonb)
                    || to_jsonb($2::text)
                WHERE id = $1
                  AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($5::text)
                  AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($3::int)
                  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(reminders_sent_offsets, '[]'::jsonb)) k WHERE k LIKE 'claim:' || $5::text || ':%')
                  AND start_time = $4::timestamptz
                RETURNING id, owner_id, manager_user_id, client_user_id, case_id, title, event_type, location, meeting_type, start_time,
                          lead_phone, lead_email, lead_name, lead_participants, client_name, reminder_channels, reminder_targets,
                          invite_token, client_reminder_sms, reminders_sent_offsets
                `,
                [row.id, claimKey, row.offset_minutes, row.start_time, row.sent_key]
            );
            if (updated.length) {
                claimed.push({
                    ...updated[0],
                    role: row.role,
                    offset_minutes: row.offset_minutes,
                    sent_key: row.sent_key,
                    claim_key: claimKey,
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

async function _revertSentKey(eventId, sentKey) {
    // Remove only this claim: a parallel audience may already have succeeded.
    await pool.query(`UPDATE calendar_events SET reminders_sent_offsets = COALESCE(reminders_sent_offsets, '[]'::jsonb) - $2::text WHERE id = $1`, [eventId, sentKey]);
}

async function _completeClaim(ev) {
    await pool.query(`UPDATE calendar_events SET reminders_sent_offsets=(COALESCE(reminders_sent_offsets,'[]'::jsonb)-$2::text)||to_jsonb($3::text)
        WHERE id=$1 AND COALESCE(reminders_sent_offsets,'[]'::jsonb) @> to_jsonb($2::text)`, [ev.id, ev.claim_key, ev.sent_key]);
}

async function _dispatchRecipient(ev, recipient, message, options) {
    const selected = parseStoredChannels(ev.reminder_channels);
    const recipientKey = recipient.userId ? `user${recipient.userId}` : require('node:crypto').createHash('sha256').update(`${recipient.phone || ''}|${recipient.email || ''}`).digest('hex').slice(0, 24);
    let complete = true;
    for (const channel of ['push', 'sms', 'email'].filter(channel => selected[channel])) {
        const receiptKey = `receipt:${ev.sent_key}:${recipientKey}:${channel}`;
        const { rows } = await pool.query('SELECT reminders_sent_offsets, start_time FROM calendar_events WHERE id=$1', [ev.id]);
        const current = rows[0];
        if (!current || new Date(current.start_time).getTime() !== new Date(ev.start_time).getTime()) return false;
        if (ev.claim_key && !_parseSentKeys(current.reminders_sent_offsets).has(ev.claim_key)) return false;
        if (_parseSentKeys(current.reminders_sent_offsets).has(receiptKey)) continue;
        try {
            const result = await dispatchCalendarReminder({ ...options, ...recipient, eventChannels: { push: false, sms: false, email: false, [channel]: true }, title: message.title, body: message.body });
            if (result.sent) {
                await pool.query(`UPDATE calendar_events SET reminders_sent_offsets=COALESCE(reminders_sent_offsets,'[]'::jsonb)||to_jsonb($2::text) WHERE id=$1 AND NOT COALESCE(reminders_sent_offsets,'[]'::jsonb) @> to_jsonb($2::text)`, [ev.id, receiptKey]);
            } else complete = false;
        } catch (err) {
            complete = false;
            console.error(`[calendar-reminders] channel failed eventId=${ev.id} channel=${channel}:`, err.message);
        }
    }
    return complete;
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
    const leadList = [];
    try {
        // Prefer multi-lead JSON when present; fall back to primary lead_* columns.
        if (ev.lead_participants) {
            let raw = ev.lead_participants;
            if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch { raw = []; }
            }
            if (Array.isArray(raw)) {
                for (const p of raw) {
                    const phone = String(p?.phone || '').trim() || null;
                    const email = String(p?.email || '').trim() || null;
                    const name = String(p?.name || '').trim() || null;
                    if (phone || email) leadList.push({ userId: null, phone, email, name });
                }
            }
        }
    } catch (_) { /* ignore */ }
    if (!leadList.length && (ev.lead_phone || ev.lead_email)) {
        leadList.push({
            userId: null,
            phone: ev.lead_phone,
            email: ev.lead_email,
            name: ev.client_name || ev.lead_name,
        });
    }
    for (const lead of leadList) {
        clients.push(lead);
    }
    return clients;
}

async function _dispatchOne(ev) {
    const payload = _buildDeepLinkPayload(ev.id);
    const base = { eventType: ev.event_type, recipientRole: ev.role, payload };
    let complete = true;
    if (ev.role === 'lawyer') {
        const msg = await composeLawyerReminderMessage(ev.offset_minutes, ev);
        const ids = await _resolveLawyerRecipients(ev);
        for (const userId of ids) {
            if (!(await _dispatchRecipient(ev, { userId }, msg, { ...base, emailTemplateKey: 'CALENDAR_LAWYER_REMINDER', emailEvent: ev,
                emailOpts: { clientsNames: ev.clients_names, whenLabel: msg.whenLabel, bodyText: msg.body.split('\n')[0] || msg.body } }))) complete = false;
        }
    } else {
        const recipients = await _resolveClientRecipients(ev);
        const names = [...new Set([...recipients.map(r => r.name), ...(ev.clients_names || [])].filter(Boolean))];
        const unique = new Map();
        for (const recipient of recipients) unique.set(recipient.userId ? `user:${recipient.userId}` : `${recipient.phone || ''}|${recipient.email || ''}`, recipient);
        for (const recipient of unique.values()) {
            const emailEvent = { ...ev, client_name: recipient.name || ev.client_name || ev.lead_name, clients_names: names };
            const msg = await composeClientReminderMessage(ev.offset_minutes, emailEvent);
            if (!(await _dispatchRecipient(ev, recipient, msg, { ...base, emailTemplateKey: 'CALENDAR_REMINDER', emailEvent,
                emailOpts: { recipientName: emailEvent.client_name, clientsNames: names } }))) complete = false;
        }
    }
    if (!complete) throw new Error(`${ev.role}_reminder_incomplete`);
}

async function _processClaimedRows(rows) {
    for (const ev of rows) {
        try {
            await _dispatchOne(ev);
            await _completeClaim(ev);
            console.log(
                `[calendar-reminders] ${ev.sent_key} dispatched → eventId=${ev.id}`
            );
        } catch (err) {
            console.error(
                `[calendar-reminders] ${ev.sent_key} FAILED → eventId=${ev.id}:`,
                err.message
            );
            await _revertSentKey(ev.id, ev.claim_key || ev.sent_key);
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
            const result = await sendFn(row.id);
            if (result?.error) {
                console.error(`[calendar-reminders] deferred invitation incomplete eventId=${row.id}:`, result.error);
                await pool.query(`UPDATE calendar_events SET invite_deferred_until=NOW()+INTERVAL '5 minutes' WHERE id=$1`, [row.id]);
                continue;
            }
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
    const { enabled, pollMinutes } = await _readSchedulerSettings();
    if (enabled !== 'true' && enabled !== '1') return;
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
    const result = {
        attempted: 0,
        sent: 0,
        deferred: false,
        deferredReason: null,
        deferredUntil: null,
        errors: [],
    };
    if (!Number.isFinite(id)) return result;
    const { enabled } = await _readSchedulerSettings();
    if (enabled !== 'true' && enabled !== '1') return result;

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

    const { effectiveFireAt, describeQuietDeferral } = require('../../lib/shabbatDeferral');
    const now = new Date();
    const targets = parseReminderTargets(row.reminder_targets);
    const sent = _parseSentKeys(row.prev_sent);
    const jobs = [];

    if (targets.managers && _offsetsForRole(row, 'lawyer').includes(0)) {
        const key = _sentKey('lawyer', 0);
        if (!sent.has(key)) jobs.push({ role: 'lawyer', offset_minutes: 0, sent_key: key });
    }
    if (targets.client && _offsetsForRole(row, 'client').includes(0)) {
        const key = _sentKey('client', 0);
        if (!sent.has(key) && (await _eventHasClientAudience(row))) {
            jobs.push({ role: 'client', offset_minutes: 0, sent_key: key });
        }
    }

    if (!jobs.length) return result;
    const quiet = describeQuietDeferral(now);
    if (quiet) {
        const deferred = Object.fromEntries(jobs.map(job => [job.sent_key, quiet.until.toISOString()]));
        await pool.query(`UPDATE calendar_events SET reminder_deferred_until=COALESCE(reminder_deferred_until,'{}'::jsonb)||$2::jsonb WHERE id=$1`, [id, JSON.stringify(deferred)]);
        result.deferred = true; result.deferredReason = quiet.reason; result.deferredUntil = quiet.until.toISOString();
        return result;
    }

    // Ensure "now" is the effective fire (offset 0 at create ≠ start_time).
    for (const job of jobs) {
        const fireAt = effectiveFireAt(now);
        if (fireAt.getTime() > now.getTime() + 60 * 1000) {
            const late = describeQuietDeferral(now);
            result.deferred = true;
            result.deferredReason = late?.reason || 'quiet';
            result.deferredUntil = (late?.until || fireAt).toISOString();
            continue;
        }
        result.attempted += 1;
        const claimKey = `claim:${job.sent_key}:${Date.now()}`;
        const { rows: updated } = await pool.query(
            `
            UPDATE calendar_events
            SET reminders_sent_offsets = COALESCE(reminders_sent_offsets, '[]'::jsonb)
                || to_jsonb($2::text)
            WHERE id = $1
              AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($4::text)
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(reminders_sent_offsets, '[]'::jsonb)) k WHERE k LIKE 'claim:' || $4::text || ':%')
              AND start_time = $3::timestamptz
            RETURNING id, owner_id, manager_user_id, client_user_id, case_id, title, event_type, location, meeting_type, start_time,
                      lead_phone, lead_email, lead_name, lead_participants, client_name, reminder_channels, reminder_targets,
                      invite_token, client_reminder_sms, reminders_sent_offsets
            `,
            [id, claimKey, row.start_time, job.sent_key]
        );
        if (!updated.length) continue;
        const ev = {
            ...updated[0],
            role: job.role,
            offset_minutes: 0,
            sent_key: job.sent_key,
            claim_key: claimKey,
            prev_sent: row.prev_sent,
        };
        const [enriched] = await _enrichWithNames([ev]);
        try {
            await _dispatchOne(enriched || ev);
            await _completeClaim(ev);
            result.sent += 1;
        } catch (err) {
            result.errors.push(err.message || String(err));
            await _revertSentKey(id, claimKey);
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
    let running = false;
    let lastRun = 0;
    let lastEnabled = false;
    async function tick() {
        if (running) return;
        running = true;
        try {
            const { enabled, pollMinutes } = await _readSchedulerSettings();
            const active = enabled === 'true' || enabled === '1';
            const interval = Math.max(1, Math.min(60, pollMinutes || 5)) * 60000;
            if (!active) { lastEnabled = false; return; }
            if (lastEnabled && Date.now() - lastRun < interval) return;
            lastEnabled = true;
            lastRun = Date.now();
            await processCalendarReminders();
        } catch (err) {
            console.error('[calendar-reminders] Unhandled tick error:', err.message);
        } finally { running = false; }
    }
    // Keep the watcher alive while disabled so enabling never requires a restart.
    const task = cron.schedule('* * * * *', () => { tick().catch(() => {}); });
    await tick();
    return { ok: true, enabled: lastEnabled, cronExpr: '* * * * *', taskStarted: !!task };
}

module.exports = {
    initCalendarReminderScheduler,
    processCalendarReminders,
    fireImmediateRemindersForEvent,
};

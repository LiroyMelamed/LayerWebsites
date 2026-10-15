/**
 * calendarReminders/scheduler.js
 *
 * Dispatches push reminders for calendar events based on per-event
 * `reminder_offsets` (minutes before start). Lawyers choose reminders when
 * creating/editing an event — nothing is sent automatically unless selected.
 *
 * Env / platform_settings:
 *   • CALENDAR_REMINDERS_ENABLED        "true" (default) | "false"
 *   • CALENDAR_REMINDERS_POLL_MINUTES   default 5
 */

'use strict';

const cron = require('node-cron');
const pool = require('../../config/db');
const settingsService = require('../../services/settingsService');
const {
    composeLawyerReminderMessage,
    composeClientReminderMessage,
} = require('../../lib/calendarEventReminders');
const { dispatchCalendarReminder } = require('../../lib/calendarReminderDispatch');

const DEEP_LINK_SCHEME = 'melamedia://appointment/';

function _buildDeepLinkPayload(eventId) {
    return {
        screen: 'appointment',
        eventId: String(eventId),
        url: `${DEEP_LINK_SCHEME}${eventId}`,
        deepLink: `${DEEP_LINK_SCHEME}${eventId}`,
    };
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
    return rows.map((r) => ({
        ...r,
        owner_name: nameById.get(r.id)?.owner_name || null,
        client_name: nameById.get(r.id)?.client_name || null,
    }));
}

async function _claimDueReminders(pollMinutes, limit = 200) {
    const grace = Math.max(5, Number.parseInt(String(pollMinutes || 5), 10) || 5);
    const dbClient = await pool.connect();

    try {
        await dbClient.query('BEGIN');

        const { rows: due } = await dbClient.query(
            `
            SELECT ce.id,
                   ce.owner_id,
                   ce.client_user_id,
                   ce.case_id,
                   ce.title,
                   ce.event_type,
                   ce.location,
                   ce.start_time,
                   ce.lead_phone,
                   ce.lead_email,
                   ce.reminder_channels,
                   ce.reminders_sent_offsets AS prev_sent,
                   (off.value)::int AS offset_minutes
            FROM calendar_events ce
            CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(ce.reminder_offsets, '[]'::jsonb)) AS off(value)
            WHERE ce.event_type IN ('appointment', 'hearing', 'reminder')
              AND jsonb_array_length(COALESCE(ce.reminder_offsets, '[]'::jsonb)) > 0
              AND (
                    COALESCE(ce.reminder_channels->>'push', 'false') IN ('true', '1')
                 OR COALESCE(ce.reminder_channels->>'sms', 'false') IN ('true', '1')
                 OR COALESCE(ce.reminder_channels->>'email', 'false') IN ('true', '1')
              )
              AND ce.start_time > NOW()
              AND NOT COALESCE(ce.reminders_sent_offsets, '[]'::jsonb) @> to_jsonb((off.value)::int)
              AND ce.start_time - ((off.value)::int * INTERVAL '1 minute')
                  >= NOW() - ($1::int * INTERVAL '1 minute')
              AND ce.start_time - ((off.value)::int * INTERVAL '1 minute')
                  <= NOW() + ($1::int * INTERVAL '1 minute')
            ORDER BY ce.start_time ASC
            LIMIT $2
            FOR UPDATE OF ce SKIP LOCKED
            `,
            [grace, limit]
        );

        if (!due.length) {
            await dbClient.query('COMMIT');
            return [];
        }

        const claimed = [];
        for (const row of due) {
            const { rows: updated } = await dbClient.query(
                `
                UPDATE calendar_events
                SET reminders_sent_offsets = COALESCE(reminders_sent_offsets, '[]'::jsonb)
                    || to_jsonb($2::int)
                WHERE id = $1
                  AND NOT COALESCE(reminders_sent_offsets, '[]'::jsonb) @> to_jsonb($2::int)
                RETURNING id, owner_id, manager_user_id, client_user_id, case_id, title, event_type, location, start_time,
                          lead_phone, lead_email, reminder_channels
                `,
                [row.id, row.offset_minutes]
            );
            if (updated.length) {
                claimed.push({
                    ...updated[0],
                    offset_minutes: row.offset_minutes,
                    prev_sent: row.prev_sent,
                    reminder_channels: row.reminder_channels,
                });
            }
        }

        await dbClient.query('COMMIT');
        return _enrichWithNames(claimed);
    } catch (err) {
        try { await dbClient.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        dbClient.release();
    }
}

async function _revertSentOffset(eventId, offsetMinutes, prevSent) {
    try {
        await pool.query(
            `
            UPDATE calendar_events
            SET reminders_sent_offsets = COALESCE($1::jsonb, '[]'::jsonb)
            WHERE id = $2
            `,
            [JSON.stringify(Array.isArray(prevSent) ? prevSent : []), eventId]
        );
    } catch (err) {
        console.error(
            `[calendar-reminders] Failed to revert reminders_sent_offsets for eventId=${eventId}, offset=${offsetMinutes}:`,
            err.message
        );
    }
}

/** Lawyers to remind: tagged managers (junction + legacy column), else the owner. */
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

async function _dispatchOne(ev) {
    const payload = _buildDeepLinkPayload(ev.id);
    const channels = ev.reminder_channels;
    const lawyerMsg = composeLawyerReminderMessage(ev.offset_minutes, ev);

    const lawyerIds = await _resolveLawyerRecipients(ev);
    let anySent = false;
    for (const lawyerId of lawyerIds) {
        try {
            const result = await dispatchCalendarReminder({
                userId: lawyerId,
                eventChannels: channels,
                eventType: ev.event_type,
                title: lawyerMsg.title,
                body: lawyerMsg.body,
                payload,
            });
            if (result.sent) anySent = true;
        } catch (err) {
            console.error(`[calendar-reminders] lawyer dispatch failed eventId=${ev.id} userId=${lawyerId}:`, err.message);
        }
    }
    if (!anySent) {
        throw new Error('lawyer_reminder_not_sent');
    }

    if (ev.event_type !== 'reminder' && ev.client_user_id) {
        const clientMsg = composeClientReminderMessage(ev.offset_minutes, ev);
        try {
            await dispatchCalendarReminder({
                userId: ev.client_user_id,
                eventChannels: channels,
                eventType: ev.event_type,
                title: clientMsg.title,
                body: clientMsg.body,
                payload,
            });
        } catch (err) {
            console.error(`[calendar-reminders] client dispatch failed eventId=${ev.id}:`, err.message);
        }
    } else if (ev.event_type !== 'reminder' && (ev.lead_phone || ev.lead_email)) {
        const clientMsg = composeClientReminderMessage(ev.offset_minutes, ev);
        try {
            await dispatchCalendarReminder({
                email: ev.lead_email,
                phone: ev.lead_phone,
                eventChannels: channels,
                eventType: ev.event_type,
                title: clientMsg.title,
                body: clientMsg.body,
                payload,
            });
        } catch (err) {
            console.error(`[calendar-reminders] lead dispatch failed eventId=${ev.id}:`, err.message);
        }
    }
}

async function _processClaimedRows(rows) {
    for (const ev of rows) {
        try {
            await _dispatchOne(ev);
            console.log(
                `[calendar-reminders] offset=${ev.offset_minutes}m dispatched → eventId=${ev.id}, ` +
                `lawyer=${ev.owner_id}` +
                (ev.client_user_id ? `, client=${ev.client_user_id}` : '')
            );
        } catch (err) {
            console.error(
                `[calendar-reminders] offset=${ev.offset_minutes}m dispatch FAILED → eventId=${ev.id}:`,
                err.message
            );
            let prev = [];
            if (Array.isArray(ev.prev_sent)) prev = ev.prev_sent;
            else if (typeof ev.prev_sent === 'string') {
                try { prev = JSON.parse(ev.prev_sent); } catch { prev = []; }
            } else if (ev.prev_sent && typeof ev.prev_sent === 'object') {
                prev = Object.values(ev.prev_sent);
            }
            await _revertSentOffset(ev.id, ev.offset_minutes, prev);
        }
    }
}

async function processCalendarReminders() {
    const { pollMinutes } = await _readSchedulerSettings();
    let claimed;
    try {
        claimed = await _claimDueReminders(pollMinutes);
    } catch (err) {
        console.error('[calendar-reminders] claim phase failed:', err.message);
        return;
    }
    if (!claimed.length) return;

    console.log(`[calendar-reminders] claimed ${claimed.length} reminder(s)`);
    await _processClaimedRows(claimed);
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

    console.log(`[calendar-reminders] Started. cron="${cronExpr}" (${pollMinutes}m poll, per-event offsets)`);
    return { ok: true, enabled: true, pollMinutes, cronExpr, taskStarted: !!task };
}

module.exports = { initCalendarReminderScheduler, processCalendarReminders };

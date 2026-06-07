/**
 * calendarReminders/scheduler.js
 *
 * Production-grade reminder worker for the synchronized calendar.
 *
 * Design (Step 3):
 *   • Single source of truth — `calendar_events.last_reminder_sent_at`.
 *     Legacy boolean flags reminder_sent_30m / _1d are ignored entirely; a
 *     follow-up migration may drop them.
 *   • Only event_type = 'appointment' is processed. 'leave' events are skipped.
 *   • Race-safe across PM2 cluster workers: each tick opens a transaction,
 *     atomically claims due rows with FOR UPDATE SKIP LOCKED, bumps
 *     last_reminder_sent_at, COMMITs, then dispatches push notifications
 *     OUTSIDE the transaction (so DB connections are released immediately).
 *   • Dual delivery — every reminder pushes once to the lawyer (owner_id) and,
 *     when the appointment is linked to a client/case, once more to the client
 *     (client_user_id) with role-tailored Hebrew text and a deep-link payload.
 *   • If dispatch fails for a claimed row, last_reminder_sent_at is reverted to
 *     its prior value so the next tick re-attempts delivery ("at-least-once").
 *
 * Reminder windows (interpreted from `last_reminder_sent_at` only):
 *   • 1-day  : start_time ∈ [now+23h55m, now+25h]
 *              AND (last_reminder_sent_at IS NULL
 *                   OR last_reminder_sent_at < start_time - 25h)
 *   • 30-min : start_time ∈ [now+25m, now+35m]
 *              AND (last_reminder_sent_at IS NULL
 *                   OR last_reminder_sent_at < start_time - 35m)
 *
 *   Why this works with a single timestamp: after the 1-day push fires we set
 *   last_reminder_sent_at ≈ start_time - 24h. That timestamp IS older than
 *   (start_time - 35m), so the 30-minute claim gate opens correctly ~23.5h
 *   later. After the 30-minute push fires we set the timestamp to ≈ start - 30m,
 *   which fails both gates → no further re-fires for this event.
 *
 * Env / platform_settings:
 *   • CALENDAR_REMINDERS_ENABLED        "true" (default) | "false"
 *   • CALENDAR_REMINDERS_POLL_MINUTES   default 5
 */

'use strict';

const cron = require('node-cron');
const pool = require('../../config/db');
const settingsService = require('../../services/settingsService');
const sendAndStoreNotification = require('../../utils/sendAndStoreNotification');

// ─── Constants ────────────────────────────────────────────────────────────────
const KIND_1D = '1d';
const KIND_30M = '30m';

const DEEP_LINK_SCHEME = 'melamedia://appointment/';

// Per-kind claim window + dedupe gap (Postgres interval literal).
const WINDOWS = {
    [KIND_1D]: {
        windowMinFromNow: 23 * 60 + 55,        // ≥ now + 23h55m
        windowMaxFromNow: 25 * 60,             // ≤ now + 25h
        dedupeGapBeforeStart: '25 hours',      // last_reminder_sent_at must be older than (start_time − this)
    },
    [KIND_30M]: {
        windowMinFromNow: 25,                  // ≥ now + 25m
        windowMaxFromNow: 35,                  // ≤ now + 35m
        dedupeGapBeforeStart: '35 minutes',
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _buildDeepLinkPayload(eventId) {
    return {
        screen: 'appointment',
        eventId: String(eventId),
        url: `${DEEP_LINK_SCHEME}${eventId}`,
        deepLink: `${DEEP_LINK_SCHEME}${eventId}`,
    };
}

function _formatTime(date) {
    return new Date(date).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/** Build lawyer-facing Hebrew title+body. */
function _composeLawyerMessage(kind, ev) {
    const timeStr = _formatTime(ev.start_time);
    const audience = ev.client_name || null;

    if (kind === KIND_1D) {
        const title = 'תזכורת לפגישה מחר';
        const body = audience
            ? `פגישה עם הלקוח ${audience} — מחר בשעה ${timeStr}`
            : `${ev.title} — מחר בשעה ${timeStr}`;
        return { title, body };
    }
    const title = 'פגישה בעוד 30 דקות';
    const body = audience
        ? `פגישה עם הלקוח ${audience} — בשעה ${timeStr}`
        : `${ev.title} — בשעה ${timeStr}`;
    return { title, body };
}

/** Build client-facing Hebrew title+body. */
function _composeClientMessage(kind, ev) {
    const timeStr = _formatTime(ev.start_time);
    const lawyer = ev.owner_name || 'עורך הדין';

    if (kind === KIND_1D) {
        return {
            title: 'תזכורת לפגישה מחר',
            body: `פגישתך עם עו״ד ${lawyer} תתחיל מחר בשעה ${timeStr}`,
        };
    }
    return {
        title: 'פגישה בעוד 30 דקות',
        body: `פגישתך עם עו״ד ${lawyer} תתחיל בשעה ${timeStr}`,
    };
}

// ─── Claim phase ──────────────────────────────────────────────────────────────
/**
 * Atomically claim due reminders inside a single transaction:
 *   BEGIN → SELECT FOR UPDATE SKIP LOCKED → UPDATE last_reminder_sent_at → COMMIT.
 * Returns the claimed rows enriched with owner_name / client_name for dispatch.
 *
 * Each row also carries `prev_last_reminder_sent_at` so we can revert on
 * dispatch failure without re-querying.
 */
async function _claimDueRows(kind, limit = 200) {
    const cfg = WINDOWS[kind];

    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');

        const { rows: claimed } = await dbClient.query(
            `
            WITH due AS (
                SELECT id, last_reminder_sent_at AS prev_last
                FROM   calendar_events
                WHERE  event_type = 'appointment'
                  AND  start_time >= NOW() + ($1::int * INTERVAL '1 minute')
                  AND  start_time <= NOW() + ($2::int * INTERVAL '1 minute')
                  AND  (
                        last_reminder_sent_at IS NULL
                        OR last_reminder_sent_at < (start_time - $3::interval)
                  )
                ORDER BY start_time ASC
                LIMIT $4
                FOR UPDATE SKIP LOCKED
            )
            UPDATE calendar_events ce
            SET    last_reminder_sent_at = NOW()
            FROM   due
            WHERE  ce.id = due.id
            RETURNING ce.id,
                      ce.owner_id,
                      ce.client_user_id,
                      ce.case_id,
                      ce.title,
                      ce.location,
                      ce.start_time,
                      due.prev_last AS prev_last_reminder_sent_at
            `,
            [cfg.windowMinFromNow, cfg.windowMaxFromNow, cfg.dedupeGapBeforeStart, limit]
        );

        if (!claimed.length) {
            await dbClient.query('COMMIT');
            return [];
        }

        // Enrich with display names IN-TRANSACTION so the snapshot stays
        // consistent with the rows we just locked.
        const ids = claimed.map(r => r.id);
        const { rows: enriched } = await dbClient.query(
            `
            SELECT ce.id,
                   u_owner.name  AS owner_name,
                   COALESCE(u_client.name, ce.client_name) AS client_name
            FROM   calendar_events ce
            LEFT JOIN users u_owner  ON u_owner.userid  = ce.owner_id
            LEFT JOIN users u_client ON u_client.userid = ce.client_user_id
            WHERE  ce.id = ANY($1::int[])
            `,
            [ids]
        );

        await dbClient.query('COMMIT');

        const nameById = new Map(enriched.map(r => [r.id, r]));
        return claimed.map(r => ({
            ...r,
            owner_name: nameById.get(r.id)?.owner_name || null,
            client_name: nameById.get(r.id)?.client_name || null,
        }));
    } catch (err) {
        try { await dbClient.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        dbClient.release();
    }
}

/** Revert last_reminder_sent_at to its previous value on dispatch failure. */
async function _revertClaim(eventId, prevValue) {
    try {
        await pool.query(
            `UPDATE calendar_events
             SET    last_reminder_sent_at = $1
             WHERE  id = $2`,
            [prevValue, eventId]
        );
    } catch (err) {
        // Non-fatal — the next tick will retry once start_time gets closer.
        console.error(
            `[calendar-reminders] Failed to revert last_reminder_sent_at for eventId=${eventId}:`,
            err.message
        );
    }
}

// ─── Dispatch phase ───────────────────────────────────────────────────────────
async function _dispatchOne(kind, ev) {
    const payload = _buildDeepLinkPayload(ev.id);

    // Lawyer push — always.
    const lawyerMsg = _composeLawyerMessage(kind, ev);
    const lawyerPromise = sendAndStoreNotification(
        ev.owner_id,
        lawyerMsg.title,
        lawyerMsg.body,
        payload
    );

    // Client push — only when a real client_user_id is linked.
    // case_id alone isn't enough; we need a user to push to.
    let clientPromise = Promise.resolve();
    if (ev.client_user_id) {
        const clientMsg = _composeClientMessage(kind, ev);
        clientPromise = sendAndStoreNotification(
            ev.client_user_id,
            clientMsg.title,
            clientMsg.body,
            payload
        );
    }

    // sendAndStoreNotification already catches its own send/store errors and
    // logs them. We still wrap defensively so an unexpected throw reverts the
    // claim instead of leaving the reminder marked as sent.
    await Promise.all([lawyerPromise, clientPromise]);
}

async function _processClaimedRows(kind, rows) {
    for (const ev of rows) {
        try {
            await _dispatchOne(kind, ev);
            console.log(
                `[calendar-reminders] ${kind} dispatched → eventId=${ev.id}, ` +
                `lawyer=${ev.owner_id}` +
                (ev.client_user_id ? `, client=${ev.client_user_id}` : '')
            );
        } catch (err) {
            console.error(
                `[calendar-reminders] ${kind} dispatch FAILED → eventId=${ev.id}:`,
                err.message
            );
            await _revertClaim(ev.id, ev.prev_last_reminder_sent_at);
        }
    }
}

// ─── Tick orchestration ───────────────────────────────────────────────────────
async function processCalendarReminders() {
    // 1-day reminders first, then 30-minute. Order doesn't affect correctness
    // (the windows are disjoint), but it keeps the more time-sensitive 30m
    // pushes as close to "now" as possible inside the tick.
    for (const kind of [KIND_1D, KIND_30M]) {
        let claimed;
        try {
            claimed = await _claimDueRows(kind);
        } catch (err) {
            console.error(`[calendar-reminders] claim phase failed for ${kind}:`, err.message);
            continue;
        }
        if (!claimed.length) continue;

        console.log(`[calendar-reminders] ${kind} claimed ${claimed.length} event(s)`);
        await _processClaimedRows(kind, claimed);
    }
}

// ─── Cron wiring ──────────────────────────────────────────────────────────────
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

    // Re-entrancy guard within a single PM2 worker process.
    // Cross-process safety is delivered by FOR UPDATE SKIP LOCKED at the DB layer.
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

    // Fire once on boot so a freshly-deployed PM2 instance doesn't wait a full poll cycle.
    tick().catch(() => { });

    console.log(`[calendar-reminders] Started. cron="${cronExpr}" (${pollMinutes}m poll, DB-locked dual-push)`);
    return { ok: true, enabled: true, pollMinutes, cronExpr, taskStarted: !!task };
}

module.exports = { initCalendarReminderScheduler, processCalendarReminders };

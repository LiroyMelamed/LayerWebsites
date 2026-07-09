/**
 * reminderCalendarSync.js
 *
 * Bidirectional sync helpers between scheduled_email_reminders and calendar_events.
 *
 * A "reminder" is a scheduled email to a client at a specific time. The calendar
 * gets a paired event of event_type = 'reminder' as a visual marker only; the
 * actual email is dispatched by the reminders worker.
 *
 * Synced calendar events have:
 *   - reminder_offsets       = '[]'                              (no push pings)
 *   - reminder_channels      = { push: false, sms: false, email: false }
 *   - reminders_sent_offsets = '[]'
 * so calendarReminderDispatch returns no_channels_or_contact and never sends.
 *
 * The unique partial index idx_ser_calendar_event_id keeps the relationship 1:1
 * and ON DELETE CASCADE on the FK removes the reminder when the calendar event
 * is deleted. Cancelling a reminder explicitly unlinks before delete so the
 * reminder row is preserved in CANCELLED state for audit. Deleting a calendar
 * event should cancel/unlink linked reminders first — never CASCADE-delete them.
 */

const pool = require('../config/db');

const EMPTY_OFFSETS = '[]';
const EMPTY_CHANNELS = JSON.stringify({ push: false, sms: false, email: false });

/**
 * Cached `true` on tenants that have the calendar tables; never cached `false`
 * because a single transient PG error during the first probe would otherwise
 * latch sync off forever and silently drop reminder↔calendar updates.
 */
let _calendarSyncAvailable = null;

async function _isCalendarSyncAvailable(dbClient) {
    if (_calendarSyncAvailable === true) return true;
    try {
        const { rows } = await dbClient.query(
            `SELECT
                 EXISTS (
                     SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'calendar_events'
                 ) AS has_calendar,
                 EXISTS (
                     SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public'
                       AND table_name = 'scheduled_email_reminders'
                       AND column_name = 'calendar_event_id'
                 ) AS has_link_col`
        );
        const ok = Boolean(rows[0]?.has_calendar && rows[0]?.has_link_col);
        if (ok) _calendarSyncAvailable = true;
        return ok;
    } catch (err) {
        // Transient errors: do NOT cache — re-probe on next call.
        console.warn('[reminder-calendar-sync] schema probe failed, will retry next call:', err.message);
        return false;
    }
}

function _trimOrNull(value) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
}

function _resolveTitle({ subject, templateKey }) {
    return _trimOrNull(subject) || _trimOrNull(templateKey) || 'תזכורת';
}

function _normalizeEmail(value) {
    const trimmed = _trimOrNull(value);
    return trimmed ? trimmed.toLowerCase() : null;
}

/**
 * Create a calendar_events row mirroring a freshly-INSERTed reminder.
 * Returns the new event id, or null if owner is missing (reminder still works).
 *
 * @param {object} reminder        Row from scheduled_email_reminders (post-INSERT).
 * @param {object} [opts]
 * @param {object} [opts.client]   pg client / pool (defaults to module pool).
 * @returns {Promise<number|null>} new calendar_events.id, or null on no-op.
 */
async function createCalendarEventForReminder(reminder, opts = {}) {
    const dbClient = opts.client || pool;
    if (!reminder) return null;
    if (!(await _isCalendarSyncAvailable(dbClient))) return null;

    const ownerId = reminder.created_by ?? null;
    if (!ownerId) return null;

    const userId = reminder.user_id ?? null;
    const clientName = _trimOrNull(reminder.client_name);
    const toEmail = _normalizeEmail(reminder.to_email);
    const scheduledFor = reminder.scheduled_for;
    if (!scheduledFor) return null;

    const title = _resolveTitle({
        subject: reminder.subject,
        templateKey: reminder.template_key,
    });

    // Give the calendar marker a 15-minute slot so window-based listEvents
    // queries (tstzrange(start, end, '[)')) actually pick it up; a zero-length
    // range would be empty and silently filtered out.
    const startIso = new Date(scheduledFor).toISOString();
    const endIso = new Date(new Date(scheduledFor).getTime() + 15 * 60 * 1000).toISOString();

    const { rows } = await dbClient.query(
        `INSERT INTO calendar_events
            (owner_id, title, event_type, client_user_id, client_name,
             lead_name, lead_email,
             start_time, end_time, all_day,
             reminder_offsets, reminder_channels, reminders_sent_offsets)
         VALUES ($1, $2, 'reminder', $3, $4, $5, $6, $7, $8, FALSE,
                 $9::jsonb, $10::jsonb, '[]'::jsonb)
         RETURNING id`,
        [
            ownerId,
            title,
            userId,
            userId ? clientName : null,
            userId ? null : clientName,
            userId ? null : toEmail,
            startIso,
            endIso,
            EMPTY_OFFSETS,
            EMPTY_CHANNELS,
        ]
    );
    return rows[0]?.id ?? null;
}

/**
 * Create a scheduled_email_reminders row mirroring a freshly-INSERTed
 * calendar event of event_type = 'reminder'.
 * Returns the new reminder id, or null if recipient details are missing.
 *
 * @param {object} event           Row from calendar_events (post-INSERT).
 * @param {object} payload
 * @param {string} [payload.toEmail]
 * @param {string} [payload.clientName]
 * @param {string} [payload.templateKey]
 * @param {object} [payload.templateData]
 * @param {string} [payload.subject]
 * @param {number} [payload.createdBy]
 * @param {object} [opts]
 * @param {object} [opts.client]   pg client / pool (defaults to module pool).
 */
async function createReminderForCalendarEvent(event, payload = {}, opts = {}) {
    const dbClient = opts.client || pool;
    if (!event) return null;

    const toEmail = _normalizeEmail(payload.toEmail);
    const clientName = _trimOrNull(payload.clientName);
    if (!toEmail || !clientName) return null;

    const scheduledFor = event.start_time;
    if (!scheduledFor) return null;

    const subject = _trimOrNull(payload.subject) || _trimOrNull(event.title);
    const templateKey = _trimOrNull(payload.templateKey) || 'GENERAL';
    const templateData = payload.templateData && typeof payload.templateData === 'object'
        ? payload.templateData
        : {};
    const createdBy = payload.createdBy ?? event.owner_id ?? null;

    let userId = null;
    if (event.client_user_id) {
        userId = event.client_user_id;
    } else {
        try {
            const { rows } = await dbClient.query(
                'SELECT userid FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
                [toEmail]
            );
            userId = rows[0]?.userid ?? null;
        } catch (_) { /* ignore lookup failure */ }
    }

    const { rows } = await dbClient.query(
        `INSERT INTO scheduled_email_reminders
            (user_id, client_name, to_email, subject, template_key, template_data,
             scheduled_for, status, created_by, calendar_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9)
         RETURNING id`,
        [
            userId,
            clientName,
            toEmail,
            subject,
            templateKey,
            JSON.stringify(templateData),
            scheduledFor,
            createdBy,
            event.id,
        ]
    );
    return rows[0]?.id ?? null;
}

/**
 * Mirror an updated reminder back onto its linked calendar event.
 * Only writes columns that the reminder authoritatively owns
 * (title, time, recipient/client). reminder_offsets/channels stay untouched
 * because synced events must keep them empty.
 */
async function updateCalendarEventForReminder(reminder, opts = {}) {
    const dbClient = opts.client || pool;
    if (!reminder?.calendar_event_id) return;
    if (!(await _isCalendarSyncAvailable(dbClient))) return;

    const userId = reminder.user_id ?? null;
    const clientName = _trimOrNull(reminder.client_name);
    const toEmail = _normalizeEmail(reminder.to_email);
    const title = _resolveTitle({
        subject: reminder.subject,
        templateKey: reminder.template_key,
    });

    const startIso = new Date(reminder.scheduled_for).toISOString();
    const endIso = new Date(new Date(reminder.scheduled_for).getTime() + 15 * 60 * 1000).toISOString();

    await dbClient.query(
        `UPDATE calendar_events SET
             title          = $1,
             client_user_id = $2,
             client_name    = $3,
             lead_name      = $4,
             lead_email     = $5,
             start_time     = $6,
             end_time       = $7
         WHERE id = $8
           AND event_type = 'reminder'`,
        [
            title,
            userId,
            userId ? clientName : null,
            userId ? null : clientName,
            userId ? null : toEmail,
            startIso,
            endIso,
            reminder.calendar_event_id,
        ]
    );
}

/**
 * Mirror an updated calendar 'reminder' event back onto its paired reminder row.
 * Updates only PENDING reminders so already-sent rows are preserved untouched.
 *
 * @param {object} event   calendar_events row (post-UPDATE).
 * @param {object} [payload] optional per-action overrides:
 *   { toEmail, clientName, templateKey, templateData, subject }
 */
async function updateReminderForCalendarEvent(event, payload = {}, opts = {}) {
    const dbClient = opts.client || pool;
    if (!event?.id) return;

    const { rows: linked } = await dbClient.query(
        `SELECT id, status FROM scheduled_email_reminders
         WHERE calendar_event_id = $1
         LIMIT 1`,
        [event.id]
    );
    const reminderRow = linked[0];
    if (!reminderRow || reminderRow.status !== 'PENDING') return;

    const updates = [];
    const values = [];
    let idx = 1;

    if (payload.subject !== undefined || event.title !== undefined) {
        const nextSubject = _trimOrNull(payload.subject) || _trimOrNull(event.title);
        if (nextSubject !== null) {
            updates.push(`subject = $${idx++}`);
            values.push(nextSubject);
        }
    }
    if (event.start_time) {
        updates.push(`scheduled_for = $${idx++}`);
        values.push(event.start_time);
    }
    if (payload.toEmail !== undefined) {
        const nextEmail = _normalizeEmail(payload.toEmail);
        if (nextEmail) {
            updates.push(`to_email = $${idx++}`);
            values.push(nextEmail);
            updates.push(`user_id = (SELECT userid FROM users WHERE LOWER(email) = LOWER($${idx - 1}) LIMIT 1)`);
        }
    } else if (event.client_user_id !== undefined && event.client_user_id !== null) {
        updates.push(`user_id = $${idx++}`);
        values.push(event.client_user_id);
    }
    if (payload.clientName !== undefined) {
        const nextName = _trimOrNull(payload.clientName);
        if (nextName) {
            updates.push(`client_name = $${idx++}`);
            values.push(nextName);
        }
    } else if (event.client_name) {
        updates.push(`client_name = $${idx++}`);
        values.push(event.client_name);
    } else if (event.lead_name) {
        updates.push(`client_name = $${idx++}`);
        values.push(event.lead_name);
    }
    if (payload.templateKey !== undefined) {
        const nextKey = _trimOrNull(payload.templateKey) || 'GENERAL';
        updates.push(`template_key = $${idx++}`);
        values.push(nextKey);
    }
    if (payload.templateData !== undefined
        && payload.templateData !== null
        && typeof payload.templateData === 'object'
        && Object.keys(payload.templateData).length > 0) {
        updates.push(`template_data = $${idx++}`);
        values.push(JSON.stringify(payload.templateData));
    }

    if (updates.length === 0) return;

    values.push(reminderRow.id);
    await dbClient.query(
        `UPDATE scheduled_email_reminders SET ${updates.join(', ')}
         WHERE id = $${idx} AND status = 'PENDING'`,
        values
    );
}

/**
 * Cleanly remove the calendar event mirror for a reminder.
 *
 * Sequence: clear the FK first (so ON DELETE CASCADE on calendar_events doesn't
 * re-delete the reminder row), then DELETE the calendar_events row.
 * Returns the calendar_event_id that was unlinked, or null if none existed.
 */
async function unlinkAndDeleteCalendarEventForReminder(reminderId, opts = {}) {
    const dbClient = opts.client || pool;
    if (!reminderId) return null;
    if (!(await _isCalendarSyncAvailable(dbClient))) return null;

    const { rows: snapshot } = await dbClient.query(
        'SELECT calendar_event_id FROM scheduled_email_reminders WHERE id = $1',
        [reminderId]
    );
    const prevEventId = snapshot[0]?.calendar_event_id ?? null;
    if (prevEventId === null) return null;

    // Clear FK first so ON DELETE CASCADE on calendar_events doesn't drop the reminder.
    await dbClient.query(
        'UPDATE scheduled_email_reminders SET calendar_event_id = NULL WHERE id = $1',
        [reminderId]
    );
    await dbClient.query(
        'DELETE FROM calendar_events WHERE id = $1',
        [prevEventId]
    );
    return prevEventId;
}

/**
 * Before deleting a calendar event, cancel or unlink any paired reminders so
 * ON DELETE CASCADE does not hard-delete scheduled_email_reminders rows.
 *
 * PENDING reminders → CANCELLED (mirrors cancelReminder UI flow).
 * Other statuses    → FK cleared only (audit/history preserved).
 *
 * @returns {Promise<{ linked: number, cancelled: number }>}
 */
async function unlinkRemindersForCalendarEvent(eventId, opts = {}) {
    const dbClient = opts.client || pool;
    if (!eventId) return { linked: 0, cancelled: 0 };
    if (!(await _isCalendarSyncAvailable(dbClient))) return { linked: 0, cancelled: 0 };

    const { rows } = await dbClient.query(
        `SELECT id, status FROM scheduled_email_reminders WHERE calendar_event_id = $1`,
        [eventId]
    );
    if (!rows.length) return { linked: 0, cancelled: 0 };

    let cancelled = 0;
    for (const row of rows) {
        if (row.status === 'PENDING') {
            await dbClient.query(
                `UPDATE scheduled_email_reminders
                 SET status = 'CANCELLED',
                     cancelled_at = NOW(),
                     calendar_event_id = NULL
                 WHERE id = $1`,
                [row.id]
            );
            cancelled += 1;
        } else {
            await dbClient.query(
                'UPDATE scheduled_email_reminders SET calendar_event_id = NULL WHERE id = $1',
                [row.id]
            );
        }
    }
    return { linked: rows.length, cancelled };
}

module.exports = {
    createCalendarEventForReminder,
    createReminderForCalendarEvent,
    updateCalendarEventForReminder,
    updateReminderForCalendarEvent,
    unlinkAndDeleteCalendarEventForReminder,
    unlinkRemindersForCalendarEvent,
};

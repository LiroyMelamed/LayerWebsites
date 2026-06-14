/**
 * calendarController.js
 *
 * Handles all logic for the Synchronized Calendar module:
 *   CRUD      – calendar_events (per-user, optional case link)
 *   Dashboard – GET /today  (today + tomorrow appointments widget)
 *   iCal feed – public tokenized WebCal subscription endpoint
 *   Google    – OAuth2 flow, token storage (encrypted), event sync
 *   Outlook   – Microsoft Graph OAuth2 flow, token storage (encrypted), event sync
 *
 * Security:
 *   - All authenticated routes use JWT (authMiddleware + requireLawyerOrAdmin).
 *   - Google tokens encrypted with AES-256-GCM before DB storage.
 *   - iCal feed uses an opaque per-user UUID token (no JWT required on feed URL).
 *   - Raw SQL only — no ORM.
 */

const pool = require('../config/db');
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const settingsService = require('../services/settingsService');
const {
    loadWorkingSchedule,
    validateEventAgainstSchedule,
} = require('../lib/calendarWorkingHours');
const {
    REMINDABLE_EVENT_TYPES,
    loadAllowedReminderOffsets,
    loadAllowedReminderChannels,
    normalizeReminderOffsets,
    normalizeReminderChannels,
    offsetsToJson,
    channelsToJson,
    parseStoredOffsets,
    parseStoredSentOffsets,
    parseStoredChannels,
    hasAnyReminderChannel,
} = require('../lib/calendarEventReminders');

// ─── Optional peer deps (graceful-fail if not yet installed) ──────────────────
let ical;
try { ical = require('ical-generator'); } catch (_) { ical = null; }

let googleapis;
try { googleapis = require('googleapis'); } catch (_) { googleapis = null; }
// ──────────────────────────────────────────────────────────────────────────────

/** Public API origin for iCal/WebCal links (must hit the API host, not the SPA). */
function _resolvePublicApiOrigin() {
    const explicit = String(
        process.env.PUBLIC_API_BASE_URL
        || process.env.API_PUBLIC_ORIGIN
        || ''
    ).trim().replace(/\/+$/, '');
    if (explicit) {
        return explicit.replace(/\/api$/i, '');
    }

    const website = String(process.env.WEBSITE_DOMAIN || '').trim();
    if (!website) return '';

    const host = website.replace(/^https?:\/\//, '').split('/')[0];

    if (host.includes('melamedlaw.co.il')) {
        return 'https://api.calls.melamedlaw.co.il';
    }
    if (host.endsWith('.mela-media.co.il') && !host.startsWith('api-')) {
        return `https://api-${host}`;
    }
    return `https://${host}`;
}

function _buildIcalSubscriptionUrls(token) {
    const origin = _resolvePublicApiOrigin();
    const path = `/api/calendar/feed/${token}.ics`;
    const httpsSubscriptionUrl = origin ? `${origin}${path}` : path;
    const subscriptionUrl = `webcal://${httpsSubscriptionUrl.replace(/^https?:\/\//, '')}`;
    return { httpsSubscriptionUrl, subscriptionUrl };
}

// ─── Encryption helpers (AES-256-GCM) ────────────────────────────────────────
// CALENDAR_ENCRYPTION_KEY must be a 64-char hex string (32 bytes) in .env
const _ENC_KEY_HEX = process.env.CALENDAR_ENCRYPTION_KEY || '';

function _getEncKey() {
    if (!_ENC_KEY_HEX || _ENC_KEY_HEX.length !== 64) {
        throw new Error('CALENDAR_ENCRYPTION_KEY must be a 64-char hex string in .env');
    }
    return Buffer.from(_ENC_KEY_HEX, 'hex');
}

/** Encrypt a plaintext string → "iv:ciphertext:authTag" (all base64) */
function encrypt(plaintext) {
    const key = _getEncKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

/** Decrypt a "iv:ciphertext:authTag" string → plaintext */
function decrypt(encoded) {
    if (!encoded) return null;
    const parts = encoded.split(':');
    if (parts.length !== 3) return null;
    try {
        const key = _getEncKey();
        const iv = Buffer.from(parts[0], 'base64');
        const encrypted = Buffer.from(parts[1], 'base64');
        const tag = Buffer.from(parts[2], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (_) {
        return null;
    }
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Google OAuth2 client factory ────────────────────────────────────────────
function _buildOAuth2Client() {
    if (!googleapis) throw new Error('googleapis package is not installed');
    const { google } = googleapis;
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_OAUTH_REDIRECT_URI
    );
}

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
];
// ──────────────────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VALID_EVENT_TYPES = Object.freeze(['appointment', 'leave', 'hearing', 'reminder', 'holiday']);
const INTERNAL_SCOPED_EVENT_TYPES = Object.freeze(['leave', 'reminder', 'holiday']);

function _isValidEventType(value) {
    return VALID_EVENT_TYPES.includes(value);
}

function _isInternalScopedEventType(value) {
    return INTERNAL_SCOPED_EVENT_TYPES.includes(value);
}

async function _resolveReminderOffsets(body, eventType) {
    if (!REMINDABLE_EVENT_TYPES.has(eventType)) {
        return [];
    }
    if (body?.reminder_offsets === undefined) {
        return null;
    }
    const allowed = await loadAllowedReminderOffsets(settingsService);
    return normalizeReminderOffsets(body.reminder_offsets, allowed);
}

function _calendarFkErrorMessage(err) {
    if (err?.code !== '23503') return null;
    const detail = String(err.detail || err.message || '');
    if (/owner_id/.test(detail)) {
        return 'החשבון המחובר לא קיים במערכת. התנתק והתחבר מחדש (ייתכן שמירת הטוקן מסביבה אחרת).';
    }
    if (/client_user_id/.test(detail)) {
        return 'הלקוח שנבחר לא קיים במערכת.';
    }
    if (/manager_user_id/.test(detail)) {
        return 'עורך הדין שנבחר לא קיים במערכת.';
    }
    return null;
}

async function _requireExistingOwner(userId) {
    const id = parseInt(userId, 10);
    if (!Number.isFinite(id) || id <= 0) {
        return { ok: false, status: 401, message: 'נדרשת התחברות מחדש' };
    }
    const { rows } = await pool.query('SELECT 1 FROM users WHERE userid = $1', [id]);
    if (!rows.length) {
        return {
            ok: false,
            status: 401,
            message: 'החשבון המחובר לא קיים במערכת. התנתק והתחבר מחדש (ייתכן שמירת הטוקן מסביבה אחרת).',
        };
    }
    return { ok: true };
}

async function _resolveReminderChannels(body, eventType, reminderOffsets) {
    if (!REMINDABLE_EVENT_TYPES.has(eventType)) {
        return { push: false, sms: false, email: false };
    }
    if (body?.reminder_channels === undefined) {
        return null;
    }
    const allowed = await loadAllowedReminderChannels(settingsService);
    const channels = normalizeReminderChannels(body.reminder_channels, allowed);
    if (eventType !== 'reminder') {
        channels.push = false;
    }
    if (reminderOffsets.length > 0 && !hasAnyReminderChannel(channels)) {
        return { error: 'נבחרו תזכורות אך לא נבחר ערוץ שליחה (Push, SMS או אימייל).' };
    }
    return channels;
}

function _sanitizeEvent(row) {
    return {
        id: row.id,
        ownerId: row.owner_id,
        ownerName: row.owner_name ?? null,
        caseId: row.case_id,
        caseName: row.case_name ?? null,
        title: row.title,
        description: row.description,
        location: row.location,
        eventType: row.event_type || 'appointment',
        clientUserId: row.client_user_id,
        clientName: row.client_name,
        clientDisplayName: row.client_display_name ?? null,
        managerUserId: row.manager_user_id,
        managerName: row.manager_name,
        color: row.color,
        startTime: row.start_time,
        endTime: row.end_time,
        allDay: row.all_day,
        rrule: row.rrule,
        googleEventId: row.google_event_id,
        outlookEventId: row.outlook_event_id,
        leadName: row.lead_name ?? null,
        leadPhone: row.lead_phone ?? null,
        leadEmail: row.lead_email ?? null,
        leadCaseName: row.lead_case_name ?? null,
        lastReminderSentAt: row.last_reminder_sent_at ?? null,
        reminderOffsets: parseStoredOffsets(row.reminder_offsets),
        reminderChannels: parseStoredChannels(row.reminder_channels),
        remindersSentOffsets: parseStoredOffsets(row.reminders_sent_offsets),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/** Normalize a phone string to digits only (matches customerController convention). */
function _normalizePhoneDigits(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    return digits || null;
}

function _parseManagerUserIds(body) {
    const raw = body?.manager_user_ids;
    if (Array.isArray(raw)) {
        return [...new Set(
            raw.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id))
        )];
    }
    const single = body?.manager_user_id != null && body?.manager_user_id !== ''
        ? parseInt(body.manager_user_id, 10)
        : null;
    return Number.isFinite(single) ? [single] : [];
}

async function _fetchEventManagers(eventIds) {
    const map = new Map();
    if (!eventIds?.length) return map;
    const { rows } = await pool.query(
        `SELECT cem.event_id, u.userid AS user_id, u.name
         FROM calendar_event_managers cem
         JOIN users u ON u.userid = cem.user_id
         WHERE cem.event_id = ANY($1::int[])
         ORDER BY cem.event_id, u.name`,
        [eventIds]
    );
    for (const row of rows) {
        if (!map.has(row.event_id)) map.set(row.event_id, []);
        map.get(row.event_id).push({ userId: row.user_id, name: row.name });
    }
    return map;
}

async function _syncEventManagers(eventId, userIds, dbClient = pool) {
    const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
    await dbClient.query('DELETE FROM calendar_event_managers WHERE event_id = $1', [eventId]);
    for (const uid of uniqueIds) {
        await dbClient.query(
            `INSERT INTO calendar_event_managers (event_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT (event_id, user_id) DO NOTHING`,
            [eventId, uid]
        );
    }
    if (!uniqueIds.length) {
        return { managerUserId: null, managerName: null, managers: [] };
    }
    const { rows } = await dbClient.query(
        `SELECT userid, name FROM users WHERE userid = ANY($1::int[]) ORDER BY name`,
        [uniqueIds]
    );
    const managers = rows.map((r) => ({ userId: r.userid, name: r.name }));
    return {
        managerUserId: managers[0]?.userId || null,
        managerName: managers.map((m) => m.name).join(', ') || null,
        managers,
    };
}

function _applyManagersToEvent(sanitized, managers) {
    if (!managers?.length) {
        if (sanitized.managerUserId) {
            sanitized.managers = [{
                userId: sanitized.managerUserId,
                name: sanitized.managerName || '',
            }];
        } else {
            sanitized.managers = [];
        }
        return sanitized;
    }
    sanitized.managers = managers;
    sanitized.managerUserId = managers[0].userId;
    sanitized.managerName = managers.map((m) => m.name).join(', ');
    return sanitized;
}

async function _sanitizeEventWithManagers(row, managersMap) {
    const ev = _sanitizeEvent(row);
    const managers = managersMap?.get(row.id);
    return _applyManagersToEvent(ev, managers);
}

/** SQL fragment: event belongs to lawyer (owner, legacy manager column, or junction). */
function _lawyerMatchSql(lawyerParamIdx) {
    return `(
        ce.owner_id = $${lawyerParamIdx}
        OR ce.manager_user_id = $${lawyerParamIdx}
        OR EXISTS (
            SELECT 1 FROM calendar_event_managers cem
            WHERE cem.event_id = ce.id AND cem.user_id = $${lawyerParamIdx}
        )
        OR (
            ce.manager_user_id IS NULL
            AND ce.manager_name IS NOT NULL
            AND ce.manager_name = (SELECT name FROM users WHERE userid = $${lawyerParamIdx})
        )
    )`;
}

/**
 * Personal calendar (scope=mine):
 *   • holidays — visible to everyone
 *   • leave — my own leave, or leave where I'm the tagged lawyer
 *   • other events — events I'm tagged in (as manager), plus events I own that
 *     have no tagged lawyer at all. Events I created *for another lawyer* do
 *     NOT appear in my personal calendar (they show in the firm calendar).
 */
function _personalCalendarSql(lawyerParamIdx) {
    const p = `$${lawyerParamIdx}`;
    const managedByLawyer = `(
        ce.manager_user_id = ${p}
        OR EXISTS (
            SELECT 1 FROM calendar_event_managers cem
            WHERE cem.event_id = ce.id AND cem.user_id = ${p}
        )
        OR (
            ce.manager_user_id IS NULL
            AND ce.manager_name IS NOT NULL
            AND ce.manager_name = (SELECT name FROM users WHERE userid = ${p})
        )
    )`;
    return `(
        ce.event_type = 'holiday'
        OR (
            ce.event_type = 'leave'
            AND (
                (
                    ce.owner_id = ${p}
                    AND (ce.manager_user_id IS NULL OR ce.manager_user_id = ${p})
                )
                OR (
                    ce.owner_id <> ${p}
                    AND ${managedByLawyer}
                )
            )
        )
        OR (
            ce.event_type NOT IN ('holiday', 'leave')
            AND (
                ${managedByLawyer}
                OR (
                    ce.owner_id = ${p}
                    AND ce.manager_user_id IS NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM calendar_event_managers cem
                        WHERE cem.event_id = ce.id
                    )
                )
            )
        )
    )`;
}

/** Leave belongs to the lawyer taking time off — not whoever created the entry. */
function _resolveEventOwnerId(userId, eventType, managerUserId, managerIds) {
    if (eventType !== 'leave') return userId;
    const ids = managerIds?.length
        ? managerIds
        : (managerUserId ? [managerUserId] : []);
    const primary = ids.find((id) => Number.isFinite(id));
    return primary || userId;
}

/** Ensure the user may read or mutate this event (owner, assigned manager, or Admin). */
async function _requireEventAccess(eventId, userId, userRole) {
    if (String(userRole) === 'Admin') return { ok: true };

    const { rows } = await pool.query(
        `SELECT ce.owner_id,
                ce.manager_user_id,
                EXISTS (
                    SELECT 1 FROM calendar_event_managers cem
                    WHERE cem.event_id = ce.id AND cem.user_id = $2
                ) AS is_manager
         FROM calendar_events ce
         WHERE ce.id = $1`,
        [eventId, userId]
    );
    if (!rows.length) return { ok: false, status: 404, message: 'אירוע לא נמצא' };

    const row = rows[0];
    if (row.owner_id === userId || row.manager_user_id === userId || row.is_manager) {
        return { ok: true };
    }
    return { ok: false, status: 403, message: 'אין הרשאה לגשת לאירוע זה' };
}

/**
 * Validate that an event falls within the firm's per-day working schedule.
 * Returns { ok: true } or { ok: false, message }. All-day events skip the hours check.
 */
async function _validateWorkingHours(startTime, endTime, allDay) {
    const schedule = await loadWorkingSchedule(settingsService);
    return validateEventAgainstSchedule(startTime, endTime, allDay, schedule);
}

/** Firm policy — lawyers may connect/sync Google only when enabled by admin. */
async function _isGoogleSyncEnabledForFirm() {
    const raw = await settingsService.getSetting('calendar', 'GOOGLE_SYNC_ENABLED', 'true');
    return String(raw ?? 'true').trim().toLowerCase() !== 'false';
}

/** Firm policy — lawyers may connect/sync Outlook only when enabled by admin. */
async function _isOutlookSyncEnabledForFirm() {
    const raw = await settingsService.getSetting('calendar', 'OUTLOOK_SYNC_ENABLED', 'true');
    return String(raw ?? 'true').trim().toLowerCase() !== 'false';
}

function _isAllDayInternalEventType(eventType) {
    return eventType === 'leave' || eventType === 'holiday';
}
// ──────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/calendar/events    (alias: GET /api/calendar)
 *
 * Lists calendar events with contextual privacy and dynamic multi-axis filters.
 *
 * Query parameters (all optional):
 *   • scope         'mine' (default) | 'firm' — mine = personal (managers/holidays); firm = all
 *   • lawyer_id     int   — pin to owner or manager (overrides scope)
 *   • client_id     int   — events linked to this client_user_id
 *   • case_id       int   — events for this case
 *   • event_type    'appointment' | 'leave' | 'hearing' | 'reminder' | 'holiday'
 *   • from / to     ISO timestamptz — window over start_time
 *   • limit/offset  pagination (default 500 / 0, max 1000)
 *
 * Joins owner/client/case for display so the calendar UI can color-code
 * by lawyer and surface case names without an extra round-trip per event.
 */
const listEvents = async (req, res) => {
    const userId = req.user.UserId;
    const {
        scope = 'mine',
        from,
        to,
        lawyer_id,
        client_id,
        case_id,
        event_type,
        limit = 500,
        offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    // Contextual privacy:
    //   • lawyer_id wins (owner, legacy manager column, or junction managers)
    //   • else scope=mine  → holidays, manager-tagged, or owned with connected lawyers
    //   • else scope=firm  → no owner filter (firm-wide)
    const requestedLawyerId = lawyer_id ? parseInt(lawyer_id, 10) : null;
    if (lawyer_id && !Number.isFinite(requestedLawyerId)) {
        return res.status(400).json({ message: 'מזהה עורך דין לא תקין' });
    }
    if (requestedLawyerId) {
        if (scope !== 'firm') {
            return res.status(400).json({ message: 'סינון עורך דין זמין רק בתצוגת משרד' });
        }
        conditions.push(_lawyerMatchSql(idx));
        idx++;
        params.push(requestedLawyerId);
    } else if (scope !== 'firm') {
        conditions.push(_personalCalendarSql(idx));
        idx++;
        params.push(userId);
    }

    if (from && to) {
        conditions.push(
            `tstzrange(ce.start_time, ce.end_time, '[)') && tstzrange($${idx}::timestamptz, $${idx + 1}::timestamptz, '[)')`
        );
        params.push(from, to);
        idx += 2;
    } else {
        if (from) { conditions.push(`ce.start_time >= $${idx++}`); params.push(from); }
        if (to) { conditions.push(`ce.end_time > $${idx++}`); params.push(to); }
    }

    if (client_id) {
        const cid = parseInt(client_id, 10);
        if (!Number.isFinite(cid)) return res.status(400).json({ message: 'מזהה לקוח לא תקין' });
        conditions.push(`ce.client_user_id = $${idx++}`);
        params.push(cid);
    }
    if (case_id) {
        const cid = parseInt(case_id, 10);
        if (!Number.isFinite(cid)) return res.status(400).json({ message: 'מזהה תיק לא תקין' });
        conditions.push(`ce.case_id = $${idx++}`);
        params.push(cid);
    }
    if (event_type) {
        if (!_isValidEventType(event_type)) {
            return res.status(400).json({ message: 'סוג אירוע לא תקין' });
        }
        conditions.push(`ce.event_type = $${idx++}`);
        params.push(event_type);
    }

    const lim = Math.min(parseInt(limit, 10) || 500, 1000);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    params.push(lim, off);

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const { rows } = await pool.query(
            `SELECT ce.*,
                    u_owner.name  AS owner_name,
                    u_client.name AS client_display_name,
                    c.casename    AS case_name
             FROM   calendar_events ce
             LEFT JOIN users u_owner  ON u_owner.userid  = ce.owner_id
             LEFT JOIN users u_client ON u_client.userid = ce.client_user_id
             LEFT JOIN cases c        ON c.caseid        = ce.case_id
             ${whereSql}
             ORDER BY ce.start_time ASC
             LIMIT $${idx++} OFFSET $${idx++}`,
            params
        );
        const eventIds = rows.map((r) => r.id);
        const managersMap = await _fetchEventManagers(eventIds);
        const events = await Promise.all(
            rows.map((r) => _sanitizeEventWithManagers(r, managersMap))
        );
        return res.json({ events });
    } catch (err) {
        console.error('[calendarController] listEvents error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * GET /api/calendar/today
 * Returns events for today and tomorrow — used by the dashboard widget.
 */
const getTodayAndTomorrow = async (req, res) => {
    const userId = req.user.UserId;
    try {
        const { rows } = await pool.query(
            `SELECT ce.* FROM calendar_events ce
             WHERE ${_personalCalendarSql(1)}
               AND ce.start_time >= (NOW() AT TIME ZONE 'Asia/Jerusalem')::date AT TIME ZONE 'Asia/Jerusalem'
               AND ce.start_time <  ((NOW() AT TIME ZONE 'Asia/Jerusalem')::date + INTERVAL '2 days') AT TIME ZONE 'Asia/Jerusalem'
             ORDER BY ce.start_time ASC
             LIMIT 20`,
            [userId]
        );
        return res.json({ events: rows.map(_sanitizeEvent) });
    } catch (err) {
        console.error('[calendarController] getTodayAndTomorrow error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * POST /api/calendar
 * Create a new calendar event.
 *
 * Accepts an `event_type` ('appointment' | 'leave' | 'hearing' | 'reminder' | 'holiday') and optional prospect/lead
 * fields (`lead_name`, `lead_phone`, `lead_email`). A row is either lead-mode OR
 * client-mode; the DB CHECK chk_calendar_events_lead_xor_client enforces this,
 * but we re-validate in JS to return a friendlier 400 message.
 */
const createEvent = async (req, res) => {
    const userId = req.user.UserId;
    const ownerCheck = await _requireExistingOwner(userId);
    if (!ownerCheck.ok) {
        return res.status(ownerCheck.status).json({ message: ownerCheck.message });
    }

    const {
        title,
        description,
        location,
        event_type,
        client_user_id,
        client_name,
        manager_user_id,
        manager_name,
        color,
        start_time,
        end_time,
        all_day,
        rrule,
        case_id,
        lead_name,
        lead_phone,
        lead_email,
        lead_case_name,
    } = req.body;

    if (!title || !start_time || !end_time) {
        return res.status(400).json({ message: 'כותרת, שעת התחלה ושעת סיום הם שדות חובה' });
    }
    if (new Date(end_time) < new Date(start_time)) {
        return res.status(400).json({ message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
    }

    const eventType = event_type || 'appointment';
    if (!_isValidEventType(eventType)) {
        return res.status(400).json({ message: 'סוג אירוע לא תקין' });
    }

    // Lead vs client mutual exclusion (mirrors DB CHECK for a clearer error)
    const hasLead = !!(lead_name || lead_phone || lead_email);
    let caseId = case_id ? parseInt(case_id, 10) : null;
    if (case_id && !Number.isFinite(caseId)) {
        return res.status(400).json({ message: 'מזהה תיק לא תקין' });
    }
    let clientUserId = client_user_id ? parseInt(client_user_id, 10) : null;
    if (client_user_id && !Number.isFinite(clientUserId)) {
        return res.status(400).json({ message: 'מזהה לקוח לא תקין' });
    }
    if (hasLead) {
        caseId = null;
        clientUserId = null;
    }
    const leadCaseName = lead_case_name ? String(lead_case_name).trim() : null;
    const managerIds = _parseManagerUserIds(req.body);
    const managerUserId = managerIds[0] ?? (manager_user_id ? parseInt(manager_user_id, 10) : null);
    if (manager_user_id && !Number.isFinite(parseInt(manager_user_id, 10))) {
        return res.status(400).json({ message: 'מזהה מנהל לא תקין' });
    }
    if (managerIds.some((id) => !Number.isFinite(id))) {
        return res.status(400).json({ message: 'מזהה מנהל לא תקין' });
    }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(String(color))) {
        return res.status(400).json({ message: 'צבע אירוע לא תקין' });
    }
    const hasClientLink = !!(clientUserId || caseId);
    if (hasLead && hasClientLink) {
        return res.status(400).json({
            message: 'לא ניתן לשמור פרטי ליד לצד תיק/לקוח קיים',
            code: 'LEAD_AND_CLIENT_MUTUALLY_EXCLUSIVE',
        });
    }
    if (_isInternalScopedEventType(eventType) && hasLead) {
        return res.status(400).json({ message: 'אירוע פנימי (חופשה, חג או תזכורת) לא יכול להכיל פרטי ליד' });
    }

    // Internal-scoped events are lawyer-scoped — they may fall outside working hours.
    const storedAllDay = _isAllDayInternalEventType(eventType) ? true : !!all_day;
    if (!_isInternalScopedEventType(eventType)) {
        const workingCheck = await _validateWorkingHours(start_time, end_time, storedAllDay);
        if (!workingCheck.ok) {
            return res.status(400).json({ message: workingCheck.message });
        }
    }

    const reminderOffsets = await _resolveReminderOffsets(req.body, eventType);
    const storedReminderOffsets = reminderOffsets ?? [];
    const resolvedChannels = await _resolveReminderChannels(req.body, eventType, storedReminderOffsets);
    if (resolvedChannels?.error) {
        return res.status(400).json({ message: resolvedChannels.error });
    }
    const storedReminderChannels = resolvedChannels ?? { push: false, sms: false, email: false };
    const ownerId = _resolveEventOwnerId(userId, eventType, managerUserId, managerIds);

    try {
        const { rows } = await pool.query(
            `INSERT INTO calendar_events
               (owner_id, case_id, title, description, location, event_type,
                client_user_id, client_name, manager_user_id, manager_name, color,
                start_time, end_time, all_day, rrule,
                lead_name, lead_phone, lead_email, lead_case_name,
                reminder_offsets, reminder_channels, reminders_sent_offsets)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb, '[]'::jsonb)
             RETURNING *`,
            [
                ownerId,
                caseId,
                title.trim(),
                description || null,
                location || null,
                eventType,
                clientUserId,
                hasLead ? null : (client_name || null),
                managerUserId,
                manager_name || null,
                color || null,
                start_time,
                end_time,
                storedAllDay,
                rrule || null,
                lead_name ? String(lead_name).trim() : null,
                lead_phone ? String(lead_phone).trim() : null,
                lead_email ? String(lead_email).trim().toLowerCase() : null,
                hasLead ? (leadCaseName || null) : null,
                offsetsToJson(storedReminderOffsets),
                channelsToJson(storedReminderChannels),
            ]
        );
        const created = rows[0];
        const mgrMeta = await _syncEventManagers(created.id, managerIds.length ? managerIds : (managerUserId ? [managerUserId] : []));
        if (mgrMeta.managerUserId && (mgrMeta.managerUserId !== created.manager_user_id || mgrMeta.managerName !== created.manager_name)) {
            await pool.query(
                'UPDATE calendar_events SET manager_user_id = $1, manager_name = $2 WHERE id = $3',
                [mgrMeta.managerUserId, mgrMeta.managerName, created.id]
            );
            created.manager_user_id = mgrMeta.managerUserId;
            created.manager_name = mgrMeta.managerName;
        }
        const event = _applyManagersToEvent(_sanitizeEvent(created), mgrMeta.managers);
        return res.status(201).json({ event });
    } catch (err) {
        // Unique violation on partial lead index = duplicate active lead for this lawyer
        if (err?.code === '23505' && /uq_calendar_events_owner_active_lead_phone/.test(err.message || '')) {
            return res.status(409).json({
                message: 'קיים כבר ליד פעיל עם מספר טלפון זה ביומן שלך',
                code: 'DUPLICATE_ACTIVE_LEAD',
            });
        }
        const fkMsg = _calendarFkErrorMessage(err);
        if (fkMsg) return res.status(400).json({ message: fkMsg });
        console.error('[calendarController] createEvent error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * GET /api/calendar/:id
 * Get a single event by ID (owner only).
 */
const getEvent = async (req, res) => {
    const userId = req.user.UserId;
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId)) return res.status(400).json({ message: 'מזהה אירוע לא תקין' });

    const ownership = await _requireEventAccess(eventId, userId, req.user?.Role);
    if (!ownership.ok) return res.status(ownership.status).json({ message: ownership.message });

    try {
        const { rows } = await pool.query('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
        const managersMap = await _fetchEventManagers([eventId]);
        const event = await _sanitizeEventWithManagers(rows[0], managersMap);
        return res.json({ event });
    } catch (err) {
        console.error('[calendarController] getEvent error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * PUT /api/calendar/:id
 * Update an existing event (owner only).
 * Resets sent-reminder state when time or reminder selection changes.
 */
const updateEvent = async (req, res) => {
    const userId = req.user.UserId;
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId)) return res.status(400).json({ message: 'מזהה אירוע לא תקין' });

    const ownership = await _requireEventAccess(eventId, userId, req.user?.Role);
    if (!ownership.ok) return res.status(ownership.status).json({ message: ownership.message });

    const {
        title,
        description,
        location,
        event_type,
        client_user_id,
        client_name,
        manager_user_id,
        manager_name,
        color,
        start_time,
        end_time,
        all_day,
        rrule,
        case_id,
        lead_name,
        lead_phone,
        lead_email,
        lead_case_name,
        manager_user_ids,
        reminder_offsets,
    } = req.body;

    if (start_time && end_time && new Date(end_time) < new Date(start_time)) {
        return res.status(400).json({ message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
    }
    if (event_type !== undefined && !_isValidEventType(event_type)) {
        return res.status(400).json({ message: 'סוג אירוע לא תקין' });
    }
    if (client_user_id !== undefined && client_user_id !== null && client_user_id !== '' && !Number.isFinite(parseInt(client_user_id, 10))) {
        return res.status(400).json({ message: 'מזהה לקוח לא תקין' });
    }
    if (manager_user_id !== undefined && manager_user_id !== null && manager_user_id !== '' && !Number.isFinite(parseInt(manager_user_id, 10))) {
        return res.status(400).json({ message: 'מזהה מנהל לא תקין' });
    }
    if (color !== undefined && color !== null && color !== '' && !/^#[0-9a-fA-F]{6}$/.test(String(color))) {
        return res.status(400).json({ message: 'צבע אירוע לא תקין' });
    }

    try {
        // Fetch current row so we can keep unset fields as-is
        const { rows: current } = await pool.query(
            'SELECT * FROM calendar_events WHERE id = $1', [eventId]
        );
        const ev = current[0];

        const newStart = start_time || ev.start_time;
        const newEnd = end_time || ev.end_time;
        const newEventType = event_type !== undefined ? event_type : (ev.event_type || 'appointment');
        const newAllDay = _isAllDayInternalEventType(newEventType)
            ? true
            : (all_day !== undefined ? !!all_day : ev.all_day);
        const timeChanged =
            (start_time && new Date(start_time).getTime() !== new Date(ev.start_time).getTime()) ||
            (end_time && new Date(end_time).getTime() !== new Date(ev.end_time).getTime());
        const resolvedReminderOffsets = await _resolveReminderOffsets(req.body, newEventType);
        const nextReminderOffsets = resolvedReminderOffsets !== null
            ? resolvedReminderOffsets
            : parseStoredOffsets(ev.reminder_offsets);
        const currentReminderOffsets = parseStoredOffsets(ev.reminder_offsets);
        const remindersChanged = resolvedReminderOffsets !== null
            && offsetsToJson(nextReminderOffsets) !== offsetsToJson(currentReminderOffsets);
        const resolvedChannels = await _resolveReminderChannels(req.body, newEventType, nextReminderOffsets);
        if (resolvedChannels?.error) {
            return res.status(400).json({ message: resolvedChannels.error });
        }
        const nextReminderChannels = resolvedChannels !== null
            ? resolvedChannels
            : parseStoredChannels(ev.reminder_channels);
        const currentReminderChannels = parseStoredChannels(ev.reminder_channels);
        const channelsChanged = resolvedChannels !== null
            && channelsToJson(nextReminderChannels) !== channelsToJson(currentReminderChannels);
        const resetRemindersSent = timeChanged || remindersChanged || channelsChanged;

        // Skip working-hours guard for internally-scoped events — see createEvent for rationale.
        if (!_isInternalScopedEventType(newEventType)) {
            const workingCheck = await _validateWorkingHours(newStart, newEnd, newAllDay);
            if (!workingCheck.ok) {
                return res.status(400).json({ message: workingCheck.message });
            }
        }

        const nextClientUserId = client_user_id !== undefined ? (parseInt(client_user_id, 10) || null) : ev.client_user_id;
        const nextCaseId = case_id !== undefined ? (parseInt(case_id, 10) || null) : ev.case_id;
        const nextLeadName = lead_name !== undefined ? (lead_name ? String(lead_name).trim() : null) : ev.lead_name;
        const nextLeadPhone = lead_phone !== undefined ? (lead_phone ? String(lead_phone).trim() : null) : ev.lead_phone;
        const nextLeadEmail = lead_email !== undefined
            ? (lead_email ? String(lead_email).trim().toLowerCase() : null)
            : ev.lead_email;
        const nextLeadCaseName = lead_case_name !== undefined
            ? (lead_case_name ? String(lead_case_name).trim() : null)
            : ev.lead_case_name;

        // Lead vs client mutual exclusion (mirrors DB CHECK for a clearer error)
        const hasLead = !!(nextLeadName || nextLeadPhone || nextLeadEmail);
        let resolvedClientUserId = nextClientUserId;
        let resolvedCaseId = nextCaseId;
        if (hasLead) {
            resolvedClientUserId = null;
            resolvedCaseId = null;
        }
        const resolvedClientName = hasLead
            ? null
            : (client_name !== undefined ? (client_name || null) : ev.client_name);
        const hasClientLink = !!(resolvedClientUserId || resolvedCaseId);
        if (hasLead && hasClientLink) {
            return res.status(400).json({
                message: 'לא ניתן לשמור פרטי ליד לצד תיק/לקוח קיים',
                code: 'LEAD_AND_CLIENT_MUTUALLY_EXCLUSIVE',
            });
        }
        if (_isInternalScopedEventType(newEventType) && hasLead) {
            return res.status(400).json({ message: 'אירוע פנימי (חופשה, חג או תזכורת) לא יכול להכיל פרטי ליד' });
        }

        const parsedManagerIds = manager_user_ids !== undefined
            ? _parseManagerUserIds(req.body)
            : null;
        if (parsedManagerIds && parsedManagerIds.some((id) => !Number.isFinite(id))) {
            return res.status(400).json({ message: 'מזהה מנהל לא תקין' });
        }

        const nextManagerUserId = manager_user_id !== undefined
            ? (parseInt(manager_user_id, 10) || null)
            : (parsedManagerIds?.[0] ?? ev.manager_user_id);
        const nextManagerName = manager_name !== undefined ? manager_name : ev.manager_name;
        const nextOwnerId = _resolveEventOwnerId(
            ev.owner_id,
            newEventType,
            nextManagerUserId,
            parsedManagerIds ?? (nextManagerUserId ? [nextManagerUserId] : [])
        );

        const { rows } = await pool.query(
            `UPDATE calendar_events SET
               title                  = $1,
               description            = $2,
               location               = $3,
               event_type             = $4,
               client_user_id         = $5,
               client_name            = $6,
               manager_user_id        = $7,
               manager_name           = $8,
               color                  = $9,
               start_time             = $10,
               end_time               = $11,
               all_day                = $12,
               rrule                  = $13,
               case_id                = $14,
               lead_name              = $15,
               lead_phone             = $16,
               lead_email             = $17,
               lead_case_name         = $18,
               reminder_offsets       = $19::jsonb,
               reminder_channels      = $20::jsonb,
               reminders_sent_offsets = $21::jsonb,
               last_reminder_sent_at  = $22,
               owner_id               = $23
             WHERE id = $24
             RETURNING *`,
            [
                (title || ev.title).trim(),
                description !== undefined ? description : ev.description,
                location !== undefined ? location : ev.location,
                newEventType,
                resolvedClientUserId,
                resolvedClientName,
                nextManagerUserId,
                nextManagerName,
                color !== undefined ? (color || null) : ev.color,
                newStart,
                end_time || ev.end_time,
                newAllDay,
                rrule !== undefined ? rrule : ev.rrule,
                resolvedCaseId,
                nextLeadName,
                nextLeadPhone,
                nextLeadEmail,
                hasLead ? nextLeadCaseName : null,
                offsetsToJson(REMINDABLE_EVENT_TYPES.has(newEventType) ? nextReminderOffsets : []),
                channelsToJson(REMINDABLE_EVENT_TYPES.has(newEventType) ? nextReminderChannels : { push: false, sms: false, email: false }),
                resetRemindersSent ? '[]' : offsetsToJson(parseStoredSentOffsets(ev.reminders_sent_offsets)),
                resetRemindersSent ? null : ev.last_reminder_sent_at,
                nextOwnerId,
                eventId,
            ]
        );
        let updated = rows[0];
        if (parsedManagerIds !== null) {
            const mgrMeta = await _syncEventManagers(eventId, parsedManagerIds);
            if (mgrMeta.managerUserId !== updated.manager_user_id || mgrMeta.managerName !== updated.manager_name) {
                await pool.query(
                    'UPDATE calendar_events SET manager_user_id = $1, manager_name = $2 WHERE id = $3',
                    [mgrMeta.managerUserId, mgrMeta.managerName, eventId]
                );
                updated = { ...updated, manager_user_id: mgrMeta.managerUserId, manager_name: mgrMeta.managerName };
            }
            return res.json({ event: _applyManagersToEvent(_sanitizeEvent(updated), mgrMeta.managers) });
        }
        const managersMap = await _fetchEventManagers([eventId]);
        return res.json({ event: await _sanitizeEventWithManagers(updated, managersMap) });
    } catch (err) {
        if (err?.code === '23505' && /uq_calendar_events_owner_active_lead_phone/.test(err.message || '')) {
            return res.status(409).json({
                message: 'קיים כבר ליד פעיל עם מספר טלפון זה ביומן שלך',
                code: 'DUPLICATE_ACTIVE_LEAD',
            });
        }
        const fkMsg = _calendarFkErrorMessage(err);
        if (fkMsg) return res.status(400).json({ message: fkMsg });
        console.error('[calendarController] updateEvent error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * DELETE /api/calendar/:id
 * Delete an event (owner only).
 */
const deleteEvent = async (req, res) => {
    const userId = req.user.UserId;
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId)) return res.status(400).json({ message: 'מזהה אירוע לא תקין' });

    const ownership = await _requireEventAccess(eventId, userId, req.user?.Role);
    if (!ownership.ok) return res.status(ownership.status).json({ message: ownership.message });

    try {
        await pool.query('DELETE FROM calendar_events WHERE id = $1', [eventId]);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[calendarController] deleteEvent error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// iCal / WebCal FEED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/calendar/feed/token   (auth required)
 * Returns (or creates) the iCal subscription token for the requesting user.
 * The frontend uses this token to build the subscription URL shown to the user:
 *   webcal://<host>/api/calendar/feed/<token>
 */
const getIcalToken = async (req, res) => {
    const userId = req.user.UserId;
    try {
        // Upsert: create row with a fresh UUID token if it doesn't exist
        const { rows } = await pool.query(
            `INSERT INTO user_calendar_tokens (user_id, ical_feed_token)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE
               SET ical_feed_token = COALESCE(user_calendar_tokens.ical_feed_token, EXCLUDED.ical_feed_token)
             RETURNING ical_feed_token`,
            [userId, uuidv4()]
        );
        const token = rows[0].ical_feed_token;
        return res.json({ token, ..._buildIcalSubscriptionUrls(token) });
    } catch (err) {
        console.error('[calendarController] getIcalToken error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * POST /api/calendar/feed/rotate-token   (auth required)
 * Regenerates the iCal token — invalidates the previous subscription URL.
 */
const rotateIcalToken = async (req, res) => {
    const userId = req.user.UserId;
    const newToken = uuidv4();
    try {
        await pool.query(
            `INSERT INTO user_calendar_tokens (user_id, ical_feed_token)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET ical_feed_token = $2`,
            [userId, newToken]
        );
        return res.json({ token: newToken, ..._buildIcalSubscriptionUrls(newToken) });
    } catch (err) {
        console.error('[calendarController] rotateIcalToken error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * GET /api/calendar/feed/:token   (PUBLIC — no JWT required)
 * Serves a live iCal feed for Apple Calendar / Google Calendar subscription.
 * The token acts as a per-user secret; rotating it breaks existing subscriptions.
 */
const serveIcalFeed = async (req, res) => {
    if (!ical) {
        return res.status(503).send('iCal feed not available — ical-generator package not installed');
    }

    // Strip optional .ics suffix so WebCal clients that append it still work
    const rawToken = (req.params.token || '').replace(/\.ics$/i, '').trim();
    if (!rawToken) return res.status(400).send('Missing token');

    try {
        // Resolve user from token (no JWT involved — the token IS the auth)
        const tokenRow = await pool.query(
            'SELECT user_id FROM user_calendar_tokens WHERE ical_feed_token = $1',
            [rawToken]
        );
        if (!tokenRow.rows.length) return res.status(404).send('Feed not found');
        const userId = tokenRow.rows[0].user_id;

        // Fetch user name for the calendar title
        const userRow = await pool.query(
            'SELECT name FROM users WHERE userid = $1', [userId]
        );
        const userName = userRow.rows[0]?.name || 'עורך דין';

        // Fetch future + recent events (same visibility as the personal calendar)
        const { rows: events } = await pool.query(
            `SELECT ce.* FROM calendar_events ce
             WHERE ${_personalCalendarSql(1)}
               AND ce.end_time >= NOW() - INTERVAL '30 days'
             ORDER BY ce.start_time ASC
             LIMIT 500`,
            [userId]
        );

        const firmName = process.env.LAW_FIRM_NAME || process.env.COMPANY_NAME || 'Melamedia';
        const feedDomain = (process.env.WEBSITE_DOMAIN || 'melamedia.app').replace(/^https?:\/\//, '');
        const calendar = ical.default
            ? ical.default({ name: `${firmName} — ${userName}`, ttl: 900 })
            : ical({ name: `${firmName} — ${userName}`, ttl: 900 });

        for (const ev of events) {
            const eventObj = {
                id: `melamedia-event-${ev.id}@${feedDomain}`,
                start: new Date(ev.start_time),
                end: new Date(ev.end_time),
                summary: ev.title,
                allDay: ev.all_day,
                lastModified: ev.updated_at ? new Date(ev.updated_at) : undefined,
            };
            if (ev.description) eventObj.description = ev.description;
            if (ev.location) eventObj.location = ev.location;
            calendar.createEvent(eventObj);
        }

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="calendar.ics"`);
        // Prevent aggressive caching so subscriptions stay fresh
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(calendar.toString());
    } catch (err) {
        console.error('[calendarController] serveIcalFeed error:', err.message);
        return res.status(500).send('Internal server error');
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR OAUTH2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/calendar/google/auth-url   (auth required)
 * Returns the Google OAuth2 authorization URL.
 * The frontend redirects the user to this URL to begin the consent flow.
 */
const getGoogleAuthUrl = async (req, res) => {
    if (!googleapis) {
        return res.status(503).json({ message: 'Google Calendar integration not configured' });
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(503).json({ message: 'Google Calendar integration not configured' });
    }
    if (!(await _isGoogleSyncEnabledForFirm())) {
        return res.status(403).json({
            message: 'סנכרון Google Calendar מושבת בהגדרות המשרד',
            code: 'GOOGLE_SYNC_DISABLED',
        });
    }

    try {
        const oauth2Client = _buildOAuth2Client();
        // Encode the requesting user's ID in the state parameter so the callback
        // knows which user to associate the tokens with.
        const state = Buffer.from(JSON.stringify({ userId: req.user.UserId })).toString('base64url');

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',   // request refresh token
            prompt: 'consent',   // force consent screen to always receive refresh_token
            scope: GOOGLE_SCOPES,
            state,
        });
        return res.json({ authUrl: url });
    } catch (err) {
        console.error('[calendarController] getGoogleAuthUrl error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * GET /api/calendar/google/callback   (PUBLIC — Google redirects here after consent)
 * Exchanges the authorization code for tokens, encrypts them, and stores in DB.
 * Redirects the browser back to the frontend with ?google_connected=1 or ?google_error=1.
 */
const handleGoogleCallback = async (req, res) => {
    const frontendBase = process.env.FRONTEND_URL || process.env.WEBSITE_DOMAIN || 'http://localhost:3000';
    const successRedirect = `${frontendBase}/AdminStack/CalendarScreen?google_connected=1`;
    const errorRedirect = `${frontendBase}/AdminStack/CalendarScreen?google_error=1`;

    const { code, state, error } = req.query;
    if (error || !code || !state) {
        console.warn('[calendarController] Google callback: consent denied or missing params');
        return res.redirect(errorRedirect);
    }

    let userId;
    try {
        userId = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')).userId;
        if (!Number.isFinite(Number(userId))) throw new Error('invalid userId in state');
    } catch (err) {
        console.warn('[calendarController] Google callback: invalid state param', err.message);
        return res.redirect(errorRedirect);
    }

    try {
        if (!(await _isGoogleSyncEnabledForFirm())) {
            console.warn('[calendarController] Google callback rejected: firm sync disabled');
            return res.redirect(errorRedirect);
        }

        const oauth2Client = _buildOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Fetch Google account email for display in the UI
        const { google } = googleapis;
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const googleEmail = userInfo.data.email || '';

        const encAccessToken = tokens.access_token ? encrypt(tokens.access_token) : null;
        const encRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
        const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
        const scope = tokens.scope || GOOGLE_SCOPES.join(' ');

        await pool.query(
            `INSERT INTO user_calendar_tokens
               (user_id, google_connected, google_email,
                google_access_token, google_refresh_token, google_token_expiry, google_scope)
             VALUES ($1, TRUE, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) DO UPDATE SET
               google_connected    = TRUE,
               google_email        = $2,
               google_access_token = $3,
               google_refresh_token = COALESCE($4, user_calendar_tokens.google_refresh_token),
               google_token_expiry  = $5,
               google_scope         = $6`,
            [userId, googleEmail, encAccessToken, encRefreshToken, tokenExpiry, scope]
        );

        return res.redirect(successRedirect);
    } catch (err) {
        console.error('[calendarController] handleGoogleCallback error:', err.message);
        return res.redirect(errorRedirect);
    }
};

/**
 * GET /api/calendar/google/status   (auth required)
 * Returns whether Google Calendar is connected and the linked email.
 */
const getGoogleStatus = async (req, res) => {
    const userId = req.user.UserId;
    try {
        const googleSyncAllowed = await _isGoogleSyncEnabledForFirm();
        const { rows } = await pool.query(
            'SELECT google_connected, google_email, google_scope FROM user_calendar_tokens WHERE user_id = $1',
            [userId]
        );
        if (!rows.length || !rows[0].google_connected) {
            return res.json({ connected: false, googleSyncAllowed });
        }
        return res.json({
            connected: true,
            email: rows[0].google_email,
            scope: rows[0].google_scope,
            googleSyncAllowed,
        });
    } catch (err) {
        console.error('[calendarController] getGoogleStatus error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * DELETE /api/calendar/google/disconnect   (auth required)
 * Revokes the Google token and clears it from DB.
 */
const disconnectGoogle = async (req, res) => {
    const userId = req.user.UserId;
    try {
        const { rows } = await pool.query(
            'SELECT google_access_token, google_refresh_token FROM user_calendar_tokens WHERE user_id = $1',
            [userId]
        );

        if (rows.length && rows[0].google_access_token && googleapis) {
            try {
                const accessToken = decrypt(rows[0].google_access_token);
                if (accessToken) {
                    const oauth2Client = _buildOAuth2Client();
                    oauth2Client.setCredentials({ access_token: accessToken });
                    await oauth2Client.revokeCredentials();
                }
            } catch (revokeErr) {
                // Non-fatal — proceed to clear from DB regardless
                console.warn('[calendarController] Google revoke warning:', revokeErr.message);
            }
        }

        await pool.query(
            `UPDATE user_calendar_tokens SET
               google_connected    = FALSE,
               google_email        = NULL,
               google_access_token  = NULL,
               google_refresh_token = NULL,
               google_token_expiry  = NULL,
               google_scope         = NULL
             WHERE user_id = $1`,
            [userId]
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('[calendarController] disconnectGoogle error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * POST /api/calendar/google/sync   (auth required)
 * Pulls events from the user's Google Calendar and upserts them into calendar_events.
 * Uses google_event_id as the idempotency key.
 */
const syncGoogleEvents = async (req, res) => {
    if (!googleapis) {
        return res.status(503).json({ message: 'Google Calendar integration not configured' });
    }
    if (!(await _isGoogleSyncEnabledForFirm())) {
        return res.status(403).json({
            message: 'סנכרון Google Calendar מושבת בהגדרות המשרד',
            code: 'GOOGLE_SYNC_DISABLED',
        });
    }

    const userId = req.user.UserId;

    try {
        const { rows } = await pool.query(
            `SELECT google_access_token, google_refresh_token, google_token_expiry
             FROM user_calendar_tokens
             WHERE user_id = $1 AND google_connected = TRUE`,
            [userId]
        );

        if (!rows.length) {
            return res.status(400).json({ message: 'Google Calendar לא מחובר. יש לחבר קודם.' });
        }

        const row = rows[0];
        const accessToken = decrypt(row.google_access_token);
        const refreshToken = decrypt(row.google_refresh_token);

        if (!accessToken && !refreshToken) {
            return res.status(400).json({ message: 'אסימון Google אינו תקין. יש לחבר מחדש.' });
        }

        const oauth2Client = _buildOAuth2Client();
        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
            expiry_date: row.google_token_expiry ? new Date(row.google_token_expiry).getTime() : undefined,
        });

        // Auto-refresh handler: persist new tokens to DB
        oauth2Client.on('tokens', async (newTokens) => {
            try {
                const updates = [];
                const vals = [userId];
                let i = 2;
                if (newTokens.access_token) {
                    updates.push(`google_access_token = $${i++}`);
                    vals.push(encrypt(newTokens.access_token));
                }
                if (newTokens.refresh_token) {
                    updates.push(`google_refresh_token = $${i++}`);
                    vals.push(encrypt(newTokens.refresh_token));
                }
                if (newTokens.expiry_date) {
                    updates.push(`google_token_expiry = $${i++}`);
                    vals.push(new Date(newTokens.expiry_date));
                }
                if (updates.length) {
                    await pool.query(
                        `UPDATE user_calendar_tokens SET ${updates.join(', ')} WHERE user_id = $1`,
                        vals
                    );
                }
            } catch (persistErr) {
                console.warn('[calendarController] Failed to persist refreshed tokens:', persistErr.message);
            }
        });

        const { google } = googleapis;
        const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

        // Match iCal feed window: recent past + upcoming year. Paginate through all pages.
        const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        const googleEvents = [];
        let pageToken;
        do {
            const listRes = await calendarApi.events.list({
                calendarId: 'primary',
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 250,
                pageToken: pageToken || undefined,
            });
            googleEvents.push(...(listRes.data.items || []));
            pageToken = listRes.data.nextPageToken;
        } while (pageToken);

        let upsertCount = 0;
        let failedCount = 0;

        for (const gev of googleEvents) {
            if (gev.status === 'cancelled') continue;
            if (!gev.id) continue;

            const startTime = gev.start?.dateTime || (gev.start?.date ? `${gev.start.date}T00:00:00Z` : null);
            const endTime = gev.end?.dateTime || (gev.end?.date ? `${gev.end.date}T23:59:59Z` : null);
            if (!startTime || !endTime) continue;

            const allDay = !gev.start?.dateTime;

            try {
                await pool.query(
                    `INSERT INTO calendar_events
                       (owner_id, title, description, location, start_time, end_time, all_day, google_event_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (owner_id, google_event_id) WHERE google_event_id IS NOT NULL DO UPDATE SET
                       title       = EXCLUDED.title,
                       description = EXCLUDED.description,
                       location    = EXCLUDED.location,
                       start_time  = EXCLUDED.start_time,
                       end_time    = EXCLUDED.end_time,
                       all_day     = EXCLUDED.all_day`,
                    [
                        userId,
                        (gev.summary || '(ללא כותרת)').trim(),
                        gev.description || null,
                        gev.location || null,
                        startTime,
                        endTime,
                        allDay,
                        gev.id,
                    ]
                );
                upsertCount++;
            } catch (upsertErr) {
                failedCount++;
                console.error('[calendarController] Google sync upsert failed:', gev.id, upsertErr.message);
            }
        }

        return res.json({ ok: true, synced: upsertCount, total: googleEvents.length, failed: failedCount });
    } catch (err) {
        console.error('[calendarController] syncGoogleEvents error:', err.message);
        // Token revoked / expired and couldn't refresh → prompt reconnect
        if (err.code === 401 || String(err.message).includes('invalid_grant')) {
            await pool.query(
                `UPDATE user_calendar_tokens SET google_connected = FALSE WHERE user_id = $1`,
                [userId]
            );
            return res.status(401).json({ message: 'חיבור Google פג תוקפו. יש לחבר מחדש.', reconnect: true });
        }
        return res.status(500).json({ message: 'שגיאה בסנכרון Google Calendar' });
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// OUTLOOK CALENDAR OAUTH2 (Microsoft Graph)
// ═══════════════════════════════════════════════════════════════════════════════

const OUTLOOK_SCOPES = ['offline_access', 'Calendars.ReadWrite', 'User.Read'];
const OUTLOOK_AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';

function _isOutlookConfigured() {
    return !!(
        process.env.OUTLOOK_CLIENT_ID
        && process.env.OUTLOOK_CLIENT_SECRET
        && process.env.OUTLOOK_OAUTH_REDIRECT_URI
    );
}

function _buildOutlookAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        response_type: 'code',
        redirect_uri: process.env.OUTLOOK_OAUTH_REDIRECT_URI,
        response_mode: 'query',
        scope: OUTLOOK_SCOPES.join(' '),
        state,
    });
    return `${OUTLOOK_AUTH_BASE}/authorize?${params.toString()}`;
}

async function _exchangeOutlookAuthCode(code) {
    const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.OUTLOOK_OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: OUTLOOK_SCOPES.join(' '),
    });
    const { data } = await axios.post(`${OUTLOOK_AUTH_BASE}/token`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
    });
    return data;
}

async function _refreshOutlookAccessToken(refreshToken) {
    const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: OUTLOOK_SCOPES.join(' '),
    });
    const { data } = await axios.post(`${OUTLOOK_AUTH_BASE}/token`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
    });
    return data;
}

async function _outlookGraphGet(accessToken, pathOrUrl) {
    const url = String(pathOrUrl).startsWith('http')
        ? pathOrUrl
        : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
    const { data } = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'outlook.timezone="UTC"',
        },
        timeout: 20000,
    });
    return data;
}

function _parseOutlookEventTimes(oev) {
    if (oev.isAllDay || (oev.start?.date && !oev.start?.dateTime)) {
        const start = oev.start?.date;
        const end = oev.end?.date;
        if (!start || !end) return null;
        return {
            startTime: `${start}T00:00:00Z`,
            endTime: `${end}T23:59:59Z`,
            allDay: true,
        };
    }
    const startRaw = oev.start?.dateTime;
    const endRaw = oev.end?.dateTime;
    if (!startRaw || !endRaw) return null;
    const startTime = new Date(`${startRaw}${startRaw.endsWith('Z') ? '' : 'Z'}`).toISOString();
    const endTime = new Date(`${endRaw}${endRaw.endsWith('Z') ? '' : 'Z'}`).toISOString();
    return { startTime, endTime, allDay: false };
}

async function _persistOutlookTokens(userId, {
    accessToken,
    refreshToken,
    tokenExpiry,
    scope,
    email,
    connected = true,
}) {
    await pool.query(
        `INSERT INTO user_calendar_tokens
           (user_id, outlook_connected, outlook_email,
            outlook_access_token, outlook_refresh_token, outlook_token_expiry, outlook_scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           outlook_connected     = EXCLUDED.outlook_connected,
           outlook_email         = EXCLUDED.outlook_email,
           outlook_access_token  = EXCLUDED.outlook_access_token,
           outlook_refresh_token = COALESCE(EXCLUDED.outlook_refresh_token, user_calendar_tokens.outlook_refresh_token),
           outlook_token_expiry  = EXCLUDED.outlook_token_expiry,
           outlook_scope         = EXCLUDED.outlook_scope`,
        [
            userId,
            connected,
            email || null,
            accessToken ? encrypt(accessToken) : null,
            refreshToken ? encrypt(refreshToken) : null,
            tokenExpiry || null,
            scope || OUTLOOK_SCOPES.join(' '),
        ]
    );
}

async function _resolveOutlookAccessToken(userId, row) {
    let accessToken = decrypt(row.outlook_access_token);
    const refreshToken = decrypt(row.outlook_refresh_token);
    const expiry = row.outlook_token_expiry ? new Date(row.outlook_token_expiry) : null;
    const isExpired = expiry && expiry.getTime() <= Date.now() + 60_000;

    if ((!accessToken || isExpired) && refreshToken) {
        const refreshed = await _refreshOutlookAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        const tokenExpiry = refreshed.expires_in
            ? new Date(Date.now() + Number(refreshed.expires_in) * 1000)
            : null;
        await _persistOutlookTokens(userId, {
            accessToken,
            refreshToken: refreshed.refresh_token || refreshToken,
            tokenExpiry,
            scope: refreshed.scope || row.outlook_scope,
            email: row.outlook_email,
            connected: true,
        });
    }

    return accessToken;
}

/**
 * GET /api/calendar/outlook/auth-url   (auth required)
 */
const getOutlookAuthUrl = async (req, res) => {
    if (!_isOutlookConfigured()) {
        return res.status(503).json({ message: 'Outlook Calendar integration not configured' });
    }
    if (!(await _isOutlookSyncEnabledForFirm())) {
        return res.status(403).json({
            message: 'סנכרון Outlook Calendar מושבת בהגדרות המשרד',
            code: 'OUTLOOK_SYNC_DISABLED',
        });
    }

    try {
        const state = Buffer.from(JSON.stringify({ userId: req.user.UserId })).toString('base64url');
        return res.json({ authUrl: _buildOutlookAuthorizeUrl(state) });
    } catch (err) {
        console.error('[calendarController] getOutlookAuthUrl error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * GET /api/calendar/outlook/callback   (PUBLIC)
 */
const handleOutlookCallback = async (req, res) => {
    const frontendBase = process.env.FRONTEND_URL || process.env.WEBSITE_DOMAIN || 'http://localhost:3000';
    const successRedirect = `${frontendBase}/AdminStack/CalendarScreen?outlook_connected=1`;
    const errorRedirect = `${frontendBase}/AdminStack/CalendarScreen?outlook_error=1`;

    const { code, state, error } = req.query;
    if (error || !code || !state) {
        console.warn('[calendarController] Outlook callback: consent denied or missing params');
        return res.redirect(errorRedirect);
    }

    let userId;
    try {
        userId = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')).userId;
        if (!Number.isFinite(Number(userId))) throw new Error('invalid userId in state');
    } catch (err) {
        console.warn('[calendarController] Outlook callback: invalid state param', err.message);
        return res.redirect(errorRedirect);
    }

    try {
        if (!(await _isOutlookSyncEnabledForFirm())) {
            console.warn('[calendarController] Outlook callback rejected: firm sync disabled');
            return res.redirect(errorRedirect);
        }

        const tokens = await _exchangeOutlookAuthCode(code);
        const accessToken = tokens.access_token;
        if (!accessToken) throw new Error('missing access_token');

        const profile = await _outlookGraphGet(accessToken, '/me?$select=mail,userPrincipalName');
        const outlookEmail = profile.mail || profile.userPrincipalName || '';
        const tokenExpiry = tokens.expires_in
            ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
            : null;

        await _persistOutlookTokens(userId, {
            accessToken,
            refreshToken: tokens.refresh_token || null,
            tokenExpiry,
            scope: tokens.scope || OUTLOOK_SCOPES.join(' '),
            email: outlookEmail,
            connected: true,
        });

        return res.redirect(successRedirect);
    } catch (err) {
        console.error('[calendarController] handleOutlookCallback error:', err.message);
        return res.redirect(errorRedirect);
    }
};

/**
 * GET /api/calendar/outlook/status   (auth required)
 */
const getOutlookStatus = async (req, res) => {
    const userId = req.user.UserId;
    try {
        const outlookSyncAllowed = await _isOutlookSyncEnabledForFirm();
        const { rows } = await pool.query(
            'SELECT outlook_connected, outlook_email, outlook_scope FROM user_calendar_tokens WHERE user_id = $1',
            [userId]
        );
        if (!rows.length || !rows[0].outlook_connected) {
            return res.json({ connected: false, outlookSyncAllowed });
        }
        return res.json({
            connected: true,
            email: rows[0].outlook_email,
            scope: rows[0].outlook_scope,
            outlookSyncAllowed,
        });
    } catch (err) {
        console.error('[calendarController] getOutlookStatus error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * DELETE /api/calendar/outlook/disconnect   (auth required)
 */
const disconnectOutlook = async (req, res) => {
    const userId = req.user.UserId;
    try {
        await pool.query(
            `UPDATE user_calendar_tokens SET
               outlook_connected     = FALSE,
               outlook_email         = NULL,
               outlook_access_token  = NULL,
               outlook_refresh_token = NULL,
               outlook_token_expiry  = NULL,
               outlook_scope         = NULL
             WHERE user_id = $1`,
            [userId]
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('[calendarController] disconnectOutlook error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * POST /api/calendar/outlook/sync   (auth required)
 */
const syncOutlookEvents = async (req, res) => {
    if (!_isOutlookConfigured()) {
        return res.status(503).json({ message: 'Outlook Calendar integration not configured' });
    }
    if (!(await _isOutlookSyncEnabledForFirm())) {
        return res.status(403).json({
            message: 'סנכרון Outlook Calendar מושבת בהגדרות המשרד',
            code: 'OUTLOOK_SYNC_DISABLED',
        });
    }

    const userId = req.user.UserId;

    try {
        const { rows } = await pool.query(
            `SELECT outlook_access_token, outlook_refresh_token, outlook_token_expiry,
                    outlook_email, outlook_scope
             FROM user_calendar_tokens
             WHERE user_id = $1 AND outlook_connected = TRUE`,
            [userId]
        );

        if (!rows.length) {
            return res.status(400).json({ message: 'Outlook Calendar לא מחובר. יש לחבר קודם.' });
        }

        const row = rows[0];
        const accessToken = await _resolveOutlookAccessToken(userId, row);
        if (!accessToken) {
            return res.status(400).json({ message: 'אסימון Outlook אינו תקין. יש לחבר מחדש.' });
        }

        const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        const outlookEvents = [];
        let nextUrl = `/me/calendarview?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$top=250&$orderby=start/dateTime`;
        while (nextUrl) {
            const page = await _outlookGraphGet(accessToken, nextUrl);
            outlookEvents.push(...(page.value || []));
            nextUrl = page['@odata.nextLink'] || null;
        }

        let upsertCount = 0;
        let failedCount = 0;

        for (const oev of outlookEvents) {
            if (oev.isCancelled) continue;
            if (!oev.id) continue;

            const parsedTimes = _parseOutlookEventTimes(oev);
            if (!parsedTimes) continue;
            const { startTime, endTime, allDay } = parsedTimes;
            const description = typeof oev.body?.content === 'string' ? oev.body.content : null;
            const location = oev.location?.displayName || null;

            try {
                await pool.query(
                    `INSERT INTO calendar_events
                       (owner_id, title, description, location, start_time, end_time, all_day, outlook_event_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (owner_id, outlook_event_id) WHERE outlook_event_id IS NOT NULL DO UPDATE SET
                       title       = EXCLUDED.title,
                       description = EXCLUDED.description,
                       location    = EXCLUDED.location,
                       start_time  = EXCLUDED.start_time,
                       end_time    = EXCLUDED.end_time,
                       all_day     = EXCLUDED.all_day`,
                    [
                        userId,
                        (oev.subject || '(ללא כותרת)').trim(),
                        description,
                        location,
                        startTime,
                        endTime,
                        allDay,
                        oev.id,
                    ]
                );
                upsertCount++;
            } catch (upsertErr) {
                failedCount++;
                console.error('[calendarController] Outlook sync upsert failed:', oev.id, upsertErr.message);
            }
        }

        return res.json({ ok: true, synced: upsertCount, total: outlookEvents.length, failed: failedCount });
    } catch (err) {
        console.error('[calendarController] syncOutlookEvents error:', err.message);
        const status = err?.response?.status;
        const errCode = err?.response?.data?.error;
        if (status === 401 || errCode === 'invalid_grant') {
            await pool.query(
                'UPDATE user_calendar_tokens SET outlook_connected = FALSE WHERE user_id = $1',
                [userId]
            );
            return res.status(401).json({ message: 'חיבור Outlook פג תוקפו. יש לחבר מחדש.', reconnect: true });
        }
        return res.status(500).json({ message: 'שגיאה בסנכרון Outlook Calendar' });
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// CRM — conflict check, client-case dropdown, link-case, convert-lead
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/calendar/check-conflict
 *
 * Application-layer overlap detector (soft warning — no DB-level EXCLUDE constraint).
 * Returns any of the target lawyer's events whose time window intersects [start_time, end_time).
 *
 * Body: { start_time, end_time, lawyer_id?, lawyer_ids?, exclude_event_id? }
 *   • lawyer_id defaults to req.user.UserId
 *   • exclude_event_id is required when editing an existing event to avoid self-collision
 *
 * Returns: { hasConflict, hasLeaveConflict, conflicts: Event[] }
 */
const checkConflict = async (req, res) => {
    const userId = req.user.UserId;
    const { start_time, end_time, lawyer_id, lawyer_ids, exclude_event_id } = req.body || {};

    if (!start_time || !end_time) {
        return res.status(400).json({ message: 'נא לציין שעת התחלה וסיום לבדיקת התנגשויות' });
    }
    if (new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
    }

    let targetLawyerIds = [];
    if (Array.isArray(lawyer_ids) && lawyer_ids.length) {
        targetLawyerIds = [...new Set(
            lawyer_ids.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id))
        )];
    } else if (lawyer_id != null && lawyer_id !== '') {
        const single = parseInt(lawyer_id, 10);
        if (Number.isFinite(single)) targetLawyerIds = [single];
    } else {
        targetLawyerIds = [userId];
    }
    if (!targetLawyerIds.length) {
        return res.status(400).json({ message: 'מזהה עורך דין לא תקין' });
    }

    const excludeId = exclude_event_id ? parseInt(exclude_event_id, 10) : null;
    if (exclude_event_id != null && !Number.isFinite(excludeId)) {
        return res.status(400).json({ message: 'מזהה אירוע לא תקין' });
    }

    try {
        const allRows = [];
        for (const targetLawyerId of targetLawyerIds) {
            const { rows } = await pool.query(
                `SELECT ce.*,
                        u_owner.name  AS owner_name,
                        u_client.name AS client_display_name,
                        c.casename    AS case_name
                 FROM   calendar_events ce
                 LEFT JOIN users u_owner  ON u_owner.userid  = ce.owner_id
                 LEFT JOIN users u_client ON u_client.userid = ce.client_user_id
                 LEFT JOIN cases c        ON c.caseid        = ce.case_id
                 WHERE  ${_lawyerMatchSql(1)}
                   AND  ($4::int IS NULL OR ce.id <> $4)
                   AND  tstzrange(ce.start_time, ce.end_time, '[)')
                        && tstzrange($2::timestamptz, $3::timestamptz, '[)')
                 ORDER BY ce.start_time ASC
                 LIMIT  20`,
                [targetLawyerId, start_time, end_time, excludeId]
            );
            for (const row of rows) {
                if (!allRows.some((existing) => existing.id === row.id)) {
                    allRows.push(row);
                }
            }
        }
        allRows.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        const hasLeave = allRows.some((r) => r.event_type === 'leave' || r.event_type === 'holiday');
        return res.json({
            hasConflict: allRows.length > 0,
            hasLeaveConflict: hasLeave,
            conflicts: allRows.slice(0, 20).map(_sanitizeEvent),
        });
    } catch (err) {
        console.error('[calendarController] checkConflict error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};


/**
 * GET /api/calendar/clients/:clientUserId/cases
 *
 * Returns active (non-closed) cases for the given client — powers the on-the-fly
 * case-link dropdown inside EventFormModal.
 */
const getClientCases = async (req, res) => {
    const clientUserId = parseInt(req.params.clientUserId, 10);
    if (!Number.isFinite(clientUserId)) {
        return res.status(400).json({ message: 'מזהה לקוח לא תקין' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT c.caseid        AS id,
                    c.casename      AS name,
                    c.currentstage  AS stage,
                    c.isclosed      AS is_closed,
                    c.casemanagerid AS case_manager_id,
                    c.casemanager   AS case_manager_name,
                    c.updatedat     AS updated_at
             FROM   cases c
             JOIN   case_users cu ON cu.caseid = c.caseid
             WHERE  cu.userid  = $1
               AND  c.isclosed = FALSE
             ORDER BY c.updatedat DESC NULLS LAST, c.caseid DESC
             LIMIT 50`,
            [clientUserId]
        );
        return res.json({ cases: rows });
    } catch (err) {
        console.error('[calendarController] getClientCases error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};


/**
 * PATCH /api/calendar/:id/link-case
 *
 * Attach (or clear) an existing case on a calendar event.
 * Owner-scoped — only the event's owner or an Admin can link.
 * Refuses to link while the row is still in lead-mode (must convert first).
 *
 * Body: { case_id: number | null }
 */
const linkCase = async (req, res) => {
    const userId = req.user.UserId;
    const userRole = req.user.Role;
    const eventId = parseInt(req.params.id, 10);
    const rawCaseId = req.body?.case_id;
    const caseId = rawCaseId == null || rawCaseId === '' ? null : parseInt(rawCaseId, 10);

    if (!Number.isFinite(eventId)) {
        return res.status(400).json({ message: 'מזהה אירוע לא תקין' });
    }
    if (rawCaseId != null && rawCaseId !== '' && !Number.isFinite(caseId)) {
        return res.status(400).json({ message: 'מזהה תיק לא תקין' });
    }

    try {
        const { rows: evRows } = await pool.query(
            `SELECT id, owner_id, lead_name, lead_phone, lead_email
             FROM   calendar_events WHERE id = $1`,
            [eventId]
        );
        if (!evRows.length) {
            return res.status(404).json({ message: 'אירוע לא נמצא' });
        }
        const ev = evRows[0];

        if (ev.owner_id !== userId && userRole !== 'Admin') {
            return res.status(403).json({ message: 'אין הרשאה לעדכן אירוע זה' });
        }

        // The DB CHECK would reject the UPDATE if lead_* are still set; surface a 400 first.
        if (caseId != null && (ev.lead_name || ev.lead_phone || ev.lead_email)) {
            return res.status(400).json({
                message: 'יש להפוך תחילה את הליד ללקוח לפני שיוך לתיק',
                code: 'LEAD_NOT_CONVERTED',
            });
        }

        if (caseId != null) {
            const { rows: caseRows } = await pool.query(
                `SELECT caseid FROM cases WHERE caseid = $1 LIMIT 1`, [caseId]
            );
            if (!caseRows.length) {
                return res.status(404).json({ message: 'תיק לא נמצא' });
            }
        }

        const { rows } = await pool.query(
            `WITH updated AS (
                UPDATE calendar_events
                SET    case_id    = $1,
                       updated_at = NOW()
                WHERE  id = $2
                RETURNING *
             )
             SELECT u.*, c.casename AS case_name
             FROM   updated u
             LEFT JOIN cases c ON c.caseid = u.case_id`,
            [caseId, eventId]
        );
        return res.json({ event: _sanitizeEvent(rows[0]) });
    } catch (err) {
        console.error('[calendarController] linkCase error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};


/**
 * POST /api/calendar/convert-lead
 *
 * Atomic lead→client promotion. Inside a single transaction:
 *   1. SELECT … FOR UPDATE on the event (locks against concurrent converters)
 *   2. Dedupe an existing client by normalized phone (regexp_replace '\D' → '')
 *   3. INSERT into users when no match (passwordhash NULL, role 'User')
 *   4. UPDATE the event: attach client_user_id + client_name, null out lead_* (no auto case shell)
 *
 * Body: { eventId }
 */
const convertLead = async (req, res) => {
    const userId = req.user.UserId;
    const userRole = req.user.Role;
    const evId = parseInt(req.body?.eventId, 10);

    if (!Number.isFinite(evId)) {
        return res.status(400).json({ message: 'מזהה אירוע לא תקין' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock the event row
        const { rows: evRows } = await client.query(
            `SELECT id, owner_id, case_id, client_user_id,
                    lead_name, lead_phone, lead_email, lead_case_name, title
             FROM   calendar_events
             WHERE  id = $1
             FOR UPDATE`,
            [evId]
        );
        if (!evRows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'אירוע לא נמצא' });
        }
        const ev = evRows[0];

        if (ev.owner_id !== userId && userRole !== 'Admin') {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'אין הרשאה לבצע פעולה זו' });
        }
        if (ev.client_user_id) {
            const { rows: userRows } = await client.query(
                `SELECT userid, name, email, phonenumber
                 FROM   users
                 WHERE  userid = $1`,
                [ev.client_user_id]
            );
            const { rows: freshEvent } = await client.query(
                `SELECT ce.*, c.casename AS case_name
                 FROM   calendar_events ce
                 LEFT JOIN cases c ON c.caseid = ce.case_id
                 WHERE  ce.id = $1`,
                [evId]
            );
            await client.query('ROLLBACK');
            const u = userRows[0] || {};
            return res.json({
                event: _sanitizeEvent(freshEvent[0] || ev),
                client: {
                    id: ev.client_user_id,
                    name: u.name || ev.client_name || null,
                    email: u.email || null,
                    phone: u.phonenumber || null,
                },
                alreadyConverted: true,
            });
        }
        if (!ev.lead_name && !ev.lead_phone && !ev.lead_email) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: 'אין פרטי ליד להמרה באירוע זה',
                code: 'NO_LEAD_DATA',
            });
        }

        const phoneDigits = _normalizePhoneDigits(ev.lead_phone);

        // 2. Dedupe by normalized phone
        let clientUserId = null;
        let clientDisplayName = ev.lead_name || null;
        if (phoneDigits) {
            const { rows: existing } = await client.query(
                `SELECT userid, name, email, phonenumber
                 FROM   users
                 WHERE  regexp_replace(phonenumber, '\\D', '', 'g') = $1
                 LIMIT 1`,
                [phoneDigits]
            );
            if (existing.length) {
                clientUserId = existing[0].userid;
                clientDisplayName = existing[0].name || clientDisplayName;
            }
        }

        if (!clientUserId && ev.lead_email) {
            const { rows: existingEmail } = await client.query(
                `SELECT userid, name, email, phonenumber
                 FROM   users
                 WHERE  role = 'User'
                   AND  email IS NOT NULL
                   AND  lower(trim(email)) = lower(trim($1))
                 LIMIT 1`,
                [ev.lead_email]
            );
            if (existingEmail.length) {
                clientUserId = existingEmail[0].userid;
                clientDisplayName = existingEmail[0].name || clientDisplayName;
            }
        }

        // 3. Insert new client when no dedupe hit
        if (!clientUserId) {
            const fallbackName = ev.lead_name
                || (ev.lead_phone ? `לקוח ${ev.lead_phone}` : 'לקוח חדש');
            const { rows: ins } = await client.query(
                `INSERT INTO users
                   (name, email, phonenumber, passwordhash, role, companyname, dateofbirth, createdat)
                 VALUES ($1, $2, $3, NULL, 'User', NULL, NULL, NOW())
                 RETURNING userid, name`,
                [
                    fallbackName,
                    ev.lead_email || null,
                    ev.lead_phone || null,
                ]
            );
            clientUserId = ins[0].userid;
            clientDisplayName = ins[0].name;
        }

        // 4. Promote the event — attach client only; case is created via the standard case form.
        const { rows: updated } = await client.query(
            `UPDATE calendar_events
             SET    client_user_id = $1,
                    client_name    = $2,
                    lead_name      = NULL,
                    lead_phone     = NULL,
                    lead_email     = NULL,
                    lead_case_name = NULL,
                    updated_at     = NOW()
             WHERE  id = $3
             RETURNING *`,
            [clientUserId, clientDisplayName, evId]
        );

        const { rows: joined } = await client.query(
            `SELECT ce.*, c.casename AS case_name
             FROM   calendar_events ce
             LEFT JOIN cases c ON c.caseid = ce.case_id
             WHERE  ce.id = $1`,
            [evId]
        );

        const { rows: clientRow } = await client.query(
            `SELECT userid, name, email, phonenumber FROM users WHERE userid = $1`,
            [clientUserId]
        );

        await client.query('COMMIT');

        return res.json({
            event: _sanitizeEvent(joined[0] || updated[0]),
            client: {
                id: clientUserId,
                name: clientDisplayName,
                email: clientRow[0]?.email || ev.lead_email || null,
                phone: clientRow[0]?.phonenumber || ev.lead_phone || null,
            },
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        if (err?.code === '23505') {
            return res.status(409).json({
                message: 'מספר הטלפון כבר רשום במערכת אצל לקוח אחר',
                code: 'PHONE_ALREADY_EXISTS',
            });
        }
        if (err?.code === '23514') {
            console.error('[calendarController] convertLead CHECK violation:', err.message);
            return res.status(500).json({ message: 'שגיאה בסנכרון נתוני המרת הליד' });
        }
        console.error('[calendarController] convertLead error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת בעת המרת ליד ללקוח' });
    } finally {
        client.release();
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════
module.exports = {
    // CRUD
    listEvents,
    getTodayAndTomorrow,
    createEvent,
    getEvent,
    updateEvent,
    deleteEvent,
    // CRM (Step 2)
    checkConflict,
    getClientCases,
    linkCase,
    convertLead,
    // iCal
    getIcalToken,
    rotateIcalToken,
    serveIcalFeed,
    // Google
    getGoogleAuthUrl,
    handleGoogleCallback,
    getGoogleStatus,
    disconnectGoogle,
    syncGoogleEvents,
    // Outlook
    getOutlookAuthUrl,
    handleOutlookCallback,
    getOutlookStatus,
    disconnectOutlook,
    syncOutlookEvents,
};

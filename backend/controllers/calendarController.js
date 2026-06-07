/**
 * calendarController.js
 *
 * Handles all logic for the Synchronized Calendar module:
 *   CRUD      – calendar_events (per-user, optional case link)
 *   Dashboard – GET /today  (today + tomorrow appointments widget)
 *   iCal feed – public tokenized WebCal subscription endpoint
 *   Google    – OAuth2 flow, token storage (encrypted), event sync
 *
 * Security:
 *   - All authenticated routes use JWT (authMiddleware + requireLawyerOrAdmin).
 *   - Google tokens encrypted with AES-256-GCM before DB storage.
 *   - iCal feed uses an opaque per-user UUID token (no JWT required on feed URL).
 *   - Raw SQL only — no ORM.
 */

const pool = require('../config/db');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const settingsService = require('../services/settingsService');

// ─── Optional peer deps (graceful-fail if not yet installed) ──────────────────
let ical;
try { ical = require('ical-generator'); } catch (_) { ical = null; }

let googleapis;
try { googleapis = require('googleapis'); } catch (_) { googleapis = null; }
// ──────────────────────────────────────────────────────────────────────────────

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
const VALID_EVENT_TYPES = Object.freeze(['appointment', 'leave', 'hearing', 'reminder']);
const INTERNAL_SCOPED_EVENT_TYPES = Object.freeze(['leave', 'reminder']);

function _isValidEventType(value) {
    return VALID_EVENT_TYPES.includes(value);
}

function _isInternalScopedEventType(value) {
    return INTERNAL_SCOPED_EVENT_TYPES.includes(value);
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
        leadName: row.lead_name ?? null,
        leadPhone: row.lead_phone ?? null,
        leadEmail: row.lead_email ?? null,
        leadCaseName: row.lead_case_name ?? null,
        lastReminderSentAt: row.last_reminder_sent_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/** Normalize a phone string to digits only (matches customerController convention). */
function _normalizePhoneDigits(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    return digits || null;
}

/** Ensure the event belongs to the requesting user */
async function _requireOwnership(eventId, userId) {
    const { rows } = await pool.query(
        'SELECT owner_id FROM calendar_events WHERE id = $1',
        [eventId]
    );
    if (!rows.length) return { ok: false, status: 404, message: 'אירוע לא נמצא' };
    if (rows[0].owner_id !== userId) return { ok: false, status: 403, message: 'אין הרשאה לגשת לאירוע זה' };
    return { ok: true };
}

const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const TENANT_TIME_ZONE = 'Asia/Jerusalem';

/** Parse "HH:MM" → minutes since midnight. Returns null if malformed. */
function _hhmmToMinutes(str) {
    const m = /^(\d{2}):(\d{2})/.exec(String(str || ''));
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Get the firm day-of-week (0=Sun..6=Sat) and minutes-of-day for a date in the tenant TZ. */
function _localDayAndMinutes(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TENANT_TIME_ZONE,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = parts.find(p => p.type === 'weekday')?.value;
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10) % 24;
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return { day: weekdayMap[wd], minutes: hour * 60 + minute };
}

/**
 * Validate that an event falls within the firm's configured working days/hours.
 * Returns { ok: true } or { ok: false, message }. All-day events skip the hours check.
 */
async function _validateWorkingHours(startTime, endTime, allDay) {
    const daysRaw = await settingsService.getSetting('calendar', 'WORKING_DAYS', '0,1,2,3,4');
    const startRaw = await settingsService.getSetting('calendar', 'WORKING_HOURS_START', '08:00');
    const endRaw = await settingsService.getSetting('calendar', 'WORKING_HOURS_END', '18:00');

    const workingDays = String(daysRaw)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    if (!workingDays.length) return { ok: true };

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start) || isNaN(end)) return { ok: true };

    const startInfo = _localDayAndMinutes(start);

    // Day-of-week check (based on event start)
    if (!workingDays.includes(startInfo.day)) {
        const openDays = workingDays.map(d => HEBREW_DAY_NAMES[d]).join(', ');
        return { ok: false, message: `המשרד פעיל בימים: ${openDays}. לא ניתן לקבוע אירוע ביום ${HEBREW_DAY_NAMES[startInfo.day]}.` };
    }

    if (allDay) return { ok: true };

    const openMin = _hhmmToMinutes(startRaw);
    const closeMin = _hhmmToMinutes(endRaw);
    if (openMin == null || closeMin == null) return { ok: true };

    const endInfo = _localDayAndMinutes(end);

    if (startInfo.minutes < openMin || startInfo.minutes > closeMin) {
        return { ok: false, message: `שעות הפעילות של המשרד הן ${startRaw}–${endRaw}. שעת ההתחלה מחוץ לטווח.` };
    }
    // Allow end exactly at close time; reject if it spills past closing.
    if (endInfo.minutes > closeMin || endInfo.minutes < openMin) {
        return { ok: false, message: `שעות הפעילות של המשרד הן ${startRaw}–${endRaw}. שעת הסיום מחוץ לטווח.` };
    }
    return { ok: true };
}

/** Firm policy — lawyers may connect/sync Google only when enabled by admin. */
async function _isGoogleSyncEnabledForFirm() {
    const raw = await settingsService.getSetting('calendar', 'GOOGLE_SYNC_ENABLED', 'true');
    return String(raw ?? 'true').trim().toLowerCase() !== 'false';
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
 *   • scope         'mine' (default) | 'firm' — firm-wide view of all lawyers
 *   • lawyer_id     int   — pin to owner or manager (overrides scope)
 *   • client_id     int   — events linked to this client_user_id
 *   • case_id       int   — events for this case
 *   • event_type    'appointment' | 'leave' | 'hearing' | 'reminder'
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
    //   • lawyer_id wins (locks to that lawyer)
    //   • else scope=mine  → owner_id = req.user.UserId
    //   • else scope=firm  → no owner filter (firm-wide)
    const requestedLawyerId = lawyer_id ? parseInt(lawyer_id, 10) : null;
    if (lawyer_id && !Number.isFinite(requestedLawyerId)) {
        return res.status(400).json({ message: 'מזהה עורך דין לא תקין' });
    }
    if (requestedLawyerId) {
        conditions.push(`(
            ce.manager_user_id = $${idx}
            OR ce.owner_id = $${idx}
            OR (
                ce.manager_user_id IS NULL
                AND ce.manager_name IS NOT NULL
                AND ce.manager_name = (SELECT name FROM users WHERE userid = $${idx})
            )
        )`);
        idx++;
        params.push(requestedLawyerId);
    } else if (scope !== 'firm') {
        conditions.push(`ce.owner_id = $${idx++}`);
        params.push(userId);
    }

    if (from) { conditions.push(`ce.start_time >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`ce.start_time <= $${idx++}`); params.push(to); }

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
        return res.json({ events: rows.map(_sanitizeEvent) });
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
            `SELECT * FROM calendar_events
             WHERE owner_id = $1
               AND start_time >= NOW()::date
               AND start_time <  NOW()::date + INTERVAL '2 days'
             ORDER BY start_time ASC
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
 * Accepts an `event_type` ('appointment' | 'leave' | 'hearing' | 'reminder') and optional prospect/lead
 * fields (`lead_name`, `lead_phone`, `lead_email`). A row is either lead-mode OR
 * client-mode; the DB CHECK chk_calendar_events_lead_xor_client enforces this,
 * but we re-validate in JS to return a friendlier 400 message.
 */
const createEvent = async (req, res) => {
    const userId = req.user.UserId;
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
    const managerUserId = manager_user_id ? parseInt(manager_user_id, 10) : null;
    if (manager_user_id && !Number.isFinite(managerUserId)) {
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
        return res.status(400).json({ message: 'אירוע חופשה או תזכורת לא יכול להכיל פרטי ליד' });
    }

    // Leave/reminder events are lawyer-scoped — they may fall outside working hours.
    if (!_isInternalScopedEventType(eventType)) {
        const workingCheck = await _validateWorkingHours(start_time, end_time, !!all_day);
        if (!workingCheck.ok) {
            return res.status(400).json({ message: workingCheck.message });
        }
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO calendar_events
               (owner_id, case_id, title, description, location, event_type,
                client_user_id, client_name, manager_user_id, manager_name, color,
                start_time, end_time, all_day, rrule,
                lead_name, lead_phone, lead_email, lead_case_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             RETURNING *`,
            [
                userId,
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
                !!all_day,
                rrule || null,
                lead_name ? String(lead_name).trim() : null,
                lead_phone ? String(lead_phone).trim() : null,
                lead_email ? String(lead_email).trim().toLowerCase() : null,
                hasLead ? (leadCaseName || null) : null,
            ]
        );
        return res.status(201).json({ event: _sanitizeEvent(rows[0]) });
    } catch (err) {
        // Unique violation on partial lead index = duplicate active lead for this lawyer
        if (err?.code === '23505' && /uq_calendar_events_owner_active_lead_phone/.test(err.message || '')) {
            return res.status(409).json({
                message: 'קיים כבר ליד פעיל עם מספר טלפון זה ביומן שלך',
                code: 'DUPLICATE_ACTIVE_LEAD',
            });
        }
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

    const ownership = await _requireOwnership(eventId, userId);
    if (!ownership.ok) return res.status(ownership.status).json({ message: ownership.message });

    try {
        const { rows } = await pool.query('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
        return res.json({ event: _sanitizeEvent(rows[0]) });
    } catch (err) {
        console.error('[calendarController] getEvent error:', err.message);
        return res.status(500).json({ message: 'שגיאה פנימית בשרת' });
    }
};

/**
 * PUT /api/calendar/:id
 * Update an existing event (owner only).
 * Resets reminder flags when time changes so cron worker re-fires reminders.
 */
const updateEvent = async (req, res) => {
    const userId = req.user.UserId;
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId)) return res.status(400).json({ message: 'מזהה אירוע לא תקין' });

    const ownership = await _requireOwnership(eventId, userId);
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
        const newAllDay = all_day !== undefined ? !!all_day : ev.all_day;
        const newEventType = event_type !== undefined ? event_type : (ev.event_type || 'appointment');
        // Reset audit on time change so the cron worker re-fires reminders.
        const timeChanged = start_time && new Date(start_time).getTime() !== new Date(ev.start_time).getTime();

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
            return res.status(400).json({ message: 'אירוע חופשה או תזכורת לא יכול להכיל פרטי ליד' });
        }

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
               last_reminder_sent_at  = $19
             WHERE id = $20
             RETURNING *`,
            [
                (title || ev.title).trim(),
                description !== undefined ? description : ev.description,
                location !== undefined ? location : ev.location,
                newEventType,
                resolvedClientUserId,
                resolvedClientName,
                manager_user_id !== undefined ? (parseInt(manager_user_id, 10) || null) : ev.manager_user_id,
                manager_name !== undefined ? manager_name : ev.manager_name,
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
                timeChanged ? null : ev.last_reminder_sent_at,
                eventId,
            ]
        );
        return res.json({ event: _sanitizeEvent(rows[0]) });
    } catch (err) {
        if (err?.code === '23505' && /uq_calendar_events_owner_active_lead_phone/.test(err.message || '')) {
            return res.status(409).json({
                message: 'קיים כבר ליד פעיל עם מספר טלפון זה ביומן שלך',
                code: 'DUPLICATE_ACTIVE_LEAD',
            });
        }
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

    const ownership = await _requireOwnership(eventId, userId);
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
        const baseUrl = process.env.WEBSITE_DOMAIN
            ? `${process.env.WEBSITE_DOMAIN}/api/calendar/feed/${token}`
            : `/api/calendar/feed/${token}`;
        return res.json({ token, subscriptionUrl: `webcal://${baseUrl.replace(/^https?:\/\//, '')}` });
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
        const baseUrl = process.env.WEBSITE_DOMAIN
            ? `${process.env.WEBSITE_DOMAIN}/api/calendar/feed/${newToken}`
            : `/api/calendar/feed/${newToken}`;
        return res.json({ token: newToken, subscriptionUrl: `webcal://${baseUrl.replace(/^https?:\/\//, '')}` });
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

        // Fetch future + recent events
        const { rows: events } = await pool.query(
            `SELECT * FROM calendar_events
             WHERE owner_id = $1
               AND end_time >= NOW() - INTERVAL '30 days'
             ORDER BY start_time ASC
             LIMIT 500`,
            [userId]
        );

        const firmName = process.env.LAW_FIRM_NAME || process.env.COMPANY_NAME || 'Melamedia';
        const calendar = ical.default
            ? ical.default({ name: `${firmName} — ${userName}` })
            : ical({ name: `${firmName} — ${userName}` });

        for (const ev of events) {
            const eventObj = {
                id: `melamedia-${ev.id}@${process.env.WEBSITE_DOMAIN || 'melamedia.app'}`,
                start: new Date(ev.start_time),
                end: new Date(ev.end_time),
                summary: ev.title,
                allDay: ev.all_day,
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

        // Pull events from the next 90 days
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const listRes = await calendarApi.events.list({
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
        });

        const googleEvents = listRes.data.items || [];
        let upsertCount = 0;

        for (const gev of googleEvents) {
            if (gev.status === 'cancelled') continue;
            const startTime = gev.start?.dateTime || `${gev.start?.date}T00:00:00Z`;
            const endTime = gev.end?.dateTime || `${gev.end?.date}T23:59:59Z`;
            const allDay = !gev.start?.dateTime;

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
        }

        return res.json({ ok: true, synced: upsertCount });
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
// CRM — conflict check, client-case dropdown, link-case, convert-lead
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/calendar/check-conflict
 *
 * Application-layer overlap detector (soft warning — no DB-level EXCLUDE constraint).
 * Returns any of the target lawyer's events whose time window intersects [start_time, end_time).
 *
 * Body: { start_time, end_time, lawyer_id?, exclude_event_id? }
 *   • lawyer_id defaults to req.user.UserId
 *   • exclude_event_id is required when editing an existing event to avoid self-collision
 *
 * Returns: { hasConflict, hasLeaveConflict, conflicts: Event[] }
 */
const checkConflict = async (req, res) => {
    const userId = req.user.UserId;
    const { start_time, end_time, lawyer_id, exclude_event_id } = req.body || {};

    if (!start_time || !end_time) {
        return res.status(400).json({ message: 'נא לציין שעת התחלה וסיום לבדיקת התנגשויות' });
    }
    if (new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
    }

    const targetLawyerId = lawyer_id ? parseInt(lawyer_id, 10) : userId;
    if (!Number.isFinite(targetLawyerId)) {
        return res.status(400).json({ message: 'מזהה עורך דין לא תקין' });
    }

    const excludeId = exclude_event_id ? parseInt(exclude_event_id, 10) : null;
    if (exclude_event_id != null && !Number.isFinite(excludeId)) {
        return res.status(400).json({ message: 'מזהה אירוע לא תקין' });
    }

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
             WHERE  ce.owner_id = $1
               AND  ($4::int IS NULL OR ce.id <> $4)
               AND  tstzrange(ce.start_time, ce.end_time, '[)')
                    && tstzrange($2::timestamptz, $3::timestamptz, '[)')
             ORDER BY ce.start_time ASC
             LIMIT  20`,
            [targetLawyerId, start_time, end_time, excludeId]
        );
        const hasLeave = rows.some(r => r.event_type === 'leave');
        return res.json({
            hasConflict: rows.length > 0,
            hasLeaveConflict: hasLeave,
            conflicts: rows.map(_sanitizeEvent),
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
};

const pool = require('../config/db');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');

function appError(errorCode, httpStatus, { message, meta } = {}) {
    return createAppError(
        String(errorCode),
        Number(httpStatus) || 500,
        message || getHebrewMessage(errorCode),
        meta
    );
}

function parseIsoDateOrNull(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function parsePositiveIntOrNull(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

function base64UrlEncode(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecodeToString(s) {
    const raw = String(s || '').trim();
    if (!raw) return '';
    const padded = raw
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(raw.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function encodeCursor({ occurredAtUtc, id }) {
    return base64UrlEncode(JSON.stringify({ occurredAtUtc, id }));
}

function decodeCursor(cursor) {
    const raw = base64UrlDecodeToString(cursor);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const occurredAtUtc = String(obj?.occurredAtUtc || '').trim();
    const id = String(obj?.id || '').trim();
    if (!occurredAtUtc || !id) return null;
    const d = new Date(occurredAtUtc);
    if (Number.isNaN(d.getTime())) return null;
    return { occurredAtUtc, id };
}

function isUuid(v) {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isSafeEnum(v) {
    const s = String(v || '').trim();
    if (!s) return false;
    return /^[A-Z0-9_]{2,80}$/.test(s);
}

function maskPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
    return `${digits.slice(0, 3)}-XXX-${digits.slice(-4)}`;
}

function maskEmail(email) {
    const s = String(email || '').trim();
    const at = s.indexOf('@');
    if (at <= 0) return null;
    const user = s.slice(0, at);
    const domain = s.slice(at + 1);
    const prefix = user.slice(0, Math.min(2, user.length));
    return `${prefix}***@${domain}`;
}

function sanitizeAuditDetails(value) {
    // Must not expose secrets (tokens, OTP codes, passwords). Keep evidence hashes.
    const DENY_KEYS = new Set([
        'token',
        'access_token',
        'refresh_token',
        'jwt',
        'authorization',
        'otp',
        'otp_code',
        'otp_hash',
        'otp_salt',
        'password',
        'passwordhash',
        'twilio_auth_token',
    ]);

    function scrub(v) {
        if (v == null) return v;
        if (Array.isArray(v)) return v.map(scrub);
        if (typeof v !== 'object') return v;

        const out = {};
        for (const [k, child] of Object.entries(v)) {
            const key = String(k || '');
            const keyLower = key.toLowerCase();

            if (DENY_KEYS.has(keyLower) || keyLower.includes('secret')) {
                out[key] = '[REDACTED]';
                continue;
            }

            // Do not blanket-redact all hashes; they can be part of evidence. Only redact known OTP hashes above.
            out[key] = scrub(child);
        }
        return out;
    }

    return scrub(value);
}

async function listAuditEvents(req, res, next) {
    try {
        const role = String(req.user?.Role || '');
        const userId = Number(req.user?.UserId);

        const caseId = parsePositiveIntOrNull(req.query.caseId);
        const signingFileId = parsePositiveIntOrNull(req.query.signingFileId);

        const actorType = req.query.actorType != null ? String(req.query.actorType || '').trim().toUpperCase() : null;
        const eventType = req.query.eventType != null ? String(req.query.eventType || '').trim().toUpperCase() : null;

        const from = parseIsoDateOrNull(req.query.from);
        const to = parseIsoDateOrNull(req.query.to);

        const search = String(req.query.search || '').trim();

        const limitRaw = req.query.limit;
        const limitParsed = Number.parseInt(String(limitRaw || ''), 10);
        const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 200) : 50;

        const cursorRaw = String(req.query.cursor || '').trim();
        let cursor = null;
        if (cursorRaw) {
            try {
                cursor = decodeCursor(cursorRaw);
            } catch {
                cursor = null;
            }
            if (!cursor || !isUuid(cursor.id)) {
                return next(appError('INVALID_PARAMETER', 400, { meta: { cursor: 'invalid' } }));
            }
        }

        if (req.query.caseId != null && caseId == null) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { caseId: 'invalid' } }));
        }
        if (req.query.signingFileId != null && signingFileId == null) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { signingFileId: 'invalid' } }));
        }
        if (actorType && !isSafeEnum(actorType)) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { actorType: 'invalid' } }));
        }
        if (eventType && !isSafeEnum(eventType)) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { eventType: 'invalid' } }));
        }
        if (from && to && from > to) {
            return next(appError('INVALID_PARAMETER', 400, { meta: { dateRange: 'from_after_to' } }));
        }

        // Authorization:
        // - Admin: can view all
        // - Lawyer: only audit tied to their cases/signing files
        // - Others: blocked by middleware
        const isAdmin = role === 'Admin';
        const isLawyer = role === 'Lawyer';

        const where = [];
        const params = [];

        // Join signingfiles to infer caseId and enforce ownership.
        if (signingFileId) {
            params.push(signingFileId);
            where.push(`ae.signingfileid = $${params.length}`);
        }
        if (caseId) {
            params.push(caseId);
            where.push(`sf.caseid = $${params.length}`);
        }
        if (actorType) {
            params.push(actorType);
            where.push(`ae.actor_type = $${params.length}`);
        }
        if (eventType) {
            params.push(eventType);
            where.push(`ae.event_type = $${params.length}`);
        }
        if (from) {
            params.push(from.toISOString());
            where.push(`ae.occurred_at_utc >= $${params.length}::timestamptz`);
        }
        if (to) {
            params.push(to.toISOString());
            where.push(`ae.occurred_at_utc <= $${params.length}::timestamptz`);
        }

        if (cursor) {
            params.push(cursor.occurredAtUtc);
            params.push(cursor.id);
            where.push(`(ae.occurred_at_utc, ae.eventid) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        }

        if (search) {
            // Safe text filter. No secrets are returned anyway; this is for UX.
            params.push(`%${search}%`);
            where.push(
                `(
                    ae.ip::text ilike $${params.length}
                    or ae.request_id::text ilike $${params.length}
                    or u.email ilike $${params.length}
                    or u.phonenumber ilike $${params.length}
                )`
            );
        }

        if (isLawyer) {
            if (!Number.isInteger(userId) || userId <= 0) {
                return next(appError('UNAUTHORIZED', 401));
            }
            params.push(userId);
            where.push(`sf.lawyerid = $${params.length}`);
        }

        // If neither admin nor lawyer, requireLawyerOrAdmin should have blocked.
        if (!isAdmin && !isLawyer) {
            return next(appError('FORBIDDEN', 403));
        }

        const whereSql = where.length ? `where ${where.join(' and ')}` : '';

        params.push(limit);

        const sql = `
            select
                ae.eventid as id,
                ae.occurred_at_utc as "occurredAtUtc",
                ae.event_type as "eventType",
                ae.success as success,
                ae.actor_type as "actorType",
                ae.actor_userid as "actorUserId",
                sf.caseid as "caseId",
                ae.signingfileid as "signingFileId",
                ae.ip as ip,
                ae.user_agent as "userAgent",
                ae.request_id as "requestId",
                ae.metadata as details,

                u.email as "actorEmail",
                u.phonenumber as "actorPhone"
            from audit_events ae
            left join signingfiles sf on sf.signingfileid = ae.signingfileid
            left join users u on u.userid = ae.actor_userid
            ${whereSql}
            order by ae.occurred_at_utc desc, ae.eventid desc
            limit $${params.length}
        `;

        const result = await pool.query(sql, params);
        const items = (result.rows || []).map((row) => {
            const actorLabel = maskPhone(row.actorPhone) || maskEmail(row.actorEmail) || (row.actorUserId ? `User #${row.actorUserId}` : null);

            return {
                id: row.id,
                occurredAtUtc: new Date(row.occurredAtUtc).toISOString(),
                eventType: row.eventType,
                success: Boolean(row.success),
                actorType: row.actorType,
                actorUserId: row.actorUserId == null ? null : Number(row.actorUserId),
                actorLabel,
                caseId: row.caseId == null ? null : Number(row.caseId),
                signingFileId: row.signingFileId == null ? null : Number(row.signingFileId),
                ip: row.ip ? String(row.ip) : null,
                userAgent: row.userAgent ? String(row.userAgent) : null,
                requestId: row.requestId ? String(row.requestId) : null,
                details: sanitizeAuditDetails(row.details || {}),
            };
        });

        const nextCursor = items.length === limit
            ? encodeCursor({ occurredAtUtc: items[items.length - 1].occurredAtUtc, id: items[items.length - 1].id })
            : null;

        return res.status(200).json({ items, nextCursor });
    } catch (e) {
        // No raw DB errors.
        return next(appError('INTERNAL_ERROR', 500));
    }
}

module.exports = {
    listAuditEvents,
};

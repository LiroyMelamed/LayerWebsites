const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const pool = require('../config/db');
const crypto = require('crypto');
const { resolveFirmIdForUserEnsureMembership, resolveFirmIdForSigningFile } = require('../lib/firm/resolveFirmContext');
const { resolveFirmSigningPolicy } = require('../lib/firm/resolveFirmSigningPolicy');

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeJson(obj) {
    try {
        return JSON.stringify(obj ?? {});
    } catch {
        return '{}';
    }
}

function getRequestUserAgent(req) {
    return String(req?.headers?.['user-agent'] || '').slice(0, 512) || null;
}

function getRequestIp(req) {
    const xff = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
    const ip = xff || req?.ip || null;
    return ip ? String(ip) : null;
}

function newEventId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (crypto.randomBytes(1)[0] % 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

async function insertAuditEventBlocked({ req, signingFileId = null, actorUserId = null, actorType = null, metadata = {} }) {
    try {
        const eventId = newEventId();
        const occurredAtUtc = new Date().toISOString();
        const ip = getRequestIp(req);
        const userAgent = getRequestUserAgent(req);

        let prevHash = null;
        if (signingFileId) {
            try {
                const prevRes = await pool.query(
                    `select event_hash as "EventHash"
                     from audit_events
                     where signingfileid = $1 and event_hash is not null
                     order by occurred_at_utc desc
                     limit 1`,
                    [signingFileId]
                );
                prevHash = prevRes.rows?.[0]?.EventHash || null;
            } catch {
                prevHash = null;
            }
        }

        const baseForHash = safeJson({
            eventId,
            occurredAtUtc,
            eventType: 'SIGNING_BLOCKED_BY_POLICY',
            signingFileId,
            actorUserId,
            actorType,
            ip,
            userAgent,
            success: false,
            metadata,
            prevHash,
        });
        const eventHash = sha256Hex(Buffer.from(baseForHash, 'utf8'));

        await pool.query(
            `insert into audit_events
             (eventid, occurred_at_utc, event_type, signingfileid,
              actor_userid, actor_type, ip, user_agent,
              success, metadata, prev_event_hash, event_hash)
             values ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9,$10::jsonb,$11,$12)`,
            [
                eventId,
                occurredAtUtc,
                'SIGNING_BLOCKED_BY_POLICY',
                signingFileId,
                actorUserId,
                actorType,
                ip,
                userAgent,
                false,
                safeJson(metadata),
                prevHash,
                eventHash,
            ]
        );
    } catch (e) {
        // Never block the request path on audit logging here; the controller path may be fail-closed.
        console.warn('[audit_events] SIGNING_BLOCKED_BY_POLICY write failed:', e?.message);
    }
}

async function requireSigningEnabledForUser(req, _res, next) {
    try {
        const userId = req.user?.UserId;
        if (!userId) return next();

        const firmId = await resolveFirmIdForUserEnsureMembership({ userId, userRole: req.user?.Role });
        const policy = await resolveFirmSigningPolicy(firmId);

        if (!policy.signingEnabled) {
            await insertAuditEventBlocked({
                req,
                signingFileId: null,
                actorUserId: userId,
                actorType: String(req.user?.Role || '').toLowerCase() || 'user',
                metadata: {
                    path: req.originalUrl || req.url,
                    firmId,
                    source: policy.source,
                },
            });
            return next(createAppError('SIGNING_DISABLED', 403, getHebrewMessage('SIGNING_DISABLED')));
        }

        return next();
    } catch (e) {
        return next(e);
    }
}

async function requireSigningEnabledForSigningFile(req, _res, next) {
    try {
        const signingFileId = Number(req.params?.signingFileId);
        if (!Number.isFinite(signingFileId) || signingFileId <= 0) return next();

        const firmId = await resolveFirmIdForSigningFile({ signingFileId });
        const policy = await resolveFirmSigningPolicy(firmId);

        if (!policy.signingEnabled) {
            await insertAuditEventBlocked({
                req,
                signingFileId,
                actorUserId: req.user?.UserId || null,
                actorType: req.user?.Role ? String(req.user.Role).toLowerCase() : null,
                metadata: {
                    path: req.originalUrl || req.url,
                    firmId,
                    source: policy.source,
                },
            });
            return next(createAppError('SIGNING_DISABLED', 403, getHebrewMessage('SIGNING_DISABLED')));
        }

        return next();
    } catch (e) {
        return next(e);
    }
}

module.exports = {
    requireSigningEnabledForUser,
    requireSigningEnabledForSigningFile,
};

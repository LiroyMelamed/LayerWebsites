const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const pool = require('../config/db');

function sha256Hex(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function getRequestUserAgent(req) {
    const ua = req?.headers?.['user-agent'];
    const s = String(ua || '').trim();
    return s || null;
}

function getRequestIp(req) {
    const xff = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
    const ip = xff || req?.ip || null;
    return ip ? String(ip) : null;
}

function safeJson(obj) {
    try {
        return JSON.stringify(obj ?? {});
    } catch {
        return '{}';
    }
}

async function insertAuditEvent({
    req,
    eventType,
    signingFileId = null,
    signatureSpotId = null,
    actorUserId = null,
    actorType = null,
    signingSessionId = null,
    requestId = null,
    success = true,
    metadata = {},
}) {
    const eventId = uuid();
    const occurredAtUtc = new Date().toISOString();
    const ip = req ? getRequestIp(req) : null;
    const userAgent = req ? getRequestUserAgent(req) : null;

    // Chain hash is only meaningful within a signing file context.
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
        eventType,
        signingFileId,
        signatureSpotId,
        actorUserId,
        actorType,
        ip,
        userAgent,
        signingSessionId,
        requestId,
        success,
        metadata,
        prevHash,
    });
    const eventHash = sha256Hex(Buffer.from(baseForHash, 'utf8'));

    try {
        await pool.query(
            `insert into audit_events
             (eventid, occurred_at_utc, event_type, signingfileid, signaturespotid,
              actor_userid, actor_type, ip, user_agent, signing_session_id, request_id,
              success, metadata, prev_event_hash, event_hash)
             values ($1,$2,$3,$4,$5,$6,$7,$8::inet,$9,$10::uuid,$11::uuid,$12,$13::jsonb,$14,$15)`,
            [
                eventId,
                occurredAtUtc,
                String(eventType),
                signingFileId,
                signatureSpotId,
                actorUserId,
                actorType,
                ip,
                userAgent,
                signingSessionId,
                requestId,
                Boolean(success),
                safeJson(metadata),
                prevHash,
                eventHash,
            ]
        );
    } catch (err) {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        const isPermissionDenied = code === '42501' || msg.includes('permission denied');

        // In production, fail closed for legally relevant audit logging.
        const failClosed = String(process.env.IS_PRODUCTION || 'false').toLowerCase() === 'true';
        if (!failClosed && isPermissionDenied) {
            console.warn('[audit_events] write failed (permission denied); continuing in non-production');
            return { eventId, eventHash };
        }

        throw err;
    }

    return { eventId, eventHash };
}

module.exports = {
    insertAuditEvent,
    getRequestIp,
    getRequestUserAgent,
};

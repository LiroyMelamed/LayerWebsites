const pool = require('../../config/db');

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return msg.includes('does not exist');
}

// Sum a single `bytes` column, tolerating a missing table (returns 0).
async function safeSumBytes(sql) {
    try {
        const res = await pool.query(sql);
        return Number(res.rows?.[0]?.bytes || 0);
    } catch (e) {
        if (isRelationMissingError(e)) return 0;
        throw e;
    }
}

function monthStartUtcIso() {
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
}

/**
 * Get usage metrics for this single-tenant DB.
 * Each DB is per-firm so no firm scoping is needed.
 * The optional `_firmId` parameter is kept for backward-compat but ignored.
 */
async function getUsageForFirm(_firmId) {
    const startIso = monthStartUtcIso();

    try {
        const [docsRes, seatsRes, smsRes, signingBytes, stageBytes, templateBytes] = await Promise.all([
            pool.query(
                `select
                    count(*) filter (where createdat >= $1::timestamptz) as "DocumentsCreatedThisMonth",
                    count(*) as "DocumentsTotal"
                 from signingfiles`,
                [startIso]
            ),
            // seats = admins (Admin role only) – each DB is per-firm
            pool.query(
                `select count(*)::int as "SeatsUsed"
                 from users
                 where role = 'Admin'`
            ),
            // SMS sent this month from message_delivery_events
            pool.query(
                `select count(*)::int as "SmsSentThisMonth"
                 from message_delivery_events
                 where channel = 'SMS'
                   and created_at >= $1::timestamptz`,
                [startIso]
            ),
            // Storage = DB-tracked file bytes across signing PDFs, case stage files,
            // and template attachments. Each guarded so a missing table -> 0.
            safeSumBytes(
                `select coalesce(sum(coalesce(unsignedpdfbytes,0) + coalesce(signedpdfbytes,0)),0)::bigint as bytes
                 from signingfiles
                 where pendingdeleteatutc is null`
            ),
            safeSumBytes(
                `select coalesce(sum(coalesce(file_size,0)),0)::bigint as bytes
                 from stage_files`
            ),
            safeSumBytes(
                `select coalesce(sum(coalesce(file_size,0)),0)::bigint as bytes
                 from template_attachments`
            ),
        ]);

        const docs = docsRes.rows?.[0] || {};
        const seats = seatsRes.rows?.[0] || {};
        const sms = smsRes.rows?.[0] || {};
        const storageBytesTotal = signingBytes + stageBytes + templateBytes;

        return {
            scope: 'firm',
            monthStartUtc: startIso,
            documents: {
                total: Number(docs.DocumentsTotal || 0),
                createdThisMonth: Number(docs.DocumentsCreatedThisMonth || 0),
            },
            storage: {
                bytesTotal: storageBytesTotal,
                breakdown: {
                    signingBytes,
                    stageBytes,
                    templateBytes,
                },
            },
            seats: {
                used: Number(seats.SeatsUsed || 0),
            },
            sms: {
                sentThisMonth: Number(sms.SmsSentThisMonth || 0),
            },
        };
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

module.exports = { getUsageForFirm };

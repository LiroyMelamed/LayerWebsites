const pool = require('../../config/db');
const { parseHiddenAdminIds, excludedSeatPhones } = require('./seatExclusions');

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return e?.code === '42P01' || msg.includes('does not exist');
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
    // Billing month boundary in Israel civil time (server may be Europe/Berlin).
    const tz = 'Asia/Jerusalem';
    const nowParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(new Date());
    const map = Object.fromEntries(nowParts.map((p) => [p.type, p.value]));
    const y = Number(map.year);
    const m = Number(map.month);
    // UTC midnight of that civil date, then subtract Jerusalem's offset that day.
    const utcGuess = Date.UTC(y, m - 1, 1, 0, 0, 0);
    const seen = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date(utcGuess));
    const s = Object.fromEntries(seen.map((p) => [p.type, p.value]));
    const localMinutes = Number(s.hour) * 60 + Number(s.minute);
    return new Date(utcGuess - localMinutes * 60 * 1000).toISOString();
}

async function countBillableSeats() {
    const hidden = parseHiddenAdminIds();
    const phones = excludedSeatPhones();
    const params = [phones];
    let hiddenSql = '';
    if (hidden.length > 0) {
        params.push(hidden);
        hiddenSql = ` AND u.userid <> ALL($${params.length}::int[])`;
    }

    const phoneSql = `right(regexp_replace(regexp_replace(coalesce(u.phonenumber, ''), '\\D', '', 'g'), '^(972|0)', ''), 9) <> ALL($1::text[])`;

    const withPlatformAdmins = `
        SELECT count(*)::int AS "SeatsUsed"
        FROM users u
        WHERE u.role = 'Admin'
          AND ${phoneSql}
          ${hiddenSql}
          AND NOT EXISTS (
              SELECT 1 FROM platform_admins pa
              WHERE pa.user_id = u.userid AND pa.is_active = TRUE
          )
    `;
    const withoutPlatformAdmins = `
        SELECT count(*)::int AS "SeatsUsed"
        FROM users u
        WHERE u.role = 'Admin'
          AND ${phoneSql}
          ${hiddenSql}
    `;

    try {
        const res = await pool.query(withPlatformAdmins, params);
        return res.rows?.[0] || { SeatsUsed: 0 };
    } catch (e) {
        if (isRelationMissingError(e)) {
            const res = await pool.query(withoutPlatformAdmins, params);
            return res.rows?.[0] || { SeatsUsed: 0 };
        }
        throw e;
    }
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
            countBillableSeats(),
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
        const seats = seatsRes || {};
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

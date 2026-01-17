const pool = require('../../config/db');
const { isFirmScopeEnabled } = require('../firm/firmScope');

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return msg.includes('does not exist');
}

function monthStartUtcIso() {
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
}

async function getUsageForFirm(firmId) {
    if (!isFirmScopeEnabled()) return null;

    const fid = Number(firmId);
    if (!Number.isFinite(fid) || fid <= 0) return null;

    const startIso = monthStartUtcIso();

    try {
        const [docsRes, storageRes, seatsRes, otpRes, evGenRes, evCpuRes] = await Promise.all([
            pool.query(
                `select
                    count(*) filter (where createdat >= $2::timestamptz) as "DocumentsCreatedThisMonth",
                    count(*) as "DocumentsTotal"
                 from signingfiles
                 where firmid = $1`,
                [fid, startIso]
            ),
            pool.query(
                `select
                    coalesce(sum(coalesce(unsignedpdfbytes,0) + coalesce(signedpdfbytes,0)),0)::bigint as "StorageBytesTotal"
                 from signingfiles
                 where firmid = $1
                   and pendingdeleteatutc is null`,
                [fid]
            ),
            pool.query(
                `select count(*)::int as "SeatsUsed"
                 from firm_users
                 where firmid = $1`,
                [fid]
            ),
            pool.query(
                `select coalesce(sum(quantity),0)::numeric as "OtpSmsThisMonth"
                 from firm_usage_events
                 where firmid = $1
                   and meter_key = 'otp_sms'
                   and occurred_at >= $2::timestamptz`,
                [fid, startIso]
            ),
            pool.query(
                `select coalesce(sum(quantity),0)::numeric as "EvidenceGenerationsThisMonth"
                 from firm_usage_events
                 where firmid = $1
                   and meter_key = 'evidence_generation'
                   and occurred_at >= $2::timestamptz`,
                [fid, startIso]
            ),
            pool.query(
                `select coalesce(sum(quantity),0)::numeric as "EvidenceCpuSecondsThisMonth"
                 from firm_usage_events
                 where firmid = $1
                   and meter_key = 'evidence_cpu_seconds'
                   and occurred_at >= $2::timestamptz`,
                [fid, startIso]
            ),
        ]);

        const docs = docsRes.rows?.[0] || {};
        const storage = storageRes.rows?.[0] || {};
        const seats = seatsRes.rows?.[0] || {};
        const otp = otpRes.rows?.[0] || {};
        const evGen = evGenRes.rows?.[0] || {};
        const evCpu = evCpuRes.rows?.[0] || {};

        return {
            scope: 'firm',
            firmId: fid,
            monthStartUtc: startIso,
            documents: {
                total: Number(docs.DocumentsTotal || 0),
                createdThisMonth: Number(docs.DocumentsCreatedThisMonth || 0),
            },
            storage: {
                bytesTotal: Number(storage.StorageBytesTotal || 0),
            },
            seats: {
                used: Number(seats.SeatsUsed || 0),
            },
            otp: {
                smsThisMonth: Number(otp.OtpSmsThisMonth || 0),
            },
            evidence: {
                generationsThisMonth: Number(evGen.EvidenceGenerationsThisMonth || 0),
                cpuSecondsThisMonth: Number(evCpu.EvidenceCpuSecondsThisMonth || 0),
            },
        };
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

module.exports = { getUsageForFirm };

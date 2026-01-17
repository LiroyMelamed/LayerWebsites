const pool = require('../../config/db');
const { isFirmScopeEnabled } = require('../firm/firmScope');
const { newEventId } = require('../firm/resolveFirmContext');

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return msg.includes('does not exist');
}

async function recordFirmUsage({ firmId, meterKey, quantity, unit, metadata }) {
    if (!isFirmScopeEnabled()) return;
    const fid = Number(firmId);
    if (!Number.isFinite(fid) || fid <= 0) return;

    try {
        await pool.query(
            `insert into firm_usage_events(event_id, firmid, meter_key, quantity, unit, occurred_at, metadata)
             values ($1, $2, $3, $4, $5, now(), $6::jsonb)`,
            [
                newEventId(),
                fid,
                String(meterKey),
                Number(quantity),
                unit ? String(unit) : null,
                JSON.stringify(metadata || {}),
            ]
        );
    } catch (e) {
        if (isRelationMissingError(e)) return;
        throw e;
    }
}

module.exports = { recordFirmUsage };

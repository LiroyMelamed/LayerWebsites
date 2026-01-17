const crypto = require('crypto');
const pool = require('../../config/db');
const { isFirmScopeEnabled, getDefaultFirmKey, getDefaultFirmName } = require('./firmScope');

function isRelationMissingError(e) {
    const msg = String(e?.message || '');
    return msg.includes('does not exist') || msg.includes('relation') && msg.includes('does not exist');
}

async function ensureFirmByKey({ firmKey, firmName }) {
    const key = String(firmKey || '').trim() || getDefaultFirmKey();
    const name = String(firmName || '').trim() || getDefaultFirmName();

    const found = await pool.query(
        `select firmid as "FirmId", firm_key as "FirmKey" from firms where firm_key = $1 limit 1`,
        [key]
    );

    if (found.rowCount > 0) {
        return { firmId: Number(found.rows[0].FirmId), firmKey: found.rows[0].FirmKey };
    }

    const inserted = await pool.query(
        `insert into firms(firm_key, name, created_at, updated_at)
         values ($1, $2, now(), now())
         on conflict (firm_key) do update set updated_at = now()
         returning firmid as "FirmId", firm_key as "FirmKey"`,
        [key, name]
    );

    return { firmId: Number(inserted.rows[0].FirmId), firmKey: inserted.rows[0].FirmKey };
}

async function ensureFirmMembership({ firmId, userId, role }) {
    const r = String(role || 'member').toLowerCase();
    const safeRole = (r === 'admin' || r === 'lawyer' || r === 'member') ? r : 'member';

    await pool.query(
        `insert into firm_users(firmid, userid, role)
         values ($1, $2, $3)
         on conflict (firmid, userid) do nothing`,
        [firmId, userId, safeRole]
    );
}

async function resolveFirmIdForUserEnsureMembership({ userId, userRole }) {
    if (!isFirmScopeEnabled()) return null;

    try {
        const { firmId } = await ensureFirmByKey({ firmKey: getDefaultFirmKey(), firmName: getDefaultFirmName() });
        await ensureFirmMembership({ firmId, userId, role: userRole === 'Admin' ? 'admin' : 'member' });
        return firmId;
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

async function resolveFirmIdForSigningFile({ signingFileId }) {
    if (!isFirmScopeEnabled()) return null;

    try {
        const res = await pool.query(
            `select firmid as "FirmId", lawyerid as "LawyerId" from signingfiles where signingfileid = $1 limit 1`,
            [signingFileId]
        );
        if (res.rowCount === 0) return null;

        const firmId = res.rows?.[0]?.FirmId;
        if (firmId !== null && firmId !== undefined) {
            const n = Number(firmId);
            return Number.isFinite(n) && n > 0 ? n : null;
        }

        const lawyerId = Number(res.rows?.[0]?.LawyerId);
        if (!Number.isFinite(lawyerId) || lawyerId <= 0) return null;

        return await resolveFirmIdForUserEnsureMembership({ userId: lawyerId, userRole: 'Lawyer' });
    } catch (e) {
        if (isRelationMissingError(e)) return null;
        throw e;
    }
}

function newEventId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (crypto.randomBytes(1)[0] % 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

module.exports = {
    resolveFirmIdForUserEnsureMembership,
    resolveFirmIdForSigningFile,
    newEventId,
};

const pool = require('../../config/db');
const { createAppError } = require('../../utils/appError');
const { getHebrewMessage } = require('../../utils/errors.he');
const { requireAreaAction, canViewAllFirmCases } = require('./accessPure');
const { assertCaseRecordAccess } = require('./caseAccess');

async function assertSigningFileOfficeAccess(req, signingFileId, action = 'view') {
    if (req.firmPermissionMode === 'platform_admin') return null;
    if (req.firmPermissionMode === 'legacy') return null;

    if (req.firmPermissionMode === 'role') {
        const signingAction =
            action === 'upload' ? 'upload' : action === 'manage' ? 'manage' : 'view';
        const permErr = requireAreaAction(req, 'signing', signingAction);
        if (permErr) return permErr;

        const { rows } = await pool.query(
            `SELECT signingfileid, caseid, lawyerid FROM signingfiles WHERE signingfileid = $1 LIMIT 1`,
            [signingFileId],
        );
        const file = rows[0];
        if (!file) {
            return createAppError('NOT_FOUND', 404, getHebrewMessage('NOT_FOUND') || 'לא נמצא');
        }
        if (file.caseid) {
            const caseErr = await assertCaseRecordAccess(req, file.caseid, 'view');
            if (caseErr) return caseErr;
        } else if (!canViewAllFirmCases(req)) {
            const userId = Number(req.user?.UserId);
            if (Number(file.lawyerid) !== userId) {
                return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
            }
        }
        return null;
    }

    return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
}

module.exports = {
    assertSigningFileOfficeAccess,
};

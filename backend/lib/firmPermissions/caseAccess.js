const pool = require('../../config/db');
const { createAppError } = require('../../utils/appError');
const { getHebrewMessage } = require('../../utils/errors.he');
const { canViewAllFirmCases, requireAreaAction } = require('./accessPure');

async function userLinkedToCase(userId, caseId) {
    const ownership = await pool.query(
        'SELECT 1 FROM case_users WHERE caseid = $1 AND userid = $2',
        [caseId, userId],
    );
    return ownership.rows.length > 0;
}

async function assertCaseRecordAccess(req, caseId, action = 'view') {
    if (req.firmPermissionMode === 'role') {
        const permErr = requireAreaAction(req, 'cases', action === 'view' ? 'view' : action);
        if (permErr) return permErr;
    }

    if (canViewAllFirmCases(req)) return null;

    const userId = req.user?.UserId;
    if (await userLinkedToCase(userId, caseId)) return null;

    return createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
}

module.exports = {
    assertCaseRecordAccess,
    userLinkedToCase,
};

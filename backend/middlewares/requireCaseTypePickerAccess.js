const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { hasAreaAction, isAreaVisible } = require('../lib/firmRolePermissions');

/** Case-type search for create/edit pickers — not caseTypes manage screen. */
module.exports = function requireCaseTypePickerAccess(req, res, next) {
    const mode = req.firmPermissionMode || 'legacy';

    if (mode === 'platform_admin') return next();

    if (mode === 'legacy') {
        const role = String(req.user?.Role || '');
        if (role === 'Admin' || role === 'Lawyer' || role === 'Staff') return next();
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    if (mode === 'role') {
        const perms = req.firmPermissions;
        const allowed =
            hasAreaAction(perms, 'cases', 'create') ||
            hasAreaAction(perms, 'cases', 'edit') ||
            (isAreaVisible(perms, 'caseTypes') && hasAreaAction(perms, 'caseTypes', 'view'));
        if (allowed) return next();
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
};

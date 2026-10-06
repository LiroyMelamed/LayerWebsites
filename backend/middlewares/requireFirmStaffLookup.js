const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { hasAreaAction, isAreaVisible } = require('../lib/firmRolePermissions');

/** Staff/lawyer name autocomplete for cases & calendar (not a standalone permission). */
module.exports = function requireFirmStaffLookup(req, res, next) {
    const mode = req.firmPermissionMode || 'legacy';

    if (mode === 'platform_admin') return next();

    if (mode === 'legacy') {
        const role = String(req.user?.Role || '');
        if (role === 'Admin' || role === 'Lawyer' || role === 'Staff') return next();
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    if (mode === 'role') {
        const perms = req.firmPermissions;
        const casesOk =
            isAreaVisible(perms, 'cases') &&
            (hasAreaAction(perms, 'cases', 'view') ||
                hasAreaAction(perms, 'cases', 'edit') ||
                hasAreaAction(perms, 'cases', 'create'));
        const calendarOk =
            isAreaVisible(perms, 'calendar') &&
            (hasAreaAction(perms, 'calendar', 'view') || hasAreaAction(perms, 'calendar', 'manage'));
        if (casesOk || calendarOk) return next();
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
};

const { hasAreaAction } = require('../lib/firmRolePermissions');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
/** A read-only office role must not obtain a storage write capability. */
module.exports = function requireUploadPermission(req, res, next) {
    const mode = req.firmPermissionMode || 'legacy';
    if (mode === 'platform_admin' || mode === 'legacy') return next();
    const actions = [['cases', 'edit'], ['signing', 'upload'], ['clients', 'edit'], ['officeUsers', 'manage'], ['calendar', 'manage'], ['reminders', 'manage']];
    if (mode === 'role' && actions.some(([area, action]) => hasAreaAction(req.firmPermissions, area, action))) return next();
    return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
};

const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { hasAreaAction } = require('../lib/firmRolePermissions');

function legacyAllows(req, legacyRule) {
    const role = String(req.user?.Role || '');
    if (legacyRule === 'admin' && role === 'Admin') return true;
    if (legacyRule === 'lawyerOrAdmin' && (role === 'Admin' || role === 'Lawyer')) return true;
    if (legacyRule === 'staffOrAdmin' && (role === 'Admin' || role === 'Staff')) return true;
    if (legacyRule === 'officeStaff' && (role === 'Admin' || role === 'Lawyer' || role === 'Staff')) {
        return true;
    }
    if (legacyRule === 'none') return true;
    return false;
}

/**
 * Enforce firm role permissions on role-mode users; preserve legacy Admin/Lawyer rules.
 * @param {string} areaId
 * @param {string} action
 * @param {{ legacy?: 'admin' | 'lawyerOrAdmin' | 'none' }} [opts]
 */
module.exports = function requireFirmAction(areaId, action, opts = {}) {
    const legacyRule = opts.legacy || 'admin';

    return function requireFirmActionMiddleware(req, res, next) {
        const mode = req.firmPermissionMode || 'legacy';

        if (mode === 'platform_admin') {
            return next();
        }

        if (mode === 'legacy') {
            if (legacyAllows(req, legacyRule)) return next();
            return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
        }

        if (mode === 'role') {
            if (req.firmPermissions && hasAreaAction(req.firmPermissions, areaId, action)) {
                return next();
            }
            return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
        }

        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    };
};

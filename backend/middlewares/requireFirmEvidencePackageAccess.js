const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { hasAreaAction } = require('../lib/firmRolePermissions');

function legacyLawyerOrAdmin(req) {
    const role = String(req.user?.Role || '');
    return role === 'Admin' || role === 'Lawyer';
}

/** Evidence ZIP/PDF from signing routes — allow signing.view OR evidenceDocuments.download in role mode. */
module.exports = function requireFirmEvidencePackageAccess(req, res, next) {
    const mode = req.firmPermissionMode || 'legacy';

    if (mode === 'platform_admin') {
        return next();
    }

    if (mode === 'legacy') {
        if (legacyLawyerOrAdmin(req)) return next();
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    if (mode === 'role' && req.firmPermissions) {
        if (hasAreaAction(req.firmPermissions, 'evidenceDocuments', 'download')) {
            return next();
        }
        if (hasAreaAction(req.firmPermissions, 'signing', 'view')) {
            return next();
        }
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
};

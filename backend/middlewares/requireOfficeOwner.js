const requirePlatformAdmin = require('./requirePlatformAdmin');
const { isMultiTenantMode } = require('../lib/tenant/tenantContext');
const { createAppError } = require('../utils/appError');
module.exports = (req, res, next) => {
    if (!isMultiTenantMode()) return requirePlatformAdmin(req, res, next);
    if (req.firmPermissionContextValidated && req.firmTenantId && req.user?.Role === 'Admin' && req.isOfficeOwner === true) return next();
    return next(createAppError('FORBIDDEN', 403));
};

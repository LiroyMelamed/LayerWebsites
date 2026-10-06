const requireFirmAction = require('./requireFirmAction');
const { isMultiTenantMode } = require('../lib/tenant/tenantContext');
const { createAppError } = require('../utils/appError');
module.exports = function requireOfficeUserAction(action) {
    const gate = requireFirmAction('officeUsers', action, { legacy: 'admin' });
    return function officeUserAction(req, res, next) {
        gate(req, res, error => {
            if (error) return next(error);
            if (req.firmPermissionMode === 'role') {
                // Legacy adminController is dedicated-database only; do not expose global lists across tenants.
                if (!req.firmPermissionContextValidated || isMultiTenantMode() || req.firmTenantId) {
                    return next(createAppError('FORBIDDEN', 403));
                }
            }
            return next();
        });
    };
};

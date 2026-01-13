/**
 * Require an authenticated user with role "Admin" or "Lawyer".
 * Must be used after authMiddleware.
 */
module.exports = function requireLawyerOrAdmin(req, res, next) {
    const role = req.user?.Role;
    if (role !== 'Admin' && role !== 'Lawyer') {
        const { createAppError } = require('../utils/appError');
        const { getHebrewMessage } = require('../utils/errors.he');
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }
    return next();
};

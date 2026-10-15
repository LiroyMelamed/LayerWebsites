/**
 * Require an authenticated user with role "Admin".
 * Must be used after authMiddleware.
 */
module.exports = function requireAdmin(req, res, next) {
    if (req.user?.Role !== 'Admin') {
        const { createAppError } = require('../utils/appError');
        const { getHebrewMessage } = require('../utils/errors.he');
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }
    return next();
};

const { createAppError, sendError, isProduction } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');

function mapKnownErrors(err) {
    // Body-parser / express payload too large
    if (err && (err.type === 'entity.too.large' || err.statusCode === 413)) {
        return createAppError('REQUEST_TOO_LARGE', 413, getHebrewMessage('REQUEST_TOO_LARGE'));
    }

    // Network timeouts
    if (err && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT')) {
        return createAppError('REQUEST_TIMEOUT', 504, getHebrewMessage('REQUEST_TIMEOUT'));
    }

    // JWT
    if (err && err.name === 'TokenExpiredError') {
        return createAppError('TOKEN_EXPIRED', 401, getHebrewMessage('TOKEN_EXPIRED'));
    }
    if (err && err.name === 'JsonWebTokenError') {
        return createAppError('INVALID_TOKEN', 401, getHebrewMessage('INVALID_TOKEN'));
    }

    // Postgres insufficient privilege
    if (err && String(err.code || '') === '42501') {
        return createAppError('DB_PERMISSION_DENIED', 500, getHebrewMessage('DB_PERMISSION_DENIED'));
    }

    return null;
}

// Central error middleware (must be last).
module.exports = function errorHandler(err, req, res, next) {
    if (!err) return next();
    if (res.headersSent) return next(err);

    // If some middleware already created an AppError.
    const isAppError = err && err.name === 'AppError' && err.errorCode;
    if (isAppError) {
        return sendError(res, {
            httpStatus: err.httpStatus,
            errorCode: err.errorCode,
            message: err.heMessage,
            details: !isProduction() ? err.meta : undefined,
            extras: err.extras,
            legacyAliases: err.legacyAliases,
        });
    }

    const mapped = mapKnownErrors(err);
    if (mapped) {
        return sendError(res, {
            httpStatus: mapped.httpStatus,
            errorCode: mapped.errorCode,
            message: mapped.heMessage,
            details: !isProduction() ? mapped.meta : undefined,
        });
    }

    // Fallback: INTERNAL_ERROR
    // Do not leak stack traces; include a tiny hint in non-prod.
    const details = !isProduction()
        ? {
            name: err?.name,
            code: err?.code,
            message: String(err?.message || ''),
        }
        : undefined;

    return sendError(res, {
        httpStatus: 500,
        errorCode: 'INTERNAL_ERROR',
        message: getHebrewMessage('INTERNAL_ERROR'),
        details,
    });
};

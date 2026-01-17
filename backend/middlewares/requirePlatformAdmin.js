const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');

function parseAllowlist() {
    const raw = String(process.env.PLATFORM_ADMIN_USER_IDS || '').trim();
    if (!raw) return null;
    const ids = raw
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? new Set(ids) : null;
}

const allowlistSet = parseAllowlist();

module.exports = function requirePlatformAdmin(req, _res, next) {
    const userId = Number(req.user?.UserId);
    const role = req.user?.Role;

    if (!Number.isFinite(userId) || userId <= 0) {
        return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('AUTH_REQUIRED')));
    }

    if (role !== 'Admin') {
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    // In production, enforce allowlist if configured; in non-prod allow Admins by default.
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProd && !allowlistSet) {
        return next(createAppError('FORBIDDEN', 403, 'Platform admin allowlist not configured'));
    }

    if (allowlistSet && !allowlistSet.has(userId)) {
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    return next();
};

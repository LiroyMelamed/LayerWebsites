const jwt = require("jsonwebtoken");
require("dotenv").config();
const { consume } = require("../utils/rateLimiter");
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const attachFirmPermissions = require('./attachFirmPermissions');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
}

function verifyJwt(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        console.warn(
            JSON.stringify({
                event: 'auth_missing_token',
                method: req.method,
                path: req.originalUrl || req.url,
            })
        );

        return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('AUTH_REQUIRED')));
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });

        req.user = {
            UserId: decoded.userid,
            Role: decoded.role,
            PhoneNumber: decoded.phoneNumber
        };

        const windowMs = Number.parseInt(process.env.RATE_LIMIT_USER_WINDOW_MS || String(5 * 60 * 1000), 10);
        const max = Number.parseInt(process.env.RATE_LIMIT_USER_MAX || '600', 10);

        const rl = consume({
            key: `user:${req.user.UserId}`,
            windowMs,
            max,
        });

        if (!rl.allowed) {
            const now = Date.now();
            const retryAfterSeconds = Math.max(0, Math.ceil((rl.resetMs - now) / 1000));

            res.setHeader('X-RateLimit-Limit', String(max));
            res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetMs / 1000)));
            res.setHeader('Retry-After', String(retryAfterSeconds));

            return next(
                createAppError(
                    'RATE_LIMITED',
                    429,
                    getHebrewMessage('RATE_LIMITED'),
                    { retryAfterSeconds },
                    { retryAfterSeconds },
                    { retryAfterSeconds }
                )
            );
        }

        return next();
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: 'auth_invalid_token',
                method: req.method,
                path: req.originalUrl || req.url,
            })
        );

        return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('UNAUTHORIZED')));
    }
}

/** JWT verification + DB-backed firm permissions (role users only). */
const authMiddleware = (req, res, next) => {
    verifyJwt(req, res, (jwtErr) => {
        if (jwtErr) {
            if (jwtErr?.__firmPermissionBlocked) return next(jwtErr);
            return next(jwtErr);
        }
        attachFirmPermissions(req, res, (permErr) => {
            if (permErr?.__firmPermissionBlocked) return next(permErr);
            return next(permErr);
        });
    });
};

authMiddleware.verifyJwt = verifyJwt;
authMiddleware.attachFirmPermissions = attachFirmPermissions;

module.exports = authMiddleware;

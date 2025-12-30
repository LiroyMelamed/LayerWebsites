function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getClientIp(req, { trustProxy = false } = {}) {
    if (trustProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length > 0) {
            return forwarded.split(',')[0].trim();
        }
    }

    return (
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        'unknown'
    );
}

const store = new Map();

function nowMs() {
    return Date.now();
}

function getWindowId(currentMs, windowMs) {
    return Math.floor(currentMs / windowMs);
}

function consume({ key, windowMs, max, currentTimeMs } = {}) {
    if (!key) throw new Error('rateLimiter.consume: key is required');
    if (!windowMs || windowMs <= 0) throw new Error('rateLimiter.consume: windowMs must be > 0');
    if (!max || max <= 0) throw new Error('rateLimiter.consume: max must be > 0');

    const now = Number.isFinite(currentTimeMs) ? currentTimeMs : nowMs();
    const windowId = getWindowId(now, windowMs);

    const existing = store.get(key);

    if (!existing || existing.windowId !== windowId) {
        const next = { windowId, count: 1 };
        store.set(key, next);

        return {
            allowed: true,
            remaining: Math.max(0, max - next.count),
            resetMs: (windowId + 1) * windowMs,
        };
    }

    existing.count += 1;

    return {
        allowed: existing.count <= max,
        remaining: Math.max(0, max - existing.count),
        resetMs: (windowId + 1) * windowMs,
    };
}

function createRateLimitMiddleware({
    name = 'rateLimit',
    windowMs,
    max,
    statusCode = 429,
    message = 'Too many requests',
    trustProxy = false,
    keyFn,
    skip,
} = {}) {
    const resolvedWindowMs = toInt(windowMs, 5 * 60 * 1000);
    const resolvedMax = toInt(max, 300);

    if (typeof keyFn !== 'function') {
        throw new Error('createRateLimitMiddleware: keyFn must be a function');
    }

    return function rateLimitMiddleware(req, res, next) {
        try {
            if (typeof skip === 'function' && skip(req)) {
                return next();
            }

            const key = keyFn(req, { trustProxy });
            const result = consume({ key: `${name}:${key}`, windowMs: resolvedWindowMs, max: resolvedMax });

            res.setHeader('X-RateLimit-Limit', String(resolvedMax));
            res.setHeader('X-RateLimit-Remaining', String(result.remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));

            if (!result.allowed) {
                return res.status(statusCode).json({ message });
            }

            return next();
        } catch (e) {
            return next(e);
        }
    };
}

function resetStore() {
    store.clear();
}

module.exports = {
    getClientIp,
    createRateLimitMiddleware,
    consume,
    resetStore,
};

const net = require('node:net');
const { createAppError } = require('./appError');
const { getHebrewMessage } = require('./errors.he');

function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIp(input) {
    if (typeof input !== 'string') return null;

    let value = input.trim();
    if (value.length === 0) return null;
    if (value.length > 200) return null;

    // Strip IPv6 zone id (e.g. fe80::1%lo0)
    if (value.includes('%')) {
        value = value.split('%')[0];
    }

    // If already a valid IP, use it.
    if (net.isIP(value)) return value;

    // Some proxies provide IPv4:port in XFF entries.
    const looksLikeIpv4WithPort = value.includes('.') && value.includes(':') && !value.includes('::');
    if (looksLikeIpv4WithPort) {
        const withoutPort = value.split(':')[0];
        if (net.isIP(withoutPort)) return withoutPort;
    }

    return null;
}

function getClientIp(req, { trustProxy = false } = {}) {
    if (trustProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length > 0) {
            const first = forwarded.split(',')[0].trim();
            const normalized = normalizeIp(first);
            if (normalized) return normalized;
        }
    }

    const direct =
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress;

    return normalizeIp(direct) || 'unknown';
}

const store = new Map();
let requestCounter = 0;

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
        const next = { windowId, count: 1, lastSeenMs: now };
        store.set(key, next);

        return {
            allowed: true,
            remaining: Math.max(0, max - next.count),
            resetMs: (windowId + 1) * windowMs,
        };
    }

    existing.count += 1;
    existing.lastSeenMs = now;

    return {
        allowed: existing.count <= max,
        remaining: Math.max(0, max - existing.count),
        resetMs: (windowId + 1) * windowMs,
    };
}

function pruneStore({ maxEntries = 50000, maxAgeMs = 60 * 60 * 1000, currentTimeMs } = {}) {
    const now = Number.isFinite(currentTimeMs) ? currentTimeMs : nowMs();
    const resolvedMaxEntries = Number.isFinite(maxEntries) ? maxEntries : 50000;
    const resolvedMaxAgeMs = Number.isFinite(maxAgeMs) ? maxAgeMs : 60 * 60 * 1000;
    const threshold = now - resolvedMaxAgeMs;

    const before = store.size;
    let removedByAge = 0;
    let removedBySize = 0;

    // First pass: drop stale entries.
    for (const [k, v] of store.entries()) {
        const lastSeen = Number.isFinite(v?.lastSeenMs) ? v.lastSeenMs : 0;
        if (lastSeen < threshold) {
            store.delete(k);
            removedByAge += 1;
        }
    }

    if (store.size > resolvedMaxEntries) {
        // Second pass: evict oldest entries until within the cap.
        const entries = [];
        for (const [k, v] of store.entries()) {
            entries.push([k, Number.isFinite(v?.lastSeenMs) ? v.lastSeenMs : 0]);
        }

        entries.sort((a, b) => a[1] - b[1]);

        const targetRemovals = Math.max(0, store.size - resolvedMaxEntries);
        for (let i = 0; i < targetRemovals; i += 1) {
            const keyToDelete = entries[i]?.[0];
            if (!keyToDelete) break;
            if (store.delete(keyToDelete)) removedBySize += 1;
        }
    }

    return {
        before,
        after: store.size,
        removedByAge,
        removedBySize,
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
    storeMaxEntries = 50000,
    storeMaxAgeMs = 60 * 60 * 1000,
    pruneEveryNRequests = 1000,
} = {}) {
    const resolvedWindowMs = toInt(windowMs, 5 * 60 * 1000);
    const resolvedMax = toInt(max, 300);

    if (typeof keyFn !== 'function') {
        throw new Error('createRateLimitMiddleware: keyFn must be a function');
    }

    return function rateLimitMiddleware(req, res, next) {
        try {
            requestCounter += 1;
            const shouldPrune =
                store.size > storeMaxEntries ||
                (Number.isFinite(pruneEveryNRequests) && pruneEveryNRequests > 0 && requestCounter % pruneEveryNRequests === 0);

            if (shouldPrune) {
                pruneStore({
                    maxEntries: storeMaxEntries,
                    maxAgeMs: storeMaxAgeMs,
                });
            }

            if (typeof skip === 'function' && skip(req)) {
                return next();
            }

            const key = keyFn(req, { trustProxy });
            const now = nowMs();
            const result = consume({
                key: `${name}:${key}`,
                windowMs: resolvedWindowMs,
                max: resolvedMax,
                currentTimeMs: now,
            });

            res.setHeader('X-RateLimit-Limit', String(resolvedMax));
            res.setHeader('X-RateLimit-Remaining', String(result.remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));

            if (!result.allowed) {
                const retryAfterSeconds = Math.max(0, Math.ceil((result.resetMs - now) / 1000));
                res.setHeader('Retry-After', String(retryAfterSeconds));

                console.warn(
                    JSON.stringify({
                        event: 'rate_limit_block',
                        limiter: name,
                        method: req.method,
                        path: req.originalUrl || req.url,
                    })
                );

                return next(
                    createAppError(
                        'RATE_LIMITED',
                        statusCode,
                        // Ignore custom message text; enforce Hebrew catalog.
                        getHebrewMessage('RATE_LIMITED'),
                        { retryAfterSeconds },
                        { retryAfterSeconds },
                        { retryAfterSeconds }
                    )
                );
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
    pruneStore,
    resetStore,
};

/**
 * In-memory OTP brute-force protection.
 *
 * ISO 27001 A.9.4.2 — accounts must be locked after repeated failed authentication attempts.
 *
 * Tracks failed OTP verification attempts per phone number.
 * After MAX_ATTEMPTS failures within WINDOW_MS, the phone is locked out for LOCKOUT_MS.
 *
 * NOTE: This is in-memory (resets on server restart). For multi-instance deployments,
 * migrate the store to PostgreSQL or Redis.
 */

const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const WINDOW_MS = Number(process.env.OTP_ATTEMPT_WINDOW_MS || 15 * 60 * 1000); // 15 min
const LOCKOUT_MS = Number(process.env.OTP_LOCKOUT_MS || 15 * 60 * 1000); // 15 min

// Map<phoneNumber, { attempts: number, firstAttemptAt: number, lockedUntil: number | null }>
const store = new Map();

function now() {
    return Date.now();
}

/**
 * Check if the phone is currently locked out.
 * @param {string} phone
 * @returns {{ locked: boolean, retryAfterMs?: number }}
 */
function isLocked(phone) {
    const entry = store.get(phone);
    if (!entry || !entry.lockedUntil) return { locked: false };

    const remaining = entry.lockedUntil - now();
    if (remaining <= 0) {
        // Lockout expired — reset
        store.delete(phone);
        return { locked: false };
    }

    return { locked: true, retryAfterMs: remaining };
}

/**
 * Record a failed OTP attempt. If max attempts are exceeded, lock the phone.
 * @param {string} phone
 */
function recordFailure(phone) {
    const currentTime = now();
    let entry = store.get(phone);

    if (!entry || (currentTime - entry.firstAttemptAt > WINDOW_MS)) {
        // Start a new window
        entry = { attempts: 1, firstAttemptAt: currentTime, lockedUntil: null };
        store.set(phone, entry);
        return;
    }

    entry.attempts += 1;

    if (entry.attempts >= MAX_ATTEMPTS) {
        entry.lockedUntil = currentTime + LOCKOUT_MS;
        console.warn(`[security] OTP brute-force lockout triggered for phone ending in ...${phone.slice(-4)}`);
    }

    store.set(phone, entry);
}

/**
 * Clear tracking on successful verification.
 * @param {string} phone
 */
function recordSuccess(phone) {
    store.delete(phone);
}

/**
 * Periodic cleanup of stale entries (call from setInterval).
 */
function prune() {
    const currentTime = now();
    for (const [phone, entry] of store) {
        const age = currentTime - entry.firstAttemptAt;
        const lockExpired = entry.lockedUntil && entry.lockedUntil <= currentTime;
        if (age > WINDOW_MS * 2 || lockExpired) {
            store.delete(phone);
        }
    }
}

// Auto-prune every 5 minutes
const _pruneInterval = setInterval(prune, 5 * 60 * 1000);
_pruneInterval.unref?.(); // Don't prevent process exit

module.exports = { isLocked, recordFailure, recordSuccess, prune };

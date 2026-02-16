const crypto = require('crypto');
const pool = require('../../config/db');

/**
 * Record a message-delivery (or generic usage) event.
 *
 * Single-tenant — no firm_id.
 * Idempotent: if `idempotencyKey` is supplied and already exists, the INSERT
 * is silently skipped (ON CONFLICT DO NOTHING).
 *
 * @param {string}  channel          'SMS' | 'EMAIL' | other
 * @param {string}  [type]           optional subtype ('OTP', 'NOTIFICATION', …)
 * @param {object}  [metadata]       arbitrary JSON
 * @param {string}  [idempotencyKey] prevents double-counting retries
 */
async function recordUsageEvent(channel, type, metadata, idempotencyKey) {
    const key = idempotencyKey || crypto.randomUUID();
    try {
        await pool.query(
            `INSERT INTO message_delivery_events (channel, type, idempotency_key, metadata)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [
                String(channel),
                type ? String(type) : null,
                key,
                JSON.stringify(metadata || {}),
            ],
        );
    } catch (e) {
        // Log but never block the caller on metering failure
        console.warn('[recordUsageEvent] write failed:', e?.message);
    }
}

// Backward-compat alias — old callers can keep working until migrated
async function recordFirmUsage(/* legacy signature ignored */) {
    // no-op kept for any remaining import; prefer recordUsageEvent
    return;
}

module.exports = { recordUsageEvent, recordFirmUsage };

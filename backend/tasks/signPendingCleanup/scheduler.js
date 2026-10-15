/**
 * Purge signing files stuck in pending status beyond PENDING_SIGNING_AUTO_DELETE_DAYS.
 *
 * Env:
 *   SIGN_PENDING_CLEANUP_ENABLED       – default true
 *   SIGN_PENDING_CLEANUP_POLL_HOURS    – default 6
 *   SIGN_PENDING_CLEANUP_BATCH_SIZE    – default 50
 */
'use strict';

const { purgeStalePendingSigningFiles } = require('../../lib/signingPendingCleanup');

function initSignPendingCleanupScheduler() {
    const enabled = (process.env.SIGN_PENDING_CLEANUP_ENABLED || 'true').toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[sign-pending-cleanup] Disabled via SIGN_PENDING_CLEANUP_ENABLED.');
        return { ok: true, enabled: false };
    }

    const pollHours = Number.parseInt(process.env.SIGN_PENDING_CLEANUP_POLL_HOURS || '6', 10);
    const batchSize = Number.parseInt(process.env.SIGN_PENDING_CLEANUP_BATCH_SIZE || '50', 10);
    const intervalMs = Math.max(1, pollHours) * 60 * 60 * 1000;

    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            const result = await purgeStalePendingSigningFiles({ limit: batchSize });
            if (result.deleted > 0 || result.errors.length > 0) {
                console.log(
                    `[sign-pending-cleanup] deleted=${result.deleted} scanned=${result.scanned} errors=${result.errors.length}`
                );
            }
        } catch (err) {
            console.error('[sign-pending-cleanup] Error:', err.message);
        } finally {
            running = false;
        }
    }

    const handle = setInterval(tick, intervalMs);
    handle.unref?.();
    tick().catch(() => {});

    console.log(`[sign-pending-cleanup] Started. poll=${pollHours}h batch=${batchSize}`);
    return { ok: true, enabled: true, pollHours, batchSize };
}

module.exports = { initSignPendingCleanupScheduler };

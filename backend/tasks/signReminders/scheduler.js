/**
 * Sign-reminder scheduler.
 * Polls every N minutes and dispatches due SIGN_REMINDER notifications.
 *
 * Env:
 *   SIGN_REMINDERS_SCHEDULER_ENABLED  – default true
 *   SIGN_REMINDERS_POLL_MINUTES       – default 5
 */
'use strict';

const { processDueSignReminders } = require('../../lib/signingFileReminders');

function initSignReminderScheduler() {
    const enabled = (process.env.SIGN_REMINDERS_SCHEDULER_ENABLED || 'true').toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[sign-reminder-scheduler] Disabled via SIGN_REMINDERS_SCHEDULER_ENABLED.');
        return { ok: true, enabled: false };
    }

    const pollMinutes = Number.parseInt(process.env.SIGN_REMINDERS_POLL_MINUTES || '5', 10);
    const intervalMs = Math.max(1, pollMinutes) * 60 * 1000;

    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            const result = await processDueSignReminders();
            if (result && !result.skipped && (result.sent || result.cancelled || result.failed)) {
                console.log(
                    `[sign-reminder-scheduler] sent=${result.sent} cancelled=${result.cancelled} failed=${result.failed}`
                );
            }
        } catch (err) {
            console.error('[sign-reminder-scheduler] Error:', err.message);
        } finally {
            running = false;
        }
    }

    const handle = setInterval(tick, intervalMs);
    handle.unref?.();
    tick().catch(() => {});

    console.log(`[sign-reminder-scheduler] Started. poll=${pollMinutes}m`);
    return { ok: true, enabled: true, pollMinutes };
}

module.exports = { initSignReminderScheduler };

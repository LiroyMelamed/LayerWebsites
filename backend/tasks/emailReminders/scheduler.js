/**
 * Email-reminder scheduler.
 *
 * Polls every N minutes (default 5) and runs processEmailReminders().
 * Reminders are sent at their exact scheduled_for time — no send window restriction.
 *
 * Env vars:
 *   EMAIL_REMINDERS_SCHEDULER_ENABLED  – default true
 *   EMAIL_REMINDERS_POLL_MINUTES       – default 5
 */

const { processEmailReminders } = require('./service');

function initEmailReminderScheduler() {
    const enabled = (process.env.EMAIL_REMINDERS_SCHEDULER_ENABLED || 'true').toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[email-reminder-scheduler] Disabled via EMAIL_REMINDERS_SCHEDULER_ENABLED.');
        return { ok: true, enabled: false };
    }

    const pollMinutes = Number.parseInt(process.env.EMAIL_REMINDERS_POLL_MINUTES || '5', 10);
    const intervalMs = pollMinutes * 60 * 1000;

    let running = false;

    async function tick() {
        if (running) return; // guard against overlapping ticks

        running = true;
        try {
            await processEmailReminders();
        } catch (err) {
            console.error('[email-reminder-scheduler] Error:', err.message);
        } finally {
            running = false;
        }
    }

    const handle = setInterval(tick, intervalMs);
    handle.unref(); // don't prevent process from exiting

    // Also run once immediately (in the background)
    tick().catch(() => { });

    console.log(`[email-reminder-scheduler] Started. poll=${pollMinutes}m, 24/7`);
    return { ok: true, enabled: true, pollMinutes };
}

module.exports = { initEmailReminderScheduler };

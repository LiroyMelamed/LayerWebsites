/**
 * Email-reminder scheduler.
 *
 * Polls every N minutes (default 5). When the local time in the configured
 * timezone is within the send window, it runs processEmailReminders().
 *
 * Unlike license-renewal (once-per-day), email reminders process continuously
 * throughout the day since reminders can be scheduled at any time.
 *
 * Env vars:
 *   EMAIL_REMINDERS_SCHEDULER_ENABLED  – default true
 *   EMAIL_REMINDERS_POLL_MINUTES       – default 5
 *   EMAIL_REMINDERS_START_HOUR         – earliest hour to send (default 7)
 *   EMAIL_REMINDERS_END_HOUR           – latest hour to send (default 21)
 *   EMAIL_REMINDERS_TZ                 – default Asia/Jerusalem
 */

const { processEmailReminders } = require('./service');

function initEmailReminderScheduler() {
    const enabled = (process.env.EMAIL_REMINDERS_SCHEDULER_ENABLED || 'true').toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[email-reminder-scheduler] Disabled via EMAIL_REMINDERS_SCHEDULER_ENABLED.');
        return { ok: true, enabled: false };
    }

    const tz = process.env.EMAIL_REMINDERS_TZ || 'Asia/Jerusalem';
    const startHour = Number.parseInt(process.env.EMAIL_REMINDERS_START_HOUR || '7', 10);
    const endHour = Number.parseInt(process.env.EMAIL_REMINDERS_END_HOUR || '21', 10);
    const pollMinutes = Number.parseInt(process.env.EMAIL_REMINDERS_POLL_MINUTES || '5', 10);
    const intervalMs = pollMinutes * 60 * 1000;

    let running = false;

    async function tick() {
        if (running) return; // guard against overlapping ticks

        // Check if current time is in the send window
        const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
        const nowLocal = new Date(nowStr);
        const hour = nowLocal.getHours();
        if (hour < startHour || hour >= endHour) return; // outside window

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

    console.log(`[email-reminder-scheduler] Started. poll=${pollMinutes}m, window=${startHour}:00–${endHour}:00 ${tz}`);
    return { ok: true, enabled: true, tz, startHour, endHour, pollMinutes };
}

module.exports = { initEmailReminderScheduler };

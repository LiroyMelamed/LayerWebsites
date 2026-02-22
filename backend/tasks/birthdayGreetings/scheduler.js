/**
 * Birthday-greetings scheduler.
 *
 * Runs once per day (like license-renewal). Polls every N minutes; when the
 * local time in the configured timezone hits the send window, it fires
 * processBirthdayGreetings() exactly once per calendar day.
 *
 * Env vars:
 *   BIRTHDAY_GREETINGS_SCHEDULER_ENABLED – default true
 *   BIRTHDAY_GREETINGS_HOUR              – hour to send (default 9)
 *   BIRTHDAY_GREETINGS_MINUTE            – minute within the hour (default 0)
 *   BIRTHDAY_GREETINGS_POLL_MINUTES      – poll interval (default 5)
 *   BIRTHDAY_GREETINGS_TZ                – default Asia/Jerusalem
 */

const { processBirthdayGreetings } = require('./service');

function toPositiveIntOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function getTodayDateKeyInTz(timeZone, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: String(timeZone || 'Asia/Jerusalem'),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

function initBirthdayGreetingsScheduler() {
    const enabled = String(process.env.BIRTHDAY_GREETINGS_SCHEDULER_ENABLED ?? 'true').toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[birthday-greetings] Scheduler disabled via BIRTHDAY_GREETINGS_SCHEDULER_ENABLED.');
        return { ok: true, enabled: false };
    }

    const tz = process.env.BIRTHDAY_GREETINGS_TZ || 'Asia/Jerusalem';
    const hour = toPositiveIntOrNull(process.env.BIRTHDAY_GREETINGS_HOUR) ?? 9;
    const minute = toPositiveIntOrNull(process.env.BIRTHDAY_GREETINGS_MINUTE) ?? 0;
    const pollMinutes = toPositiveIntOrNull(process.env.BIRTHDAY_GREETINGS_POLL_MINUTES) ?? 5;

    let lastRunDayKey = null;
    let running = false;

    async function tick() {
        if (running) return;

        const now = new Date();
        const localParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);

        const map = Object.fromEntries(localParts.map((p) => [p.type, p.value]));
        const hh = Number(map.hour);
        const mm = Number(map.minute);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;

        const dayKey = getTodayDateKeyInTz(tz, now);

        // Run once per day, within a small window around the configured time
        const inWindow = hh === hour && mm >= minute && mm < minute + pollMinutes;
        if (!inWindow) return;
        if (dayKey === lastRunDayKey) return;

        running = true;
        try {
            console.log(JSON.stringify({ event: 'birthday_greetings_run_start', tz, dayKey, hour, minute }));
            const result = await processBirthdayGreetings({ timeZone: tz });
            console.log(JSON.stringify({ event: 'birthday_greetings_run_result', tz, dayKey, result }));
            lastRunDayKey = dayKey;
        } catch (e) {
            console.error('[birthday-greetings] Scheduler error:', e?.message || e);
        } finally {
            running = false;
        }
    }

    // Immediate best-effort tick, then poll
    void tick();

    const handle = setInterval(tick, pollMinutes * 60 * 1000);
    handle.unref?.();

    console.log(`[birthday-greetings] Scheduler started. hour=${hour}:${String(minute).padStart(2, '0')}, poll=${pollMinutes}m, tz=${tz}`);
    return { ok: true, enabled: true, tz, hour, minute, pollMinutes };
}

module.exports = { initBirthdayGreetingsScheduler };

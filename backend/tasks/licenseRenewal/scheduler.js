const { runLicenseRenewalRemindersOnce, getTodayDateKeyInTz } = require('./service');

function toPositiveIntOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function initLicenseRenewalScheduler() {
    const enabled = String(process.env.LICENSE_RENEWAL_REMINDERS_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'true';
    if (!enabled) {
        console.log(JSON.stringify({ event: 'license_renewal_scheduler_disabled' }));
        return { ok: true, enabled: false };
    }

    const tz = String(process.env.LICENSE_RENEWAL_REMINDERS_TZ || 'Asia/Jerusalem');
    const hour = toPositiveIntOrNull(process.env.LICENSE_RENEWAL_REMINDERS_HOUR) ?? 9;
    const minute = toPositiveIntOrNull(process.env.LICENSE_RENEWAL_REMINDERS_MINUTE) ?? 0;
    const pollMinutes = toPositiveIntOrNull(process.env.LICENSE_RENEWAL_REMINDERS_POLL_MINUTES) ?? 5;

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

        // Run once per local day, within a small window.
        const inWindow = hh === hour && mm >= minute && mm < minute + pollMinutes;
        if (!inWindow) return;
        if (dayKey === lastRunDayKey) return;

        running = true;
        try {
            console.log(JSON.stringify({ event: 'license_renewal_scheduler_run_start', tz, dayKey, hour, minute }));
            const result = await runLicenseRenewalRemindersOnce({ timeZone: tz });
            console.log(
                JSON.stringify({
                    event: 'license_renewal_scheduler_run_result',
                    tz,
                    dayKey,
                    result,
                })
            );
            lastRunDayKey = dayKey;
            console.log(JSON.stringify({ event: 'license_renewal_scheduler_run_done', tz, dayKey }));
        } catch (e) {
            console.error('license_renewal_scheduler_run_error:', e?.message || e);
        } finally {
            running = false;
        }
    }

    // Immediate tick (best-effort) then poll.
    void tick();

    const handle = setInterval(tick, pollMinutes * 60 * 1000);
    handle.unref?.();

    return { ok: true, enabled: true, tz, hour, minute, pollMinutes };
}

module.exports = { initLicenseRenewalScheduler };

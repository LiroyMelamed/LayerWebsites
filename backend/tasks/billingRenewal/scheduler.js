/**
 * Daily-ish billing maintenance: charge when due, retry past_due, expire grace.
 */

const { runBillingMaintenance } = require('../../lib/billing/firmBillingService');

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
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}-${map.hour}:${map.minute}`;
}

function initBillingRenewalScheduler() {
    const enabled = String(process.env.BILLING_RENEWAL_SCHEDULER_ENABLED ?? 'true').toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
        console.log('[billing-renewal] Scheduler disabled via BILLING_RENEWAL_SCHEDULER_ENABLED.');
        return { ok: true, enabled: false };
    }

    const tz = process.env.BILLING_RENEWAL_TZ || 'Asia/Jerusalem';
    const pollMinutes = toPositiveIntOrNull(process.env.BILLING_RENEWAL_POLL_MINUTES) ?? 15;

    let lastRunKey = null;
    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            const key = getTodayDateKeyInTz(tz);
            // Run at most once per poll window key; maintenance itself is idempotent.
            if (lastRunKey === key) return;
            lastRunKey = key;
            const result = await runBillingMaintenance();
            if (!result?.skipped) {
                console.log('[billing-renewal]', JSON.stringify(result?.result?.ok != null ? { ok: result.result.ok } : result));
            }
        } catch (e) {
            console.error('[billing-renewal] tick failed:', e?.message || e);
        } finally {
            running = false;
        }
    }

    const handle = setInterval(tick, pollMinutes * 60 * 1000);
    handle.unref?.();
    setTimeout(tick, 20_000).unref?.();
    console.log(`[billing-renewal] Started. poll=${pollMinutes}m tz=${tz}`);
    return { ok: true, enabled: true, pollMinutes };
}

module.exports = { initBillingRenewalScheduler, runBillingMaintenance };

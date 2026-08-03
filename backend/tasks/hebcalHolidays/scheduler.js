/**
 * Periodic Hebcal holidays sync (current + next year).
 * Runs once on boot (delayed) and then daily.
 */
const { syncHolidaysFromHebcal } = require('../../lib/hebcalHolidays');

const BOOT_DELAY_MS = 20_000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

let started = false;
let timer = null;

async function _run(reason) {
    try {
        const result = await syncHolidaysFromHebcal();
        console.log(`[hebcal-holidays] ${reason}: upserted=${result.upserted} years=${result.years.join(',')}`);
    } catch (err) {
        console.warn(`[hebcal-holidays] ${reason} failed:`, err?.message || err);
    }
}

function startHebcalHolidaysScheduler() {
    if (started) return;
    started = true;
    setTimeout(() => {
        _run('boot');
        timer = setInterval(() => _run('daily'), INTERVAL_MS);
        timer.unref?.();
    }, BOOT_DELAY_MS);
    console.log('[hebcal-holidays] scheduler started (boot+daily)');
}

module.exports = { startHebcalHolidaysScheduler };

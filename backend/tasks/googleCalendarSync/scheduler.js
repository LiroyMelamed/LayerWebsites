'use strict';
const pool = require('../../config/db');
const { syncAccount } = require('../../services/googleCalendarSync');
let timer, running = false;
async function run() {
    if (running) return;
    running = true;
    try {
        const { rows } = await pool.query('SELECT user_id FROM user_calendar_tokens WHERE google_connected=true ORDER BY user_id');
        for (const row of rows) {
            try { await syncAccount(row.user_id); }
            catch (error) { console.warn('[google-calendar-sync]', error.message); }
        }
    } catch (_) { console.warn('[google-calendar-sync] cycle unavailable'); }
    finally { running = false; }
}
function start() {
    if (timer || String(process.env.MULTI_TENANT_MODE).toLowerCase() === 'true') return;
    const jobsEnabled = require('../../lib/backgroundJobsEnabled')();
    if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED === 'false' || (!jobsEnabled && process.env.GOOGLE_CALENDAR_SYNC_ENABLED !== 'true')) return;
    // QA can run this isolated scheduler without enabling message/reminder jobs.
    timer = setInterval(run, 60_000); timer.unref?.();
}
function stop() { clearInterval(timer); timer = null; }
module.exports = { start, stop, run };

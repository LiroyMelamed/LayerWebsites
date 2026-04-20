const axios = require('axios');
const app = require('./app');
const pool = require('./config/db');
const { signingSchemaStartupCheck } = require('./utils/startupSchemaCheck');
const { initLicenseRenewalScheduler } = require('./tasks/licenseRenewal/scheduler');
const { initEmailReminderScheduler } = require('./tasks/emailReminders/scheduler');
const { initBirthdayGreetingsScheduler } = require('./tasks/birthdayGreetings/scheduler');

const PORT = process.env.PORT || 5000;

const SERVER_REQUEST_TIMEOUT_MS = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 60_000);
const SERVER_HEADERS_TIMEOUT_MS = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 65_000);
const SERVER_KEEPALIVE_TIMEOUT_MS = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 5_000);

async function getPublicIp() {
    try {
        const { data } = await axios.get('https://api.ipify.org?format=json', {
            timeout: 5000,
        });
        if (data?.ip) {
            console.log(`Public IP: ${data.ip}`);
        }
    } catch (e) {
        console.warn('Public IP check failed:', e?.message);
    }
}

const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await getPublicIp();
    await signingSchemaStartupCheck();

    // Scheduled jobs (best-effort; idempotent at DB layer)
    initLicenseRenewalScheduler();
    initEmailReminderScheduler();
    initBirthdayGreetingsScheduler();
});

// Hard timeouts at the Node server layer (useful behind Nginx).
// These defaults are conservative and can be tuned via env.
if (Number.isFinite(SERVER_REQUEST_TIMEOUT_MS) && SERVER_REQUEST_TIMEOUT_MS > 0) {
    server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
}
if (Number.isFinite(SERVER_HEADERS_TIMEOUT_MS) && SERVER_HEADERS_TIMEOUT_MS > 0) {
    server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
}
if (Number.isFinite(SERVER_KEEPALIVE_TIMEOUT_MS) && SERVER_KEEPALIVE_TIMEOUT_MS > 0) {
    server.keepAliveTimeout = SERVER_KEEPALIVE_TIMEOUT_MS;
}

// Graceful shutdown: stop accepting new connections, wait for in-flight
// requests to drain, then close the DB pool. This prevents "Cannot use a
// pool after calling end on the pool" on PM2 reload / SIGINT / SIGTERM.
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 10_000);
let shuttingDown = false;

async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing server…`);

    const forceTimer = setTimeout(() => {
        console.error('[shutdown] grace period exceeded, forcing exit');
        process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceTimer.unref?.();

    server.close(async (err) => {
        if (err) console.error('[shutdown] server.close error:', err.message);
        try {
            await pool.end();
            console.log('[shutdown] database pool closed');
        } catch (e) {
            console.error('[shutdown] pool.end error:', e?.message);
        }
        process.exit(err ? 1 : 0);
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

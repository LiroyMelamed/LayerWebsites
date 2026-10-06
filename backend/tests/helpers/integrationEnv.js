const { resetStore } = require('../../utils/rateLimiter');

/** Standard rate-limit + auth env for HTTP integration tests. */
function applyBaseTestEnv() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.RATE_LIMIT_IP_WINDOW_MS = process.env.RATE_LIMIT_IP_WINDOW_MS || String(60 * 1000);
    process.env.RATE_LIMIT_IP_MAX = process.env.RATE_LIMIT_IP_MAX || '100000';
    process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS = process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS || String(60 * 1000);
    process.env.RATE_LIMIT_AUTH_IP_MAX = process.env.RATE_LIMIT_AUTH_IP_MAX || '100000';
    process.env.RATE_LIMIT_USER_WINDOW_MS = process.env.RATE_LIMIT_USER_WINDOW_MS || String(60 * 1000);
    process.env.RATE_LIMIT_USER_MAX = process.env.RATE_LIMIT_USER_MAX || '100000';
    process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'false';
    process.env.IS_PRODUCTION = 'false';
    process.env.NODE_ENV = 'test';
    process.env.SIGNING_ENABLED = process.env.SIGNING_ENABLED || 'true';
}

let billingStubbed = false;

/** Avoid real billing DB lookups in integration tests (no production bypass). */
function stubBillingSnapshotUnlocked() {
    if (billingStubbed) return;
    billingStubbed = true;
    try {
        const billingService = require('../../lib/billing/firmBillingService');
        if (typeof billingService.getBillingSnapshot === 'function') {
            billingService.getBillingSnapshot = async () => ({ locked: false, status: 'active' });
        }
    } catch {
        // Billing module optional in some test slices
    }
}

function clearAppModuleCache() {
    const appPath = require.resolve('../../app');
    delete require.cache[appPath];
}

function loadTestApp() {
    applyBaseTestEnv();
    stubBillingSnapshotUnlocked();
    clearAppModuleCache();
    resetStore();
    return require('../../app');
}

module.exports = {
    applyBaseTestEnv,
    stubBillingSnapshotUnlocked,
    loadTestApp,
    resetStore,
};

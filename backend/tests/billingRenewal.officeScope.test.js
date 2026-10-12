'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('legacy scheduled billing keeps the deployment account and clears inherited office context', async t => {
    const servicePath = require.resolve('../lib/billing/firmBillingService');
    const schedulerPath = require.resolve('../tasks/billingRenewal/scheduler');
    const previousService = require.cache[servicePath];
    const previousScheduler = require.cache[schedulerPath];
    const originalInterval = global.setInterval;
    const originalTimeout = global.setTimeout;
    const previousEnv = { ...process.env };
    t.after(() => {
        global.setInterval = originalInterval;
        global.setTimeout = originalTimeout;
        if (previousService) require.cache[servicePath] = previousService; else delete require.cache[servicePath];
        if (previousScheduler) require.cache[schedulerPath] = previousScheduler; else delete require.cache[schedulerPath];
        for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
        Object.assign(process.env, previousEnv);
    });
    Object.assign(process.env, { MULTI_TENANT_MODE: 'true', TENANT_DB_ISOLATION_ENABLED: '1', BILLING_RENEWAL_SCHEDULER_ENABLED: 'true' });
    const scope = require('../lib/tenant/databaseScope');
    const tenant = require('../lib/tenant/tenantContext');
    const calls = [];
    require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
        runBillingMaintenance: async () => {
            calls.push({ scope: scope.current(), tenantId: tenant.getCurrentTenantId(), isolated: scope.enabled() });
            return { skipped: true, reason: 'synthetic' };
        },
    } };
    const ticks = [];
    global.setInterval = fn => { ticks.push(fn); return { unref() {} }; };
    global.setTimeout = () => ({ unref() {} });
    delete require.cache[schedulerPath];
    const scheduler = require(schedulerPath);
    const office = { id: '11111111-1111-4111-8111-111111111111' };
    await tenant.runWithTenant(office, async () => {
        scheduler.initBillingRenewalScheduler();
        await ticks.pop()();
        assert.equal(scope.current().tenantId, office.id);
        assert.equal(tenant.getCurrentTenantId(), office.id);
    });
    assert.deepEqual(calls, [{ scope: { mode: 'legacy', tenantId: '' }, tenantId: null, isolated: true }]);
    process.env.MULTI_TENANT_MODE = 'false';
    scheduler.initBillingRenewalScheduler();
    await ticks.pop()();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].isolated, false);
    assert.equal(calls[1].tenantId, null);
    process.env.BILLING_RENEWAL_SCHEDULER_ENABLED = 'false';
    assert.equal(scheduler.initBillingRenewalScheduler().enabled, false);
    assert.equal(ticks.length, 0);
});

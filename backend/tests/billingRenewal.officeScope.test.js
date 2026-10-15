'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('scheduled signup renewals remain separate from dedicated billing across normalized flags', async t => {
    const servicePath = require.resolve('../lib/billing/firmBillingService');
    const renewalPath = require.resolve('../lib/billing/selfServiceRenewal');
    const schedulerPath = require.resolve('../tasks/billingRenewal/scheduler');
    const saved = [servicePath, renewalPath, schedulerPath].map(p => [p, require.cache[p]]);
    const originalInterval = global.setInterval;
    const originalTimeout = global.setTimeout;
    const previousEnv = { ...process.env };
    t.after(() => {
        global.setInterval = originalInterval;
        global.setTimeout = originalTimeout;
        for (const [p, old] of saved) { if (old) require.cache[p] = old; else delete require.cache[p]; }
        for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
        Object.assign(process.env, previousEnv);
    });
    Object.assign(process.env, { MULTI_TENANT_MODE: ' TRUE ', TENANT_DB_ISOLATION_ENABLED: '1', BILLING_RENEWAL_SCHEDULER_ENABLED: 'true' });
    const scope = require('../lib/tenant/databaseScope');
    const tenant = require('../lib/tenant/tenantContext');
    const legacyCalls = [];
    let signupCalls = 0;
    require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
        runBillingMaintenance: async () => {
            legacyCalls.push({ scope: scope.current(), tenantId: tenant.getCurrentTenantId(), isolated: scope.enabled() });
            return { skipped: true, reason: 'synthetic' };
        },
    } };
    require.cache[renewalPath] = { id: renewalPath, filename: renewalPath, loaded: true, exports: {
        signupRenewal: { due: async () => { signupCalls++; return []; } },
    } };
    const ticks = [];
    global.setInterval = fn => { ticks.push(fn); return { unref() {} }; };
    global.setTimeout = () => ({ unref() {} });
    delete require.cache[schedulerPath];
    const scheduler = require(schedulerPath);
    scheduler.initBillingRenewalScheduler();
    await ticks.pop()();
    assert.equal(signupCalls, 1);
    assert.equal(legacyCalls.length, 0);
    process.env.MULTI_TENANT_MODE = 'false';
    const office = { id: '11111111-1111-4111-8111-111111111111' };
    await tenant.runWithTenant(office, async () => {
        scheduler.initBillingRenewalScheduler();
        await ticks.pop()();
        assert.equal(tenant.getCurrentTenantId(), office.id);
    });
    assert.equal(signupCalls, 1);
    assert.deepEqual(legacyCalls, [{ scope: { mode: 'legacy', tenantId: '' }, tenantId: null, isolated: false }]);
    process.env.BILLING_RENEWAL_SCHEDULER_ENABLED = 'false';
    assert.equal(scheduler.initBillingRenewalScheduler().enabled, false);
    assert.equal(ticks.length, 0);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createMetaProvider } = require('../services/integrations/metaProvider');
const { createIntegrationService } = require('../services/integrations/service');

test('QA demo-only prevents every Meta request even with live credentials and flags', async () => {
    const env = { WHATSAPP_DEMO_ONLY: 'true', WHATSAPP_LIVE_ENABLED: 'true', WHATSAPP_META_APP_ID: '123456',
        WHATSAPP_META_APP_SECRET: 'secret', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '654321',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify', INTEGRATIONS_ENCRYPTION_KEY: 'ab'.repeat(32) };
    let requests = 0;
    const provider = createMetaProvider({ env, fetchImpl: async () => { requests++; throw Error('Must not reach network'); } });
    const service = createIntegrationService({ pool: {}, provider, env });
    assert.equal(service.signupConfig().ready, false);
    assert.equal(service.signupConfig().liveEnabled, false);
    const connection = { phone_number_id: '123456', waba_id: '654321', settings: {} };
    for (const action of [
        () => provider.completeSignup({ code: 'synthetic-code', phoneId: '123456', wabaId: '654321' }),
        () => provider.readiness(connection, 'synthetic-token'),
        () => provider.createGroup(connection, 'synthetic-token', { subject: 'QA' }),
        () => provider.invite(connection, 'synthetic-token', {}, '+972500000001'),
    ]) await assert.rejects(action, { message: 'WHATSAPP_DEMO_ONLY' });
    assert.equal(requests, 0);
});

function runtime(env) {
    const calls = [], courtCalls = [], intervals = [];
    const context = { module: { exports: {} }, process: { env }, console,
        setInterval: callback => { intervals.push(callback); return { unref() {} }; }, clearInterval() {},
        require: name => {
            if (name.endsWith('/db')) return { query: async () => ({ rows: [{ law_firm_tenant_id: null }] }) };
            if (name.endsWith('/databaseScope')) return { withLegacyOffice: fn => fn() };
            if (name.endsWith('/tenantContext')) return { isMultiTenantMode: () => false };
            if (name === './service') return { createIntegrationService: () => ({ syncCourt: async (...args) => courtCalls.push(args) }) };
            if (name === './metaProvider') return { createMetaProvider: () => ({}) };
            if (name === './worker') return { createGroupWorker: () => ({ processOffice: async (...args) => calls.push(args) }) };
            if (name.endsWith('/backgroundJobsEnabled')) return require('../lib/backgroundJobsEnabled');
            throw Error(`Unexpected dependency ${name}`);
        },
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../services/integrations/runtime'), 'utf8'), context);
    return { runtime: context.module.exports, calls, courtCalls, intervals };
}

test('QA starts only the demo worker while ordinary background jobs remain disabled', async () => {
    const fixture = runtime({ BACKGROUND_JOBS_ENABLED: 'false', WHATSAPP_DEMO_ONLY: 'true', WHATSAPP_DEMO_WORKER_ENABLED: 'true' });
    fixture.runtime.start(); fixture.runtime.start();
    assert.equal(fixture.intervals.length, 1);
    await fixture.intervals[0]();
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0][0], null);
    assert.equal(fixture.calls[0][1].demoOnly, true);
    fixture.runtime.stop();
});

test('demo worker flag alone cannot enable a live worker or override disabled background jobs', () => {
    for (const env of [
        { BACKGROUND_JOBS_ENABLED: 'false', WHATSAPP_WORKER_ENABLED: 'true' },
        { BACKGROUND_JOBS_ENABLED: 'false', WHATSAPP_DEMO_WORKER_ENABLED: 'true' },
        { BACKGROUND_JOBS_ENABLED: 'false', WHATSAPP_DEMO_ONLY: 'true' },
    ]) {
        const fixture = runtime(env); fixture.runtime.start(); assert.equal(fixture.intervals.length, 0);
    }
});

test('daily court demo worker runs independently without starting message delivery', async () => {
    const fixture = runtime({ BACKGROUND_JOBS_ENABLED: 'false', COURT_DEMO_SYNC_WORKER_ENABLED: 'true' });
    fixture.runtime.start(); fixture.runtime.start();
    assert.equal(fixture.intervals.length, 1);
    await fixture.intervals[0]();
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.courtCalls.length, 1);
    assert.equal(fixture.courtCalls[0][0], null);
    assert.ok(fixture.courtCalls[0][1].scheduledAt);
    fixture.runtime.stop();
});

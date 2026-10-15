'use strict';
const pool = require('../../config/db');
const scope = require('../../lib/tenant/databaseScope');
const { isMultiTenantMode } = require('../../lib/tenant/tenantContext');
const { createIntegrationService } = require('./service');
const { createMetaProvider } = require('./metaProvider');
const { createGroupWorker } = require('./worker');
const service = createIntegrationService({ pool, provider: createMetaProvider() });
const worker = createGroupWorker(service);
const runOffice = (tenantId, fn) => tenantId ? scope.withOffice(tenantId, fn) : scope.withLegacyOffice(fn);
let running = false, timer;
async function tick({ demoOnly = false } = {}) {
    if (running) return;
    running = true;
    try {
        const offices = isMultiTenantMode() ? await scope.withSystem(() => pool.query(`SELECT DISTINCT i.law_firm_tenant_id FROM office_integrations i JOIN law_firm_tenants t ON t.id=i.law_firm_tenant_id WHERE i.provider='whatsapp' AND i.enabled=true AND t.is_active=true`)) : { rows: [{ law_firm_tenant_id: null }] };
        for (const row of offices.rows) {
            try { await runOffice(row.law_firm_tenant_id, () => worker.processOffice(row.law_firm_tenant_id, { demoOnly: demoOnly || process.env.WHATSAPP_DEMO_ONLY === 'true' })); }
            catch { console.error('[office-integrations] worker failed; pending mutations retain their state'); }
        }
    } finally { running = false; }
}
function start() {
    if (timer) return;
    const demoOnly = process.env.WHATSAPP_DEMO_ONLY === 'true' && process.env.WHATSAPP_DEMO_WORKER_ENABLED === 'true';
    const liveWorker = process.env.WHATSAPP_WORKER_ENABLED === 'true' && require('../../lib/backgroundJobsEnabled')(process.env);
    if (!demoOnly && !liveWorker) return;
    timer = setInterval(() => tick({ demoOnly }).catch(() => console.error('[office-integrations] worker unavailable')), 15000);
    timer.unref();
}
function stop() { clearInterval(timer); timer = null; }
module.exports = { service, worker, runOffice, start, stop, tick };

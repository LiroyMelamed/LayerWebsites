'use strict';
const pool = require('../../config/db');
const scope = require('../../lib/tenant/databaseScope');
const { isMultiTenantMode } = require('../../lib/tenant/tenantContext');
const { createIntegrationService } = require('./service');
const { createMetaProvider } = require('./metaProvider');
const { createGroupWorker } = require('./worker');
const { deliveryAllowed } = require('./deliveryPolicy');
const service = createIntegrationService({ pool, provider: createMetaProvider() });
const worker = createGroupWorker(service);
const runOffice = (tenantId, fn) => tenantId ? scope.withOffice(tenantId, fn) : scope.withLegacyOffice(fn);
let running = false, timer, courtRunning = false, courtTimer;
async function tick({ demoOnly = false } = {}) {
    if (running) return;
    running = true;
    try {
        const offices = isMultiTenantMode() ? await scope.withSystem(() => pool.query(`SELECT DISTINCT i.law_firm_tenant_id FROM office_integrations i JOIN law_firm_tenants t ON t.id=i.law_firm_tenant_id WHERE i.provider='whatsapp' AND i.enabled=true AND t.is_active=true`)) : { rows: [{ law_firm_tenant_id: null }] };
        for (const row of offices.rows) {
            try { await runOffice(row.law_firm_tenant_id, () => worker.processOffice(row.law_firm_tenant_id, { demoOnly: demoOnly || !deliveryAllowed(process.env) })); }
            catch { console.error('[office-integrations] worker failed; pending mutations retain their state'); }
        }
    } finally { running = false; }
}
async function tickCourt(now = new Date()) {
    if (courtRunning) return;
    courtRunning = true;
    try {
        const due = () => pool.query(`SELECT i.law_firm_tenant_id FROM office_integrations i
            LEFT JOIN law_firm_tenants t ON t.id=i.law_firm_tenant_id
            WHERE i.provider='court_demo' AND i.enabled AND i.settings->>'dailySyncEnabled'='true'
                AND i.next_sync_at <= $1 AND ${isMultiTenantMode() ? 't.is_active=true' : 'i.law_firm_tenant_id IS NULL'}`, [now]);
        const offices = isMultiTenantMode() ? await scope.withSystem(due) : await runOffice(null, due);
        for (const row of offices.rows) {
            try { await runOffice(row.law_firm_tenant_id, () => service.syncCourt(row.law_firm_tenant_id, { scheduledAt: now })); }
            catch { console.error('[office-integrations] daily demo import failed; next tick will retry'); }
        }
    } finally { courtRunning = false; }
}
function start() {
    const demoOnly = (process.env.WHATSAPP_DEMO_ONLY === 'true' || process.env.WHATSAPP_CONNECT_ONLY === 'true') && process.env.WHATSAPP_DEMO_WORKER_ENABLED === 'true';
    const liveWorker = deliveryAllowed(process.env) && process.env.WHATSAPP_WORKER_ENABLED === 'true' && require('../../lib/backgroundJobsEnabled')(process.env);
    if (!timer && (demoOnly || liveWorker)) {
        timer = setInterval(() => tick({ demoOnly }).catch(() => console.error('[office-integrations] worker unavailable')), 15000);
        timer.unref();
    }
    // This worker only imports synthetic court data. It never activates delivery
    // schedulers, Meta requests, or a real court connection in QA.
    if (!courtTimer && process.env.COURT_DEMO_SYNC_WORKER_ENABLED === 'true') {
        courtTimer = setInterval(() => tickCourt().catch(() => console.error('[office-integrations] daily demo scheduler unavailable')), 60000);
        courtTimer.unref();
    }
}
function stop() { clearInterval(timer); timer = null; clearInterval(courtTimer); courtTimer = null; }
module.exports = { service, worker, runOffice, start, stop, tick, tickCourt };

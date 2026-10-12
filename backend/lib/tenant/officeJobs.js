const pool = require('../../config/db');
const scope = require('./databaseScope');
const { runWithTenant } = require('./tenantContext');

async function forEachOffice(job) {
    if (!scope.enabled()) return job();
    const tenants = (await scope.withSystem(() => pool.query('SELECT id,slug,name,branding FROM law_firm_tenants WHERE is_active=true ORDER BY id'))).rows;
    const results=[], errors=[];
    // Legacy NULL rows keep their own partition; they never join a tenant's delivery job.
    try { results.push(await runWithTenant(null,()=>scope.withLegacyOffice(job))); } catch (error) { errors.push(error); }
    for (const tenant of tenants) {
        try { results.push(await runWithTenant(tenant,job)); } catch(error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors,'One or more office jobs failed');
    return results;
}
module.exports={forEachOffice};

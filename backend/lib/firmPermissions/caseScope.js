const { getCasesDataScope } = require('../firmRolePermissions');
const { isMultiTenantMode } = require('../tenant/tenantContext');
const { createAppError } = require('../../utils/appError');
const pool = require('../../config/db');
function caseScopeFilter(req, alias = 'scope_case', firstParam = 1) {
    if (req.firmPermissionMode !== 'role') return null;
    if (!req.firmPermissionContextValidated) throw createAppError('FORBIDDEN', 403);
    if (isMultiTenantMode() && !req.firmTenantId) throw createAppError('FORBIDDEN', 403);
    const own = getCasesDataScope(req.firmPermissions) !== 'all_firm';
    const sql = `(to_jsonb(${alias})->>'law_firm_tenant_id') IS NOT DISTINCT FROM $${firstParam}::text` + (own ? ` AND (${alias}.casemanagerid = $${firstParam + 1} OR EXISTS (SELECT 1 FROM case_users scope_membership WHERE scope_membership.caseid = ${alias}.caseid AND scope_membership.userid = $${firstParam + 1}))` : '');
    return { sql, params: own ? [req.firmTenantId || null, req.user?.UserId] : [req.firmTenantId || null] };
}
async function queryScopedCases(req, sql, params = []) {
    const filter = caseScopeFilter(req, 'scope_case', params.length + 1);
    if (!filter) return pool.query(sql, params);
    const scoped = sql.replace(/\bfrom\s+cases\s+([cC])\b/gi, (_match, alias) => `FROM (SELECT scope_case.* FROM cases scope_case WHERE ${filter.sql}) ${alias}`);
    if (scoped === sql) throw new Error('Case scope requires a cases alias');
    return pool.query(scoped, [...params, ...filter.params]);
}
module.exports = { caseScopeFilter, queryScopedCases };

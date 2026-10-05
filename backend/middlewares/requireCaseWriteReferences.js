const pool = require('../config/db');
const { isMultiTenantMode } = require('../lib/tenant/tenantContext');
const { getCasesDataScope } = require('../lib/firmRolePermissions');
const { createAppError } = require('../utils/appError');
module.exports = async function requireCaseWriteReferences(req, res, next) {
    if (req.firmPermissionMode !== 'role') return next();
    try {
        if (!req.firmPermissionContextValidated) return next(createAppError('FORBIDDEN', 403));
        if (isMultiTenantMode() && !req.firmTenantId) return next(createAppError('FORBIDDEN', 403));
        const body = req.body || {};
        const ids = [...(Array.isArray(body.UserIds) ? body.UserIds : body.UserId ? [body.UserId] : []), ...(body.CaseManagerId ? [body.CaseManagerId] : [])];
        const owner = Number(body.CaseManagerId);
        let currentOwner = null;
        if (req.params?.caseId) {
            const { caseScopeFilter } = require('../lib/firmPermissions/caseScope');
            const filter = caseScopeFilter(req, 'scope_case', 2);
            const { rows } = await pool.query(`SELECT scope_case.casemanagerid FROM cases scope_case WHERE scope_case.caseid = $1 AND ${filter.sql} LIMIT 1`, [req.params.caseId, ...filter.params]);
            if (!rows.length) return next(createAppError('FORBIDDEN', 403));
            currentOwner = Number(rows[0].casemanagerid);
        }
        if (owner && getCasesDataScope(req.firmPermissions) !== 'all_firm' && owner !== Number(req.user?.UserId) && owner !== currentOwner) {
            // An own-only writer may not move records outside their own scope.
            return next(createAppError('FORBIDDEN', 403));
        }
        for (const id of ids) {
            const { rows } = await pool.query('SELECT 1 FROM users WHERE userid = $1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid LIMIT 1', [id, req.firmTenantId || null]);
            if (!rows.length) return next(createAppError('FORBIDDEN', 403));
        }
        return next();
    } catch (error) { return next(error); }
};

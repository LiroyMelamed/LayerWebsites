const { randomUUID } = require('node:crypto');
const { fail, expect } = require('../../lib/signingV2/errors');
const { hasAreaAction, getSigningDataScope, getCasesDataScope } = require('../../lib/firmRolePermissions');
const { getCurrentTenantId, isMultiTenantMode } = require('../../lib/tenant/tenantContext');

async function actorScope(db, req, action = 'view') {
    const userId = Number(req.user?.UserId);
    if (!Number.isSafeInteger(userId) || userId < 1) fail('UNAUTHORIZED', 401);
    if (!req.firmPermissionContextValidated) fail('FORBIDDEN', 403);
    const { rows } = await db.query(`SELECT userid,role,law_firm_tenant_id,firm_staff_role_id FROM users WHERE userid=$1`, [userId]);
    const actor = rows[0];
    if (!actor || !['Admin', 'Lawyer', 'Staff'].includes(actor.role)) fail('FORBIDDEN', 403);
    const tenantId = getCurrentTenantId() || req.tenant?.id || null;
    if (isMultiTenantMode() && !tenantId) fail('CONTEXT_REQUIRED', 403);
    if (String(actor.law_firm_tenant_id || '') !== String(tenantId || '') || String(req.firmTenantId || '') !== String(tenantId || '')) fail('FORBIDDEN', 403);
    const mode = req.firmPermissionMode;
    const custom = mode === 'role';
    if (!['legacy', 'role', 'platform_admin'].includes(mode)) fail('FORBIDDEN', 403);
    if (custom && (!actor.firm_staff_role_id || String(actor.firm_staff_role_id) !== String(req.firmStaffRoleId) || !hasAreaAction(req.firmPermissions, 'signing', action))) fail('FORBIDDEN', 403);
    if (mode === 'legacy' && (actor.firm_staff_role_id || !['Admin', 'Lawyer'].includes(actor.role))) fail('FORBIDDEN', 403);
    // A platform administrator must use the already authenticated tenant/deployment
    // context. Request bodies cannot select another office.
    if (mode === 'platform_admin' && !req.isPlatformAdminUser) fail('FORBIDDEN', 403);
    const deploymentKey = String(process.env.SIGNING_DEPLOYMENT_KEY || process.env.WEBSITE_DOMAIN || '').trim().toLowerCase();
    expect(deploymentKey.length > 0 && deploymentKey.length <= 200, 'CONTEXT_REQUIRED');
    const result = await db.query(`INSERT INTO signing_owner_contexts(id,deployment_key,scope_key,law_firm_tenant_id)
        VALUES($1,$2,$3,$4) ON CONFLICT(deployment_key,scope_key) DO UPDATE SET deployment_key=EXCLUDED.deployment_key
        RETURNING id`, [randomUUID(), deploymentKey, tenantId || 'dedicated', tenantId]);
    return Object.freeze({
        contextId: result.rows[0].id, userId, tenantId,
        all: !custom || getSigningDataScope(req.firmPermissions) === 'all_firm',
        assignedCases: custom && req.firmPermissions?.areas?.signing?.legacyCaseAssignment === true,
        caseView: !custom || hasAreaAction(req.firmPermissions, 'cases', 'view'),
        // Match the incumbent customer directory (legacy Admin, not every lawyer).
        clientView: custom ? hasAreaAction(req.firmPermissions, 'clients', 'view') : mode === 'platform_admin' || actor.role === 'Admin',
        caseAll: !custom || getCasesDataScope(req.firmPermissions) === 'all_firm',
        send: !custom || hasAreaAction(req.firmPermissions, 'signing', 'upload'),
        templateManage: !custom || hasAreaAction(req.firmPermissions, 'signing', 'manage'),
        manage: !custom || (hasAreaAction(req.firmPermissions, 'signing', 'manage') && hasAreaAction(req.firmPermissions, 'signing', 'upload')),
        authorityManage: !custom || hasAreaAction(req.firmPermissions, 'signing', 'authority_manage'),
        contactCorrect: !custom || (hasAreaAction(req.firmPermissions, 'signing', 'manage') && hasAreaAction(req.firmPermissions, 'signing', 'delivery_contact_correct')),
        linkRenew: !custom || hasAreaAction(req.firmPermissions, 'signing', 'access_link_renew'),
        packageApprove: !custom || hasAreaAction(req.firmPermissions, 'signing', 'package_approve'),
        mode,
    });
}

function packageScopeSql(alias = 'p', offset = 1) {
    // alias and offset come exclusively from server code.
    return `${alias}.owner_context_id=$${offset} AND ($${offset + 1}::boolean OR ${alias}.owner_userid=$${offset + 2}
        OR EXISTS (SELECT 1 FROM signing_package_assignments a WHERE a.owner_context_id=${alias}.owner_context_id
            AND a.package_id=${alias}.id AND a.user_id=$${offset + 2})
        OR ($${offset + 3}::boolean AND EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=${alias}.case_id AND cu.userid=$${offset + 2})))`;
}
function scopeParams(scope) { return [scope.contextId, scope.all, scope.userId, scope.assignedCases]; }

async function assertCases(db, scope, caseIds) {
    if (!caseIds.length) return;
    if (!scope.caseView) fail('NOT_FOUND', 404);
    const result = await db.query(`SELECT c.caseid FROM cases c
        WHERE c.caseid=ANY($1::integer[]) AND (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $2::text
        AND ($3::boolean OR EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$4))`,
    [caseIds, scope.tenantId, scope.caseAll, scope.userId]);
    if (result.rowCount !== caseIds.length) fail('NOT_FOUND', 404);
}

async function assertClients(db, scope, clientIds, lock = false) {
    if (!clientIds.length) return;
    if (!scope.clientView) fail('NOT_FOUND', 404);
    const result = await db.query(`SELECT userid FROM users WHERE userid=ANY($1::integer[])
        AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND role NOT IN ('Admin','Deleted')
        ORDER BY userid ${lock ? 'FOR SHARE' : ''}`, [clientIds, scope.tenantId]);
    if (result.rowCount !== clientIds.length) fail('NOT_FOUND', 404);
}

module.exports = { actorScope, packageScopeSql, scopeParams, assertCases, assertClients };

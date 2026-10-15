const { normalizeRolePermissions, hasAreaAction, getSigningDataScope } = require('../../lib/firmRolePermissions');
const { packageScopeSql, scopeParams } = require('./access');
const { fail } = require('../../lib/signingV2/errors');

function requiredDeliveryActions(purpose, renewLink = false) {
    const actions = purpose === 'reminder' ? ['package_remind'] : purpose === 'resend' ? ['delivery_resend'] : [];
    if (renewLink) actions.push('access_link_renew');
    return actions;
}

function assertDeliveryPermission(scope, input) {
    if (scope.send !== true || (input.purpose === 'reminder' && scope.packageRemind !== true)
        || (input.purpose === 'resend' && scope.deliveryResend !== true)
        || (input.renewLink && scope.linkRenew !== true)) fail('FORBIDDEN', 403);
}

// Workers have no request/JWT context. Reconstruct only the current office scope
// from the recorded context and sender; a saved permission snapshot cannot send.
async function currentSenderScope(db, contextId, userId, requiredAction = null) {
    if (!Number.isSafeInteger(userId) || userId < 1) return null;
    const row = (await db.query(`SELECT u.userid,u.role,u.firm_staff_role_id,
            u.law_firm_tenant_id,r.law_firm_tenant_id AS role_tenant,r.permissions,r.is_active,
            EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id=u.userid AND a.is_active) AS platform_admin
        FROM signing_owner_contexts c JOIN users u ON u.userid=$2 AND u.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
        LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id WHERE c.id=$1`, [contextId,userId])).rows[0];
    if (!row || !['Admin','Lawyer','Staff'].includes(row.role)) return null;
    let all = true, assignedCases = false;
    if (!row.platform_admin && row.firm_staff_role_id) {
        if (!row.is_active || String(row.role_tenant || '') !== String(row.law_firm_tenant_id || '')) return null;
        const permissions = normalizeRolePermissions(row.permissions);
        const actions = Array.isArray(requiredAction) ? requiredAction : requiredAction ? [requiredAction] : [];
        if (!hasAreaAction(permissions,'signing','upload') || actions.some(action => !hasAreaAction(permissions,'signing',action))) return null;
        all = getSigningDataScope(permissions) === 'all_firm';
        assignedCases = permissions.areas?.signing?.legacyCaseAssignment === true;
    } else if (!row.platform_admin && !['Admin','Lawyer'].includes(row.role)) return null;
    return { contextId,userId,all,assignedCases };
}

async function senderCanAccess(db, contextId, userId, packageId, requiredAction = null) {
    const scope = await currentSenderScope(db,contextId,userId,requiredAction);
    if (!scope) return false;
    return (await db.query(`SELECT 1 FROM signing_packages p WHERE ${packageScopeSql('p')} AND p.id=$5`,
        [...scopeParams(scope),packageId])).rowCount === 1;
}

async function currentRevisionScope(db, contextId, userId) {
    const scope = await currentSenderScope(db, contextId, userId, ['view', 'manage', 'package_revision_create']);
    return scope ? { ...scope, send: true, manage: true, packageRevise: true } : null;
}

const taskManifest = tasks => tasks.map(task => ({ taskId: task.taskId, documentId: task.documentId,
    version: task.version, stage: task.stage })).sort((a,b) => a.taskId.localeCompare(b.taskId));

module.exports = { currentSenderScope, currentRevisionScope, senderCanAccess, taskManifest, requiredDeliveryActions, assertDeliveryPermission };

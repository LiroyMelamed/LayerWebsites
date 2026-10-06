const pool = require('../config/db');
const { getCurrentTenantId, isMultiTenantMode } = require('./tenant/tenantContext');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const settingsService = require('../services/settingsService');

async function loadActorUser(userId) {
    const { rows } = await pool.query(
        `SELECT userid, role, law_firm_tenant_id, firm_staff_role_id
         FROM users WHERE userid = $1 LIMIT 1`,
        [userId],
    );
    return rows[0] || null;
}

async function assertPlatformAdminSameTenant(req) {
    const userId = Number(req.user?.UserId);
    if (!Number.isFinite(userId) || userId <= 0) {
        throw createAppError('UNAUTHORIZED', 401, getHebrewMessage('AUTH_REQUIRED'));
    }
    const isPa = await settingsService.isPlatformAdmin(userId);
    if (!isPa) {
        throw createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
    }
    const actor = await loadActorUser(userId);
    if (!actor) {
        throw createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
    }
    const tenantId = getCurrentTenantId() || actor.law_firm_tenant_id || null;
    if (isMultiTenantMode() && (!getCurrentTenantId() || String(actor.law_firm_tenant_id || '') !== String(getCurrentTenantId()))) throw createAppError('FORBIDDEN', 403);
    return { actor, tenantId };
}

async function countUsersForRole(roleId, tenantId, db = pool) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS c FROM users
         WHERE firm_staff_role_id = $1
           AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid`,
        [roleId, tenantId],
    );
    return rows[0]?.c ?? 0;
}

async function assertRoleInTenant(roleId, tenantId, db = pool) {
    const { rows } = await db.query(
        `SELECT id, name, permissions, is_active, law_firm_tenant_id
         FROM firm_staff_roles
         WHERE id = $1 AND is_active = TRUE
         LIMIT 1`,
        [roleId],
    );
    const role = rows[0];
    if (!role) return null;
    if (String(role.law_firm_tenant_id || '') !== String(tenantId || '')) {
        return null;
    }
    return role;
}

async function assertTargetUserInTenant(userId, tenantId, db = pool) {
    const { rows } = await db.query(
        `SELECT userid, role, law_firm_tenant_id, firm_staff_role_id, name, email, phonenumber
         FROM users WHERE userid = $1 LIMIT 1`,
        [userId],
    );
    const user = rows[0];
    if (!user) return null;
    if (String(user.law_firm_tenant_id || '') !== String(tenantId || '')) {
        return null;
    }
    return user;
}

module.exports = {
    loadActorUser,
    assertPlatformAdminSameTenant,
    countUsersForRole,
    assertRoleInTenant,
    assertTargetUserInTenant,
};

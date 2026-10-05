const pool = require('../config/db');
const { normalizeRolePermissions } = require('../lib/firmRolePermissions');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');

/**
 * Loads firm_staff_role permissions from DB (every authenticated request).
 * Must run immediately after JWT auth.
 */
module.exports = async function attachFirmPermissions(req, res, next) {
    req.firmPermissionMode = 'legacy';
    req.firmPermissions = null;
    req.firmStaffRoleName = null;
    req.firmStaffRoleId = null;
    req.isPlatformAdminUser = false;
    req.firmTenantId = null;
    req.firmPermissionContextValidated = false;

    const userId = Number(req.user?.UserId);
    if (!Number.isFinite(userId) || userId <= 0) {
        return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('UNAUTHORIZED')));
    }

    try {
        // Customer identities validate their current base role without staff-schema dependencies.
        if (['User', 'Client', 'ExternalSigner'].includes(req.user?.Role)) {
            const identity = await pool.query('SELECT userid, role, law_firm_tenant_id FROM users WHERE userid = $1 LIMIT 1', [userId]);
            const current = identity.rows[0];
            if (!current || !['User', 'Client', 'ExternalSigner'].includes(current.role)) {
                return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('UNAUTHORIZED')));
            }
            // Use the current DB customer role; do not force re-login for customer enum changes.
            req.user.Role = current.role;
            if (req.tenant?.id && String(current.law_firm_tenant_id || '') !== String(req.tenant.id)) {
                return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
            }
            req.firmTenantId = current.law_firm_tenant_id || null;
            return next();
        }
        const result = await pool.query(
            `SELECT u.userid,
                    u.role,
                    u.law_firm_tenant_id,
                    u.firm_staff_role_id,
                    r.id AS role_id,
                    r.name AS role_name,
                    r.permissions AS role_permissions,
                    r.is_active AS role_is_active,
                    r.law_firm_tenant_id AS role_tenant_id,
                    EXISTS (
                        SELECT 1 FROM platform_admins pa
                        WHERE pa.user_id = u.userid AND pa.is_active = TRUE
                    ) AS is_platform_admin
             FROM users u
             LEFT JOIN firm_staff_roles r ON r.id = u.firm_staff_role_id
             WHERE u.userid = $1
             LIMIT 1`,
            [userId],
        );
        const rows = result.rows;

        if (!rows.length) {
            return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('UNAUTHORIZED')));
        }

        const row = rows[0];
        if (req.tenant?.id && String(row.law_firm_tenant_id || '') !== String(req.tenant.id)) {
            return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
        }
        if (row.role && !['Admin', 'Lawyer', 'Staff'].includes(row.role)) {
            return next(createAppError('UNAUTHORIZED', 401, getHebrewMessage('UNAUTHORIZED')));
        }
        if (row.role) req.user.Role = row.role;
        req.firmPermissionContextValidated = true;
        req.firmTenantId = row.law_firm_tenant_id || null;
        req.isPlatformAdminUser = Boolean(row.is_platform_admin);

        if (req.isPlatformAdminUser) {
            req.firmPermissionMode = 'platform_admin';
            return next();
        }

        if (row.firm_staff_role_id) {
            if (!row.role_id || !row.role_is_active) {
                const err = createAppError(
                    'FIRM_ROLE_INACTIVE',
                    403,
                    'תפקיד העובד אינו פעיל. פנה למנהל הפלטפורמה.',
                );
                err.__firmPermissionBlocked = true;
                return next(err);
            }
            if (
                String(row.law_firm_tenant_id || '') !== String(row.role_tenant_id || '')
            ) {
                const err = createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN'));
                err.__firmPermissionBlocked = true;
                return next(err);
            }
            req.firmStaffRoleId = row.firm_staff_role_id;
            req.firmStaffRoleName = row.role_name;
            req.firmPermissions = normalizeRolePermissions(row.role_permissions);
            req.firmPermissionMode = 'role';
            return next();
        }

        return next();
    } catch (err) {
        // A failed permissions lookup must not turn an assigned role into legacy access.
        // Forward transient database failures so protected handlers cannot run.
        return next(err);
    }
};

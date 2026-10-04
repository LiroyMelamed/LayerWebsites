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

    const userId = Number(req.user?.UserId);
    if (!Number.isFinite(userId) || userId <= 0) {
        return next();
    }

    try {
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
            return next();
        }

        const row = rows[0];
        req.isPlatformAdminUser = Boolean(row.is_platform_admin);

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
                row.law_firm_tenant_id &&
                row.role_tenant_id &&
                String(row.law_firm_tenant_id) !== String(row.role_tenant_id)
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

        if (req.isPlatformAdminUser) {
            req.firmPermissionMode = 'platform_admin';
        }

        return next();
    } catch (err) {
        if (err?.code === '42P01' || err?.code === '42703') {
            req.firmPermissionMode = 'legacy';
            return next();
        }
        const connCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '08006']);
        if (connCodes.has(err?.code) || /connect/i.test(String(err?.message || ''))) {
            req.firmPermissionMode = 'legacy';
            return next();
        }
        return next(err);
    }
};

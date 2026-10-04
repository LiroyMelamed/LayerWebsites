const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { getCatalogForApi, normalizeRolePermissions } = require('../lib/firmRolePermissions');
const { getSessionScopePayload } = require('../lib/firmPermissions/accessPure');
const {
    assertPlatformAdminSameTenant,
    countUsersForRole,
    assertRoleInTenant,
    assertTargetUserInTenant,
} = require('../lib/firmStaffTenant');

const STAFF_EMPLOYEE_ROLES = Object.freeze(['Staff']);

async function getPermissionCatalog(_req, res) {
    return res.json(getCatalogForApi());
}

async function getSessionScope(req, res) {
    const scope = getSessionScopePayload(req);
    return res.json({
        ...scope,
        isPlatformAdmin: Boolean(req.isPlatformAdminUser),
    });
}

async function listRoles(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const { rows } = await pool.query(
            `SELECT r.id, r.name, r.permissions, r.is_active, r.created_at, r.updated_at,
                    (SELECT COUNT(*)::int FROM users u
                     WHERE u.firm_staff_role_id = r.id
                       AND ($1::uuid IS NULL OR u.law_firm_tenant_id = $1)) AS assigned_user_count
             FROM firm_staff_roles r
             WHERE r.is_active = TRUE
               AND ($1::uuid IS NULL OR r.law_firm_tenant_id = $1)
             ORDER BY r.name ASC`,
            [tenantId],
        );
        return res.json(
            rows.map((r) => ({
                id: r.id,
                name: r.name,
                permissions: normalizeRolePermissions(r.permissions),
                assignedUserCount: r.assigned_user_count,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            })),
        );
    } catch (e) {
        return next(e);
    }
}

async function createRole(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return next(createAppError('VALIDATION_ERROR', 400, 'שם תפקיד נדרש'));
        }
        const permissions = normalizeRolePermissions(req.body?.permissions);
        const { rows } = await pool.query(
            `INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions)
             VALUES ($1, $2, $3::jsonb)
             RETURNING id, name, permissions, created_at, updated_at`,
            [tenantId, name, JSON.stringify(permissions)],
        );
        const row = rows[0];
        return res.status(201).json({
            id: row.id,
            name: row.name,
            permissions: normalizeRolePermissions(row.permissions),
            assignedUserCount: 0,
        });
    } catch (e) {
        if (e?.code === '23505') {
            return next(createAppError('CONFLICT', 409, 'כבר קיים תפקיד עם שם זה במשרד'));
        }
        return next(e);
    }
}

async function updateRole(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const roleId = req.params.roleId;
        const existing = await assertRoleInTenant(roleId, tenantId);
        if (!existing) {
            return next(createAppError('NOT_FOUND', 404, 'תפקיד לא נמצא'));
        }
        const assignedUserCount = await countUsersForRole(roleId, tenantId);
        const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
        const permissions =
            req.body?.permissions !== undefined
                ? normalizeRolePermissions(req.body.permissions)
                : undefined;

        const { rows } = await pool.query(
            `UPDATE firm_staff_roles
             SET name = COALESCE($2, name),
                 permissions = COALESCE($3::jsonb, permissions),
                 updated_at = now()
             WHERE id = $1
             RETURNING id, name, permissions, updated_at`,
            [
                roleId,
                name || null,
                permissions ? JSON.stringify(permissions) : null,
            ],
        );
        const row = rows[0];
        return res.json({
            id: row.id,
            name: row.name,
            permissions: normalizeRolePermissions(row.permissions),
            assignedUserCount,
        });
    } catch (e) {
        if (e?.code === '23505') {
            return next(createAppError('CONFLICT', 409, 'כבר קיים תפקיד עם שם זה במשרד'));
        }
        return next(e);
    }
}

async function deactivateRole(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const roleId = req.params.roleId;
        const existing = await assertRoleInTenant(roleId, tenantId);
        if (!existing) {
            return next(createAppError('NOT_FOUND', 404, 'תפקיד לא נמצא'));
        }
        const assignedUserCount = await countUsersForRole(roleId, tenantId);
        if (assignedUserCount > 0) {
            return next(
                createAppError(
                    'ROLE_HAS_ASSIGNED_USERS',
                    409,
                    `לא ניתן להשבית תפקיד — ${assignedUserCount} עובדים משויכים. העבר אותם לתפקיד אחר תחילה.`,
                    { assignedUserCount },
                ),
            );
        }
        await pool.query(
            `UPDATE firm_staff_roles SET is_active = FALSE, updated_at = now() WHERE id = $1`,
            [roleId],
        );
        return res.json({ ok: true, assignedUserCount: 0 });
    } catch (e) {
        return next(e);
    }
}

async function listEmployees(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const { rows } = await pool.query(
            `SELECT u.userid, u.name, u.email, u.phonenumber, u.role, u.firm_staff_role_id,
                    r.name AS firm_staff_role_name
             FROM users u
             LEFT JOIN firm_staff_roles r ON r.id = u.firm_staff_role_id
             WHERE u.role = ANY($1::text[])
               AND ($2::uuid IS NULL OR u.law_firm_tenant_id = $2)
             ORDER BY u.createdat DESC NULLS LAST, u.userid DESC`,
            [STAFF_EMPLOYEE_ROLES, tenantId],
        );
        return res.json(rows);
    } catch (e) {
        return next(e);
    }
}

async function createEmployee(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const { name, email, phoneNumber, password, firmStaffRoleId } = req.body || {};
        const roleId = String(firmStaffRoleId || '').trim();
        if (!name || !phoneNumber || !password || !roleId) {
            return next(createAppError('VALIDATION_ERROR', 400, getHebrewMessage('VALIDATION_ERROR') || 'שדות חובה חסרים'));
        }
        const role = await assertRoleInTenant(roleId, tenantId);
        if (!role) {
            return next(createAppError('NOT_FOUND', 404, 'תפקיד לא נמצא במשרד זה'));
        }
        const hashedPassword = await bcrypt.hash(String(password), 10);
        const { rows } = await pool.query(
            `INSERT INTO users (name, email, phonenumber, passwordhash, role, law_firm_tenant_id, firm_staff_role_id)
             VALUES ($1, $2, $3, $4, 'Staff', $5, $6)
             RETURNING userid, name, email, phonenumber, role, firm_staff_role_id`,
            [name, email || null, phoneNumber, hashedPassword, tenantId, roleId],
        );
        return res.status(201).json(rows[0]);
    } catch (e) {
        return next(e);
    }
}

async function updateEmployee(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const userId = Number(req.params.userId);
        const target = await assertTargetUserInTenant(userId, tenantId);
        if (!target || !STAFF_EMPLOYEE_ROLES.includes(target.role)) {
            return next(createAppError('NOT_FOUND', 404, 'עובד לא נמצא'));
        }
        const { name, email, phoneNumber, password, firmStaffRoleId } = req.body || {};
        let roleId = target.firm_staff_role_id;
        if (firmStaffRoleId !== undefined) {
            const nextRole = await assertRoleInTenant(String(firmStaffRoleId), tenantId);
            if (!nextRole) {
                return next(createAppError('NOT_FOUND', 404, 'תפקיד לא נמצא במשרד זה'));
            }
            roleId = nextRole.id;
        }
        if (!roleId) {
            return next(createAppError('VALIDATION_ERROR', 400, 'יש לבחור תפקיד'));
        }
        const hashedPassword = password ? await bcrypt.hash(String(password), 10) : null;
        await pool.query(
            `UPDATE users
             SET name = COALESCE($2, name),
                 email = COALESCE($3, email),
                 phonenumber = COALESCE($4, phonenumber),
                 passwordhash = COALESCE($5, passwordhash),
                 firm_staff_role_id = $6
             WHERE userid = $1`,
            [userId, name || null, email ?? null, phoneNumber || null, hashedPassword, roleId],
        );
        return res.json({ ok: true });
    } catch (e) {
        return next(e);
    }
}

module.exports = {
    getPermissionCatalog,
    getSessionScope,
    listRoles,
    createRole,
    updateRole,
    deactivateRole,
    listEmployees,
    createEmployee,
    updateEmployee,
};

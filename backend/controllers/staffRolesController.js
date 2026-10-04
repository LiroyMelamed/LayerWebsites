const pool = require('../config/db');
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { getCatalogForApi, normalizeRolePermissions } = require('../lib/firmRolePermissions');
const { getSessionScopePayload } = require('../lib/firmPermissions/accessPure');
const settingsService = require('../services/settingsService');
const {
    assertPlatformAdminSameTenant,
    countUsersForRole,
    assertRoleInTenant,
    assertTargetUserInTenant,
} = require('../lib/firmStaffTenant');
const {
    OFFICE_USER_LIST_ROLES,
    FIRM_STAFF_ROLE_ASSIGNMENT_ROLES,
    assertFirmStaffRoleCompatibleWithUser,
} = require('../lib/firmStaffOfficeUsers');

function mapOfficeUserRow(row) {
    return {
        userId: row.userid,
        name: row.name,
        role: row.role,
        phone: row.phonenumber,
        email: row.email,
        firmStaffRoleId: row.firm_staff_role_id || null,
        firmStaffRoleName: row.firm_staff_role_name || null,
        isPlatformAdmin: Boolean(row.is_platform_admin),
        createdAt: row.createdat,
    };
}

async function listOfficeUsers(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const rawName = req?.query?.name;
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        const params = [OFFICE_USER_LIST_ROLES];
        let query = `
            SELECT u.userid, u.name, u.email, u.phonenumber, u.role, u.createdat,
                   u.firm_staff_role_id,
                   r.name AS firm_staff_role_name,
                   EXISTS (
                       SELECT 1 FROM platform_admins pa
                       WHERE pa.user_id = u.userid AND pa.is_active = TRUE
                   ) AS is_platform_admin
            FROM users u
            LEFT JOIN firm_staff_roles r ON r.id = u.firm_staff_role_id AND r.is_active = TRUE
            WHERE u.role = ANY($1::text[])
              AND ($2::uuid IS NULL OR u.law_firm_tenant_id = $2)
        `;
        params.push(tenantId);
        if (name) {
            params.push(`%${name}%`);
            query += ` AND u.name ILIKE $${params.length}`;
        }
        query += ' ORDER BY u.role ASC, u.name ASC';
        const { rows } = await pool.query(query, params);
        return res.json(rows.map(mapOfficeUserRow));
    } catch (e) {
        return next(e);
    }
}

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

async function nameConflictExists(tenantId, name, excludeRoleId = null) {
    const { rows } = await pool.query(
        `SELECT 1 FROM firm_staff_roles
         WHERE is_active = TRUE
           AND lower(name) = lower($1)
           AND law_firm_tenant_id IS NOT DISTINCT FROM $2
           AND ($3::uuid IS NULL OR id <> $3)
         LIMIT 1`,
        [name, tenantId ?? null, excludeRoleId],
    );
    return rows.length > 0;
}

async function createRole(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return next(createAppError('VALIDATION_ERROR', 400, 'שם תפקיד נדרש'));
        }
        if (await nameConflictExists(tenantId, name)) {
            return next(createAppError('CONFLICT', 409, 'כבר קיים תפקיד עם שם זה במשרד'));
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
        if (name !== undefined) {
            if (!name) {
                return next(createAppError('VALIDATION_ERROR', 400, 'שם תפקיד נדרש'));
            }
            if (await nameConflictExists(tenantId, name, roleId)) {
                return next(createAppError('CONFLICT', 409, 'כבר קיים תפקיד עם שם זה במשרד'));
            }
        }
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

async function assignUserFirmStaffRole(req, res, next) {
    try {
        const { tenantId } = await assertPlatformAdminSameTenant(req);
        const userId = Number(req.params.userId);
        if (!Number.isFinite(userId) || userId <= 0) {
            return next(createAppError('VALIDATION_ERROR', 400, getHebrewMessage('VALIDATION_ERROR')));
        }
        const target = await assertTargetUserInTenant(userId, tenantId);
        if (!target || !FIRM_STAFF_ROLE_ASSIGNMENT_ROLES.includes(target.role)) {
            return next(createAppError('NOT_FOUND', 404, 'משתמש לא נמצא'));
        }
        if (await settingsService.isPlatformAdmin(userId)) {
            return next(
                createAppError(
                    'FORBIDDEN',
                    403,
                    'לא ניתן לשייך תפקיד מותאם למנהל פלטפורמה — ההרשאות נשארות לפי מנהל הפלטפורמה.',
                ),
            );
        }
        const body = req.body || {};
        const extraKeys = Object.keys(body).filter((k) => k !== 'firmStaffRoleId');
        if (extraKeys.length > 0) {
            return next(createAppError('VALIDATION_ERROR', 400, 'שדות לא נתמכים בבקשה'));
        }
        if (!Object.prototype.hasOwnProperty.call(body, 'firmStaffRoleId')) {
            return next(createAppError('VALIDATION_ERROR', 400, 'firmStaffRoleId נדרש (UUID או null)'));
        }
        const raw = body.firmStaffRoleId;
        if (raw === null || raw === '') {
            await pool.query(`UPDATE users SET firm_staff_role_id = NULL WHERE userid = $1`, [userId]);
            return res.json({ ok: true, firmStaffRoleId: null, firmStaffRoleName: null });
        }
        const roleId = String(raw).trim();
        const role = await assertRoleInTenant(roleId, tenantId);
        if (!role) {
            const inactive = await pool.query(
                `SELECT id FROM firm_staff_roles WHERE id = $1 AND is_active = FALSE LIMIT 1`,
                [roleId],
            );
            if (inactive.rows.length > 0) {
                return next(createAppError('ROLE_INACTIVE', 409, 'לא ניתן לשייך תפקיד שאינו פעיל'));
            }
            return next(createAppError('NOT_FOUND', 404, 'תפקיד לא נמצא במשרד זה'));
        }
        const compatErr = assertFirmStaffRoleCompatibleWithUser(target.role, role);
        if (compatErr) return next(compatErr);
        await pool.query(`UPDATE users SET firm_staff_role_id = $2 WHERE userid = $1`, [userId, role.id]);
        return res.json({
            ok: true,
            firmStaffRoleId: role.id,
            firmStaffRoleName: role.name,
        });
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
    listOfficeUsers,
    assignUserFirmStaffRole,
};

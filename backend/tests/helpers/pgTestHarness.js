const fs = require('fs');
const path = require('path');

function configurePostgresEnvFromLocalDefaults() {
    process.env.DB_HOST = process.env.FIRM_PERM_DB_HOST || process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.FIRM_PERM_DB_PORT || process.env.DB_PORT || '55439';
    process.env.DB_NAME = process.env.FIRM_PERM_DB_NAME || process.env.DB_NAME || 'legal_e2e_qa';
    process.env.DB_USER = process.env.FIRM_PERM_DB_USER || process.env.DB_USER || 'postgres';
    process.env.DB_PASSWORD = process.env.FIRM_PERM_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '';
    process.env.DB_SSL = 'false';
    process.env.IS_PRODUCTION = 'false';
    process.env.NODE_ENV = 'test';
}

function getPool() {
    return require('../../config/db');
}

async function assertPostgresReady() {
    configurePostgresEnvFromLocalDefaults();
    const pool = getPool();
    await pool.query('SELECT 1');
    await pool.query('SELECT 1 FROM firm_staff_roles LIMIT 1');
    return pool;
}

async function ensureFirmStaffRolesMigration() {
    const pool = getPool();
    try {
        await pool.query('SELECT 1 FROM firm_staff_roles LIMIT 1');
    } catch {
        const sqlPath = path.join(__dirname, '../../migrations/2026-10-03_00_firm_staff_roles.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
    }
    const uniqPath = path.join(__dirname, '../../migrations/2026-10-04_00_firm_staff_roles_unique_nulls_not_distinct.sql');
    if (fs.existsSync(uniqPath)) {
        const uniqSql = fs.readFileSync(uniqPath, 'utf8');
        await pool.query(uniqSql);
    }
}

function makePermissions(areasPartial) {
    const { normalizeRolePermissions } = require('../../lib/firmRolePermissions');
    return normalizeRolePermissions({ areas: areasPartial });
}

async function insertTenant(client, slugSuffix) {
    const slug = `perm${String(slugSuffix).replace(/[^a-z0-9]/g, '').slice(0, 20)}${Date.now().toString(36).slice(-4)}`;
    const { rows } = await client.query(
        `INSERT INTO law_firm_tenants (slug, name)
         VALUES ($1, $2)
         RETURNING id, slug`,
        [slug, `Test ${slug}`],
    );
    return rows[0];
}

async function insertUser(client, { tenantId, role, name, firmStaffRoleId = null }) {
    const phone = `05${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 9)}`;
    const { rows } = await client.query(
        `INSERT INTO users (name, email, phonenumber, passwordhash, role, law_firm_tenant_id, firm_staff_role_id)
         VALUES ($1, $2, $3, 'x', $4, $5, $6)
         RETURNING userid`,
        [`${name}`, `${phone}@example.test`, phone, role, tenantId, firmStaffRoleId],
    );
    return rows[0].userid;
}

async function insertPlatformAdmin(client, userId) {
    await client.query(
        `INSERT INTO platform_admins (user_id, name, is_active)
         VALUES ($1, 'Test PA', TRUE)
         ON CONFLICT (user_id) DO UPDATE SET is_active = TRUE`,
        [userId],
    );
}

async function insertRole(client, tenantId, name, permissionsObj) {
    const { rows } = await client.query(
        `INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id`,
        [tenantId, name, JSON.stringify(permissionsObj)],
    );
    return rows[0].id;
}

async function insertCase(client, { name, managerId, linkUserIds = [] }) {
    const { rows } = await client.query(
        `INSERT INTO cases (casename, casemanagerid, createdat, updatedat, isclosed, istagged)
         VALUES ($1, $2, NOW(), NOW(), false, false)
         RETURNING caseid`,
        [name, managerId || null],
    );
    const caseId = rows[0].caseid;
    for (const uid of linkUserIds) {
        await client.query(
            `INSERT INTO case_users (caseid, userid) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [caseId, uid],
        );
    }
    return caseId;
}

async function insertSigningFile(client, { caseId, lawyerId }) {
    const { rows } = await client.query(
        `INSERT INTO signingfiles (caseid, lawyerid, filename, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING signingfileid`,
        [caseId, lawyerId, `test-${Date.now()}.pdf`],
    );
    return rows[0].signingfileid;
}

async function cleanupIds(client, ids) {
    const {
        userIds = [],
        roleIds = [],
        caseIds = [],
        tenantIds = [],
        signingFileIds = [],
    } = ids;
    if (signingFileIds.length) {
        await client.query(`DELETE FROM signingfiles WHERE signingfileid = ANY($1::int[])`, [signingFileIds]);
    }
    if (caseIds.length) {
        await client.query(`DELETE FROM case_users WHERE caseid = ANY($1::int[])`, [caseIds]);
        await client.query(`DELETE FROM cases WHERE caseid = ANY($1::int[])`, [caseIds]);
    }
    if (userIds.length) {
        await client.query(`DELETE FROM platform_admins WHERE user_id = ANY($1::int[])`, [userIds]);
        await client.query(`UPDATE users SET firm_staff_role_id = NULL WHERE userid = ANY($1::int[])`, [userIds]);
        await client.query(`DELETE FROM users WHERE userid = ANY($1::int[])`, [userIds]);
    }
    if (roleIds.length) {
        await client.query(`DELETE FROM firm_staff_roles WHERE id = ANY($1::uuid[])`, [roleIds]);
    }
    if (tenantIds.length) {
        await client.query(`DELETE FROM law_firm_tenants WHERE id = ANY($1::uuid[])`, [tenantIds]);
    }
}

module.exports = {
    configurePostgresEnvFromLocalDefaults,
    getPool,
    assertPostgresReady,
    ensureFirmStaffRolesMigration,
    makePermissions,
    insertTenant,
    insertUser,
    insertPlatformAdmin,
    insertRole,
    insertCase,
    insertSigningFile,
    cleanupIds,
};

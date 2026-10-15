const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pg = require('./helpers/pgTestHarness');

pg.configurePostgresEnvFromLocalDefaults();

async function runDedupeMigrationSql(client) {
    const sqlPath = path.join(__dirname, '../migrations/2026-10-04_00_firm_staff_roles_unique_nulls_not_distinct.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
}

test('dedupe migration reassigns users before deactivating duplicate roles', async (t) => {
    let pool;
    try {
        pool = await pg.assertPostgresReady();
        await pg.ensureFirmStaffRolesMigration();
    } catch (e) {
        t.skip(`Postgres unavailable: ${e.message}`);
        return;
    }

    const client = await pool.connect();
    const tag = Date.now();
    const ids = { userIds: [], roleIds: [], tenantIds: [] };
    const dupName = `DedupeMigrate ${tag}`;

    try {
        await pool.query('DROP INDEX IF EXISTS firm_staff_roles_tenant_name_uidx');

        await client.query('BEGIN');
        const roleA = await client.query(
            `INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions, is_active)
             VALUES (NULL, $1, '{"areas":{"main":{"visible":true,"actions":[]}}}'::jsonb, TRUE)
             RETURNING id`,
            [dupName],
        );
        const roleB = await client.query(
            `INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions, is_active)
             VALUES (NULL, $1, '{"areas":{"main":{"visible":true,"actions":[]}}}'::jsonb, TRUE)
             RETURNING id`,
            [dupName],
        );
        const idA = roleA.rows[0].id;
        const idB = roleB.rows[0].id;
        ids.roleIds.push(idA, idB);

        const u1 = await pg.insertUser(client, {
            tenantId: null,
            role: 'Staff',
            name: `U1 ${tag}`,
            firmStaffRoleId: idA,
        });
        const u2 = await pg.insertUser(client, {
            tenantId: null,
            role: 'Staff',
            name: `U2 ${tag}`,
            firmStaffRoleId: idB,
        });
        ids.userIds.push(u1, u2);
        await client.query('COMMIT');

        const runClient = await pool.connect();
        try {
            await runDedupeMigrationSql(runClient);
        } finally {
            runClient.release();
        }

        const active = await pool.query(
            `SELECT id FROM firm_staff_roles WHERE is_active AND lower(name) = lower($1)`,
            [dupName],
        );
        assert.equal(active.rows.length, 1, 'exactly one active survivor');
        const survivorId = active.rows[0].id;

        const users = await pool.query(
            `SELECT userid, firm_staff_role_id FROM users WHERE userid = ANY($1::int[])`,
            [ids.userIds],
        );
        for (const row of users.rows) {
            assert.equal(String(row.firm_staff_role_id), String(survivorId));
        }

        const inactive = await pool.query(
            `SELECT COUNT(*)::int AS c FROM firm_staff_roles WHERE NOT is_active AND lower(name) = lower($1)`,
            [dupName],
        );
        assert.equal(inactive.rows[0].c, 1, 'one deactivated duplicate');
    } finally {
        const cleanup = await pool.connect();
        try {
            await pg.cleanupIds(cleanup, ids);
        } finally {
            cleanup.release();
            client.release();
        }
    }
});

test('dedupe migration aborts when duplicate active names have different permissions', async (t) => {
    let pool;
    try {
        pool = await pg.assertPostgresReady();
        await pg.ensureFirmStaffRolesMigration();
    } catch (e) {
        t.skip(`Postgres unavailable: ${e.message}`);
        return;
    }

    const tag = Date.now();
    const dupName = `DedupeConflict ${tag}`;
    const ids = { userIds: [], roleIds: [], tenantIds: [] };

    await pool.query('DROP INDEX IF EXISTS firm_staff_roles_tenant_name_uidx');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const permsX = '{"areas":{"cases":{"visible":true,"actions":["view"],"dataScope":"assigned_only"}}}';
        const permsY = '{"areas":{"cases":{"visible":true,"actions":["view","edit"],"dataScope":"all_firm"}}}';
        const roleA = await client.query(
            `INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions, is_active)
             VALUES (NULL, $1, $2::jsonb, TRUE) RETURNING id`,
            [dupName, permsX],
        );
        const roleB = await client.query(
            `INSERT INTO firm_staff_roles (law_firm_tenant_id, name, permissions, is_active)
             VALUES (NULL, $1, $2::jsonb, TRUE) RETURNING id`,
            [dupName, permsY],
        );
        ids.roleIds.push(roleA.rows[0].id, roleB.rows[0].id);
        ids.userIds.push(
            await pg.insertUser(client, { tenantId: null, role: 'Staff', name: `Ux ${tag}`, firmStaffRoleId: roleA.rows[0].id }),
            await pg.insertUser(client, { tenantId: null, role: 'Staff', name: `Uy ${tag}`, firmStaffRoleId: roleB.rows[0].id }),
        );
        await client.query('COMMIT');
    } finally {
        client.release();
    }

    const runClient = await pool.connect();
    let threw = false;
    try {
        await runDedupeMigrationSql(runClient);
    } catch (e) {
        threw = true;
        assert.match(String(e.message), /conflicting permissions/i);
        await runClient.query('ROLLBACK').catch(() => {});
    } finally {
        runClient.release();
    }
    assert.equal(threw, true, 'migration must fail on permission mismatch');

    const stillActive = await pool.query(
        `SELECT COUNT(*)::int AS c FROM firm_staff_roles WHERE is_active AND lower(name) = lower($1)`,
        [dupName],
    );
    assert.equal(stillActive.rows[0].c, 2, 'both conflicting roles remain active');

    const cleanup = await pool.connect();
    try {
        await pg.cleanupIds(cleanup, ids);
        await cleanup.query('DROP INDEX IF EXISTS firm_staff_roles_tenant_name_uidx');
        await runDedupeMigrationSql(cleanup);
    } finally {
        cleanup.release();
    }
});

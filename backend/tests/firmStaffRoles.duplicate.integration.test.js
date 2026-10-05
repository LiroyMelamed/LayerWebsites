const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const pg = require('./helpers/pgTestHarness');
const { applyBaseTestEnv, stubBillingSnapshotUnlocked, loadTestApp } = require('./helpers/integrationEnv');

pg.configurePostgresEnvFromLocalDefaults();
applyBaseTestEnv();
stubBillingSnapshotUnlocked();

function paToken(userid) {
    return jwt.sign({ userid, role: 'Admin', phoneNumber: '0500000001' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

test('firm_staff_roles duplicate name enforcement', async (t) => {
    let pool;
    try {
        pool = await pg.assertPostgresReady();
        await pg.ensureFirmStaffRolesMigration();
    } catch (e) {
        t.skip(`Postgres unavailable: ${e.message}`);
        return;
    }

    const app = loadTestApp();
    const client = await pool.connect();
    const tag = Date.now();
    const ids = { userIds: [], roleIds: [], tenantIds: [] };

    try {
        await client.query('BEGIN');
        const tenantA = await pg.insertTenant(client, `dupA${tag}`);
        const tenantB = await pg.insertTenant(client, `dupB${tag}`);
        ids.tenantIds.push(tenantA.id, tenantB.id);
        const paA = await pg.insertUser(client, { tenantId: tenantA.id, role: 'Admin', name: `PA A ${tag}` });
        const paB = await pg.insertUser(client, { tenantId: tenantB.id, role: 'Admin', name: `PA B ${tag}` });
        ids.userIds.push(paA, paB);
        await pg.insertPlatformAdmin(client, paA);
        await pg.insertPlatformAdmin(client, paB);
        await client.query('COMMIT');

        const tokenA = paToken(paA);
        const tokenB = paToken(paB);
        const perms = { areas: { main: { visible: true, actions: [] } } };

        const nullName = `NullDup ${tag}`;
        const r1 = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
            name: nullName,
            permissions: perms,
        });
        assert.equal(r1.status, 201);
        ids.roleIds.push(r1.body.id);

        const r2 = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
            name: nullName,
            permissions: perms,
        });
        assert.equal(r2.status, 409);

        const r3 = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
            name: `  ${nullName.toUpperCase()}  `,
            permissions: perms,
        });
        assert.equal(r3.status, 409);

        const shared = `Shared ${tag}`;
        const ta = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
            name: shared,
            permissions: perms,
        });
        const tb = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenB}`).send({
            name: shared,
            permissions: perms,
        });
        assert.equal(ta.status, 201);
        assert.equal(tb.status, 201);
        ids.roleIds.push(ta.body.id, tb.body.id);

        const renameTarget = `RenameTarget ${tag}`;
        const renameOther = `RenameOther ${tag}`;
        const rt = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
            name: renameTarget,
            permissions: perms,
        });
        const ro = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
            name: renameOther,
            permissions: perms,
        });
        ids.roleIds.push(rt.body.id, ro.body.id);
        const renameFail = await request(app)
            .patch(`/api/staff/roles/${ro.body.id}`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ name: renameTarget });
        assert.equal(renameFail.status, 409);

        const concName = `Concurrent ${tag}`;
        const [c1, c2] = await Promise.all([
            request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
                name: concName,
                permissions: perms,
            }),
            request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenA}`).send({
                name: concName,
                permissions: perms,
            }),
        ]);
        const concStatuses = [c1.status, c2.status].sort();
        assert.deepEqual(concStatuses, [201, 409]);
        if (c1.status === 201) ids.roleIds.push(c1.body.id);
        if (c2.status === 201) ids.roleIds.push(c2.body.id);

        // Legacy NULL tenant bucket (Melamedia-style): second NULL-tenant role same name → 409
        const paNull = await pg.insertUser(client, { tenantId: null, role: 'Admin', name: `PA Null ${tag}` });
        ids.userIds.push(paNull);
        await pg.insertPlatformAdmin(client, paNull);
        const tokenNull = paToken(paNull);
        const legacyName = `LegacyNull ${tag}`;
        const ln1 = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenNull}`).send({
            name: legacyName,
            permissions: perms,
        });
        const ln2 = await request(app).post('/api/staff/roles').set('Authorization', `Bearer ${tokenNull}`).send({
            name: legacyName,
            permissions: perms,
        });
        assert.equal(ln1.status, 201);
        assert.equal(ln2.status, 409);
        ids.roleIds.push(ln1.body.id);
    } finally {
        client.release();
        const cleanupClient = await pool.connect();
        try {
            await pg.cleanupIds(cleanupClient, ids);
        } finally {
            cleanupClient.release();
        }
    }
});

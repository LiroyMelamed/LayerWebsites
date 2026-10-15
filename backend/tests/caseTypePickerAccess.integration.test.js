const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const pg = require('./helpers/pgTestHarness');
const { applyBaseTestEnv, stubBillingSnapshotUnlocked, loadTestApp } = require('./helpers/integrationEnv');

pg.configurePostgresEnvFromLocalDefaults();
applyBaseTestEnv();
stubBillingSnapshotUnlocked();

function makeToken(userid, role = 'Staff') {
    return jwt.sign({ userid, role, phoneNumber: '0500000001' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('GetCaseTypeByName: cases.create without caseTypes.view returns firm catalog', async (t) => {
    let pool;
    let app;
    try {
        pool = await pg.assertPostgresReady();
        await pg.ensureFirmStaffRolesMigration();
        app = loadTestApp();
    } catch (e) {
        t.skip(`Postgres unavailable: ${e.message}`);
        return;
    }

    const client = await pool.connect();
    const tag = Date.now();
    const ids = { userIds: [], roleIds: [], tenantIds: [], caseTypeIds: [] };

    try {
        await client.query('BEGIN');
        const ct = await client.query(
            `INSERT INTO casetypes (casetypename, numberofstages) VALUES ($1, 2) RETURNING casetypeid`,
            [`PickerType ${tag}`],
        );
        ids.caseTypeIds.push(ct.rows[0].casetypeid);

        const permsCreateOnly = pg.makePermissions({
            cases: { visible: true, actions: ['view', 'create', 'edit'], dataScope: 'all_firm' },
        });
        const roleId = await pg.insertRole(client, null, `createOnly ${tag}`, permsCreateOnly);
        ids.roleIds.push(roleId);
        const userId = await pg.insertUser(client, {
            tenantId: null,
            role: 'Staff',
            name: `CreateOnly ${tag}`,
            firmStaffRoleId: roleId,
        });
        ids.userIds.push(userId);
        await client.query('COMMIT');

        const token = makeToken(userId);
        const res = await request(app)
            .get(`/api/CaseTypes/GetCaseTypeByName?caseTypeName=${encodeURIComponent('PickerType')}`)
            .set('Authorization', `Bearer ${token}`);

        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.some((row) => String(row.CaseTypeName || '').includes('PickerType')));

        const manageRes = await request(app)
            .get('/api/CaseTypes/GetCasesType')
            .set('Authorization', `Bearer ${token}`);
        assert.equal(manageRes.status, 403);

        const addRes = await request(app)
            .post('/api/CaseTypes/AddCaseType')
            .set('Authorization', `Bearer ${token}`)
            .send({ CaseTypeName: 'x', NumberOfStages: 1 });
        assert.equal(addRes.status, 403);
    } finally {
        const cleanup = await pool.connect();
        try {
            await pg.cleanupIds(cleanup, ids);
            if (ids.caseTypeIds.length) {
                await cleanup.query('DELETE FROM casetypes WHERE casetypeid = ANY($1::int[])', [ids.caseTypeIds]);
            }
        } finally {
            cleanup.release();
            client.release();
        }
    }
});

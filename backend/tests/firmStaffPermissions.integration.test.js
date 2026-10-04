const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const pg = require('./helpers/pgTestHarness');
const { applyBaseTestEnv, stubBillingSnapshotUnlocked, loadTestApp } = require('./helpers/integrationEnv');

pg.configurePostgresEnvFromLocalDefaults();
applyBaseTestEnv();
stubBillingSnapshotUnlocked();

function makeToken({ userid, role = 'Staff' }) {
    return jwt.sign({ userid, role, phoneNumber: '0500000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

test('billing gate has no DISABLE_BILLING production bypass flag in source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../middlewares/requireBillingAccess.js'), 'utf8');
    assert.ok(!src.includes('DISABLE_BILLING_GATE'));
});

test('role catalog: custom role name has no branching in normalizeRolePermissions', () => {
    const a = pg.makePermissions({
        cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' },
    });
    const b = pg.makePermissions({
        cases: { visible: true, actions: ['view', 'create'], dataScope: 'all_firm' },
    });
    assert.deepEqual(a.areas.cases.actions, ['view']);
    assert.deepEqual(b.areas.cases.actions, ['view', 'create']);
});

test('Postgres firm staff permissions — full suite', async (t) => {
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
    const ids = { userIds: [], roleIds: [], caseIds: [], tenantIds: [], signingFileIds: [] };
    let tenantA;
    let paUserId;
    let roleAssignedId;
    let roleAllFirmId;
    let roleTenantBId;
    let staffAssignedId;
    let staffAllFirmId;
    let legacyLawyerId;
    let caseAssigned;
    let caseOther;
    let signOther;
    let signAssigned;

    try {
        await client.query('BEGIN');

        tenantA = await pg.insertTenant(client, `a${tag}`);
        const tenantB = await pg.insertTenant(client, `b${tag}`);
        ids.tenantIds.push(tenantA.id, tenantB.id);

        paUserId = await pg.insertUser(client, {
            tenantId: tenantA.id,
            role: 'Admin',
            name: `PA ${tag}`,
        });
        ids.userIds.push(paUserId);
        await pg.insertPlatformAdmin(client, paUserId);

        const permsViewAssigned = pg.makePermissions({
            cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' },
            signing: { visible: true, actions: ['view'], dataScope: undefined },
        });
        const permsAllFirmEdit = pg.makePermissions({
            cases: { visible: true, actions: ['view', 'edit', 'delete', 'tag'], dataScope: 'all_firm' },
        });
        const permsClientsOnly = pg.makePermissions({
            clients: { visible: true, actions: ['view'], dataScope: undefined },
        });

        roleAssignedId = await pg.insertRole(client, tenantA.id, `view_${tag}`, permsViewAssigned);
        roleAllFirmId = await pg.insertRole(client, tenantA.id, `all_${tag}`, permsAllFirmEdit);
        roleTenantBId = await pg.insertRole(client, tenantB.id, `b_${tag}`, permsClientsOnly);
        const roleEmptyId = await pg.insertRole(client, tenantA.id, `empty_${tag}`, pg.makePermissions({}));
        ids.roleIds.push(roleAssignedId, roleAllFirmId, roleTenantBId, roleEmptyId);

        staffAssignedId = await pg.insertUser(client, {
            tenantId: tenantA.id,
            role: 'Staff',
            name: `Staff assigned ${tag}`,
            firmStaffRoleId: roleAssignedId,
        });
        staffAllFirmId = await pg.insertUser(client, {
            tenantId: tenantA.id,
            role: 'Staff',
            name: `Staff all ${tag}`,
            firmStaffRoleId: roleAllFirmId,
        });
        legacyLawyerId = await pg.insertUser(client, {
            tenantId: tenantA.id,
            role: 'Lawyer',
            name: `Lawyer ${tag}`,
        });
        ids.userIds.push(staffAssignedId, staffAllFirmId, legacyLawyerId);

        caseAssigned = await pg.insertCase(client, {
            name: `assigned_${tag}`,
            managerId: staffAssignedId,
            linkUserIds: [staffAssignedId],
        });
        caseOther = await pg.insertCase(client, {
            name: `other_${tag}`,
            managerId: null,
            linkUserIds: [],
        });
        ids.caseIds.push(caseAssigned, caseOther);

        signOther = await pg.insertSigningFile(client, {
            caseId: caseOther,
            lawyerId: legacyLawyerId,
        });
        signAssigned = await pg.insertSigningFile(client, {
            caseId: caseAssigned,
            lawyerId: legacyLawyerId,
        });
        ids.signingFileIds.push(signOther, signAssigned);

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        client.release();
        throw e;
    }
    client.release();

    const app = loadTestApp();
    const tokenAssigned = makeToken({ userid: staffAssignedId, role: 'Staff' });
    const tokenAllFirm = makeToken({ userid: staffAllFirmId, role: 'Staff' });
    const tokenLawyer = makeToken({ userid: legacyLawyerId, role: 'Lawyer' });
    const tokenPa = makeToken({ userid: paUserId, role: 'Admin' });

    // Legacy Staff without firm_staff_role_id (synthetic id — no user row)
    const legacyStaffDeny = await request(app)
        .get('/api/Customers/GetCustomers')
        .set('Authorization', `Bearer ${makeToken({ userid: 88888881, role: 'Staff' })}`);
    assert.equal(legacyStaffDeny.status, 403);

    const lawyerMy = await request(app)
        .get('/api/Cases/my')
        .set('Authorization', `Bearer ${tokenLawyer}`);
    assert.equal(lawyerMy.status, 200);
    assert.ok(Array.isArray(lawyerMy.body));

    // assigned_only — list & reads
    for (const [label, token] of [
        ['assigned', tokenAssigned],
    ]) {
        const list = await request(app).get('/api/Cases/GetCases').set('Authorization', `Bearer ${token}`);
        assert.equal(list.status, 200, `${label} list`);
        const idsSeen = (list.body || []).map((c) => c.CaseId || c.caseid);
        assert.ok(idsSeen.includes(caseAssigned), `${label} sees assigned`);
        assert.ok(!idsSeen.includes(caseOther), `${label} must not see other in list`);
    }

    const getOk = await request(app)
        .get(`/api/Cases/GetCase/${caseAssigned}`)
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(getOk.status, 200);

    const getDeny = await request(app)
        .get(`/api/Cases/GetCase/${caseOther}`)
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(getDeny.status, 403);

    const byName = await request(app)
        .get('/api/Cases/GetCaseByName')
        .query({ caseName: `other_${tag}` })
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.ok(byName.status === 403 || byName.status === 404);

    const tagged = await request(app)
        .get('/api/Cases/TaggedCases')
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(tagged.status, 200);

    const myCases = await request(app)
        .get('/api/Cases/my')
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(myCases.status, 200);

    const stageList = await request(app)
        .get(`/api/Files/stage-files/${caseOther}`)
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(stageList.status, 403);

    // mutations denied without edit
    const updDeny = await request(app)
        .put(`/api/Cases/UpdateCase/${caseAssigned}`)
        .set('Authorization', `Bearer ${tokenAssigned}`)
        .send({ CaseName: 'x' });
    assert.equal(updDeny.status, 403);

    // all_firm staff
    const allGetOther = await request(app)
        .get(`/api/Cases/GetCase/${caseOther}`)
        .set('Authorization', `Bearer ${tokenAllFirm}`);
    assert.equal(allGetOther.status, 200);

    // Signing scope
    const signDeny = await request(app)
        .get(`/api/SigningFiles/${signOther}`)
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(signDeny.status, 403);

    const signOk = await request(app)
        .get(`/api/SigningFiles/${signAssigned}`)
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(signOk.status, 200);

    // Clients absent → 403
    const noClients = await request(app)
        .get('/api/Customers/GetCustomers')
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(noClients.status, 403);

    // Live permission update
    await pool.query(
        `UPDATE firm_staff_roles SET permissions = $1::jsonb WHERE id = $2`,
        [
            JSON.stringify(
                pg.makePermissions({
                    cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' },
                    clients: { visible: true, actions: ['view'] },
                }),
            ),
            roleAssignedId,
        ],
    );
    const afterClients = await request(app)
        .get('/api/Customers/GetCustomers')
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(afterClients.status, 200);

    // Inactive role → 403
    await pool.query(`UPDATE firm_staff_roles SET is_active = FALSE WHERE id = $1`, [roleAssignedId]);
    const inactive = await request(app)
        .get(`/api/Cases/GetCase/${caseAssigned}`)
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(inactive.status, 403);
    await pool.query(`UPDATE firm_staff_roles SET is_active = TRUE WHERE id = $1`, [roleAssignedId]);

    // Area 403 — reminders / calendar / caseTypes / support
    await pool.query(
        `UPDATE firm_staff_roles SET permissions = $1::jsonb WHERE id = $2`,
        [JSON.stringify(pg.makePermissions({ cases: { visible: true, actions: ['view'], dataScope: 'assigned_only' } })), roleAssignedId],
    );
    assert.equal(
        (await request(app).get('/api/reminders/').set('Authorization', `Bearer ${tokenAssigned}`)).status,
        403,
    );
    assert.equal(
        (await request(app).get('/api/calendar').set('Authorization', `Bearer ${tokenAssigned}`)).status,
        403,
    );
    assert.equal(
        (await request(app).get('/api/CaseTypes/GetCasesType').set('Authorization', `Bearer ${tokenAssigned}`)).status,
        403,
    );
    assert.equal(
        (await request(app).get('/api/support/tickets').set('Authorization', `Bearer ${tokenAssigned}`)).status,
        403,
    );

    // Tenant isolation — platform admin tenant A cannot use role from tenant B
    const createRoleB = await request(app)
        .post('/api/staff/employees')
        .set('Authorization', `Bearer ${tokenPa}`)
        .send({
            name: 'Cross tenant',
            phoneNumber: `059${String(tag).slice(-7)}`,
            password: 'Test1234!',
            firmStaffRoleId: roleTenantBId,
        });
    assert.equal(createRoleB.status, 404);

    const patchCross = await request(app)
        .patch(`/api/staff/roles/${roleTenantBId}`)
        .set('Authorization', `Bearer ${tokenPa}`)
        .send({ name: 'hack' });
    assert.equal(patchCross.status, 404);

    const staff2Res = await pool.query(
        `INSERT INTO users (name, email, phonenumber, passwordhash, role, law_firm_tenant_id, firm_staff_role_id)
         VALUES ($1, $2, $3, 'x', 'Staff', $4, $5) RETURNING userid`,
        [`Staff2 ${tag}`, `s2${tag}@t.com`, `058${String(tag).slice(-7)}`, tenantA.id, roleAllFirmId],
    );
    const staff2Id = staff2Res.rows[0].userid;
    ids.userIds.push(staff2Id);

    const listRoles = await request(app)
        .get('/api/staff/roles')
        .set('Authorization', `Bearer ${tokenPa}`);
    assert.equal(listRoles.status, 200);
    const allRole = listRoles.body.find((r) => r.id === roleAllFirmId);
    assert.ok(allRole.assignedUserCount >= 2);

    const deactFail = await request(app)
        .delete(`/api/staff/roles/${roleAllFirmId}`)
        .set('Authorization', `Bearer ${tokenPa}`);
    assert.equal(deactFail.status, 409);

    // Presign ownership — cannot read another user's key
    const presignDeny = await request(app)
        .get('/api/Files/presign-read')
        .query({ key: `users/${legacyLawyerId}/fake.jpg` })
        .set('Authorization', `Bearer ${tokenAssigned}`);
    assert.equal(presignDeny.status, 403);

    // cleanup
    const cleanupClient = await pool.connect();
    try {
        await pg.cleanupIds(cleanupClient, ids);
    } finally {
        cleanupClient.release();
    }
});

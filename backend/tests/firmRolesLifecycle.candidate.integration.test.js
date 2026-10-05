// Candidate-only behavior assertions. No real tenant records or transports.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const pg = require('./helpers/pgTestHarness');
const { applyBaseTestEnv, stubBillingSnapshotUnlocked, loadTestApp } = require('./helpers/integrationEnv');
pg.configurePostgresEnvFromLocalDefaults();
applyBaseTestEnv();
stubBillingSnapshotUnlocked();

test('custom roles API lifecycle, current and legacy grants, stale tokens and tenant boundaries', async t => {
  assert.equal(process.env.DB_HOST, '127.0.0.1');
  assert.equal(process.env.DB_PORT, process.env.CANDIDATE_DB_PORT);
  assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
  const pool = await pg.assertPostgresReady(); // Required, never silently skipped.
  await pg.ensureFirmStaffRolesMigration();
  const client = await pool.connect();
  const ids = { userIds: [], roleIds: [], tenantIds: [], caseIds: [], signingFileIds: [] };
  const tag = Date.now();
  const app = loadTestApp();
  const token = (id, role) => jwt.sign({ userid:id, role, phoneNumber:'0500000000' }, process.env.JWT_SECRET, { expiresIn:'1h' });
  const http = (method, path, tok, body) => {
    const req = request(app)[method](path).set('Authorization', `Bearer ${tok}`);
    return body === undefined ? req : req.send(body);
  };
  const expected = async (promise, status) => {
    const res = await promise;
    assert.equal(res.status, status, JSON.stringify(res.body));
    return res.body;
  };
  let role, paToken, staffToken, tenantA, tenantB, staff, ownCase, otherCase, foreignCase, nullCase;
  let ownFile, otherFile, foreignFile, foreignRole, ordinaryAdminToken, foreignToken;
  const view = scope => ({ version:3, areas:{
    cases:{ visible:true, actions:['view'], dataScope:scope },
    signing:{ visible:true, actions:['view'], dataScope:scope },
  } });
  try {
    tenantA = await pg.insertTenant(client, `lifeA${tag}`);
    tenantB = await pg.insertTenant(client, `lifeB${tag}`);
    ids.tenantIds.push(tenantA.id, tenantB.id);
    const makeUser = async (tenantId, role, name) => {
      const id = await pg.insertUser(client,{tenantId,role,name:`${name} ${tag}`});
      ids.userIds.push(id); return id;
    };
    const pa = await makeUser(tenantA.id,'Admin','PA');
    await pg.insertPlatformAdmin(client,pa);
    staff = await makeUser(tenantA.id,'Staff','Staff');
    const author = await makeUser(tenantA.id,'Lawyer','Author');
    const foreign = await makeUser(tenantB.id,'Staff','Foreign');
    const foreignAuthor = await makeUser(tenantB.id,'Lawyer','Foreign author');
    const ordinaryAdmin = await makeUser(tenantA.id,'Admin','Ordinary admin');
    paToken=token(pa,'Admin'); staffToken=token(staff,'Staff');
    foreignToken=token(foreign,'Staff'); ordinaryAdminToken=token(ordinaryAdmin,'Admin');
    foreignRole=await pg.insertRole(client,tenantB.id,`foreign_${tag}`,view('all_firm'));
    ids.roleIds.push(foreignRole);
    await client.query('UPDATE users SET firm_staff_role_id=$1 WHERE userid=$2',[foreignRole,foreign]);
    const makeCase = async (tenantId,name,assigned) => {
      const id=await pg.insertCase(client,{name:`${name}_${tag}`,managerId:assigned?staff:null,linkUserIds:assigned?[staff]:[]});
      ids.caseIds.push(id);
      await client.query('UPDATE cases SET law_firm_tenant_id=$1 WHERE caseid=$2',[tenantId,id]);
      return id;
    };
    ownCase=await makeCase(tenantA.id,'own',true);
    otherCase=await makeCase(tenantA.id,'other',false);
    foreignCase=await makeCase(tenantB.id,'foreign',false);
    nullCase=await makeCase(null,'unmapped',false);
    ownFile=await pg.insertSigningFile(client,{caseId:ownCase,lawyerId:staff});
    otherFile=await pg.insertSigningFile(client,{caseId:ownCase,lawyerId:author});
    foreignFile=await pg.insertSigningFile(client,{caseId:foreignCase,lawyerId:foreignAuthor});
    ids.signingFileIds.push(ownFile,otherFile,foreignFile);

    await t.test('only platform administrator creates a named role; unknown actions are removed',async()=>{
      await expected(http('post','/api/staff/roles',staffToken,{name:'forbidden',permissions:view('all_firm')}),403);
      await expected(http('post','/api/staff/roles',ordinaryAdminToken,{name:'forbidden',permissions:view('all_firm')}),403);
      const permissions=view('assigned_only'); permissions.areas.cases.actions.push('root');
      const created=await expected(http('post','/api/staff/roles',paToken,{name:`מזכירה ${tag}`,permissions}),201);
      role=created.id; ids.roleIds.push(role);
      assert.equal(created.name,`מזכירה ${tag}`);
      assert.deepEqual(created.permissions.areas.cases.actions,['view']);
      assert.equal(created.permissions.areas.clients.visible,false);
      await expected(http('post','/api/staff/roles',paToken,{name:'  ',permissions}),400);
      await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:role}),200);
    });
    assert.ok(role,'Role creation must succeed before subsequent checks');

    await t.test('direct APIs obey view/action/author limits and current DB identity',async()=>{
      await expected(http('get',`/api/Cases/GetCase/${ownCase}`,staffToken),200);
      await expected(http('get',`/api/Cases/GetCase/${otherCase}`,staffToken),403);
      await expected(http('put',`/api/Cases/UpdateCase/${ownCase}`,staffToken,{CaseName:'must not update'}),403);
      const row=await client.query('SELECT casename FROM cases WHERE caseid=$1',[ownCase]);
      assert.equal(row.rows[0].casename,`own_${tag}`);
      await expected(http('get',`/api/SigningFiles/${ownFile}`,staffToken),200);
      await expected(http('get',`/api/SigningFiles/${otherFile}`,staffToken),403);
      await expected(http('get','/api/Customers/GetCustomers',staffToken),403);
      await expected(http('get','/api/staff/roles',token(staff,'Admin')),403);
    });
    await t.test('all-firm is bounded to the same tenant; foreign and unmapped cases fail closed',async()=>{
      await expected(http('patch',`/api/staff/roles/${role}`,paToken,{permissions:view('all_firm')}),200);
      await expected(http('get',`/api/Cases/GetCase/${otherCase}`,staffToken),200);
      for(const id of [foreignCase,nullCase]) await expected(http('get',`/api/Cases/GetCase/${id}`,staffToken),403);
      await expected(http('get',`/api/SigningFiles/${otherFile}`,staffToken),200);
      await expected(http('get',`/api/SigningFiles/${foreignFile}`,staffToken),403);
      await expected(http('get',`/api/Cases/GetCase/${ownCase}`,foreignToken),403);
      await expected(http('patch',`/api/staff/roles/${foreignRole}`,paToken,{name:'forbidden'}),404);
      await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:foreignRole}),404);
    });
    await t.test('resolved shared-tenant slug must match authenticated DB identity',async()=>{
      const prior=process.env.MULTI_TENANT_MODE;
      process.env.MULTI_TENANT_MODE='true';
      try {
        await expected(http('get',`/api/Cases/GetCase/${ownCase}`,staffToken).set('x-tenant-slug',tenantA.slug),200);
        await expected(http('get',`/api/Cases/GetCase/${ownCase}`,staffToken).set('x-tenant-slug',tenantB.slug),403);
        await expected(http('get',`/api/SigningFiles/${ownFile}`,staffToken).set('x-tenant-slug',tenantB.slug),403);
        await expected(http('patch',`/api/staff/roles/${role}`,paToken,{name:'forbidden'}).set('x-tenant-slug',tenantB.slug),403);
        await expected(http('get','/api/staff/session-scope',staffToken).set('x-tenant-slug',`missing-${tag}`),404);
        await client.query('UPDATE law_firm_tenants SET is_active=FALSE WHERE id=$1',[tenantA.id]);
        await expected(http('get','/api/staff/session-scope',staffToken).set('x-tenant-slug',tenantA.slug),403);
      } finally {
        await client.query('UPDATE law_firm_tenants SET is_active=TRUE WHERE id=$1',[tenantA.id]);
        if(prior===undefined) delete process.env.MULTI_TENANT_MODE; else process.env.MULTI_TENANT_MODE=prior;
      }
    });
    await t.test('same existing token immediately loses revoked pages and direct API access',async()=>{
      await expected(http('patch',`/api/staff/roles/${role}`,paToken,{permissions:{version:3,areas:{}}}),200);
      await expected(http('get',`/api/Cases/GetCase/${ownCase}`,staffToken),403);
      await expected(http('get',`/api/SigningFiles/${ownFile}`,staffToken),403);
      const scope=await expected(http('get','/api/staff/session-scope',staffToken),200);
      assert.equal(scope.permissionMode,'role');
      assert.ok(!scope.pages.includes('allCases')&&!scope.pages.includes('signingFiles'));
    });
    await t.test('persisted v1 signing case grants work until explicit permission edit',async()=>{
      const legacy=await pg.insertRole(client,tenantA.id,`legacy_${tag}`,{version:1,areas:{
        cases:{visible:true,actions:['view'],dataScope:'assigned_only'},
        signing:{visible:true,actions:['view']},
      }}); ids.roleIds.push(legacy);
      await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:legacy}),200);
      await expected(http('get',`/api/SigningFiles/${otherFile}`,staffToken),200);
      await expected(http('get',`/api/SigningFiles/${foreignFile}`,staffToken),403);
      await expected(http('patch',`/api/staff/roles/${legacy}`,paToken,{permissions:view('assigned_only')}),200);
      await expected(http('get',`/api/SigningFiles/${otherFile}`,staffToken),403);
      await expected(http('get',`/api/SigningFiles/${ownFile}`,staffToken),200);
    });
    await t.test('mismatched persisted tenant assignment cannot fall back to legacy access',async()=>{
      await client.query('UPDATE users SET firm_staff_role_id=$1 WHERE userid=$2',[foreignRole,staff]);
      await expected(http('get','/api/staff/session-scope',staffToken),403);
      await expected(http('get',`/api/Cases/GetCase/${ownCase}`,staffToken),403);
      await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:role}),200);
    });
    await t.test('repeated assignment is stable; assigned roles cannot be deactivated',async()=>{
      for(let n=0;n<2;n++) await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:role}),200);
      const roles=await expected(http('get','/api/staff/roles',paToken),200);
      assert.equal(roles.find(r=>r.id===role).assignedUserCount,1);
      await expected(http('delete',`/api/staff/roles/${role}`,paToken),409);
      const stillActive=await client.query('SELECT is_active FROM firm_staff_roles WHERE id=$1',[role]);
      assert.equal(stillActive.rows[0].is_active,true);
      await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:null}),200);
      await expected(http('delete',`/api/staff/roles/${role}`,paToken),200);
      await expected(http('delete',`/api/staff/roles/${role}`,paToken),404);
      await expected(http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:role}),409);
      await expected(http('get','/api/Customers/GetCustomers',staffToken),403);
    });
    await t.test('concurrent assignment versus deactivation cannot leave an inactive assigned role',async()=>{
      const race=await expected(http('post','/api/staff/roles',paToken,{name:`race_${tag}`,permissions:view('assigned_only')}),201);
      ids.roleIds.push(race.id);
      const [assignment,deactivation]=await Promise.all([
        http('patch',`/api/staff/users/${staff}/firm-staff-role`,paToken,{firmStaffRoleId:race.id}),
        http('delete',`/api/staff/roles/${race.id}`,paToken),
      ]);
      assert.ok((assignment.status===200&&deactivation.status===409)||(assignment.status===409&&deactivation.status===200),
        JSON.stringify({assignment:assignment.status,deactivation:deactivation.status}));
      const state=await client.query('SELECT u.firm_staff_role_id,r.is_active FROM users u LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id WHERE u.userid=$1',[staff]);
      assert.ok(!state.rows[0].firm_staff_role_id||state.rows[0].is_active);
    });
  } finally {
    try { await pg.cleanupIds(client,ids); } finally { client.release(); }
  }
});

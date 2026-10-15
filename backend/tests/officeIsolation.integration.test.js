'use strict';
// Run only against a disposable local clone, with a NONSUPERUSER NOBYPASSRLS app role.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const configPath = process.env.OFFICE_ISOLATION_QA_CONFIG;
test('shared office database + HTTP isolation', { skip: !configPath }, async t => {
    const config = JSON.parse(fs.readFileSync(configPath));
    assert.ok(['127.0.0.1','localhost'].includes(config.host));
    assert.equal(String(config.port), '55440');
    assert.equal(config.database, 'legal_office_isolation_20261012_qa');
    const adminEnv = JSON.parse(fs.readFileSync(process.env.OFFICE_ISOLATION_QA_ADMIN_CONFIG));
    assert.equal(adminEnv.DB_HOST, config.host);
    assert.equal(String(adminEnv.DB_PORT), String(config.port));
    const { Client, Pool } = require('pg');
    const admin = new Client({ ...config, user: adminEnv.DB_USER, password: adminEnv.DB_PASSWORD });
    await admin.connect();
    let pool;
    t.after(async () => { if (pool) await pool.end(); await admin.end(); });
    Object.assign(process.env, { MULTI_TENANT_MODE:'true', TENANT_DB_ISOLATION_ENABLED:'1', NODE_ENV:'test',
        DB_HOST:config.host, DB_PORT:String(config.port), DB_NAME:config.database, DB_USER:config.user,
        DB_PASSWORD:config.password, DB_SSL:'false', DB_DISABLE_CONNECT_TEST:'true', DB_POOL_MAX:'2',
        JWT_SECRET:crypto.randomBytes(32).toString('hex'), JWT_PUBLIC_SIGN_SECRET:crypto.randomBytes(32).toString('hex'),
        BACKGROUND_JOBS_ENABLED:'false', NOTIFICATIONS_NOOP:'true', BILLING_ENABLED:'false' });
    const hasStaff=fs.existsSync(path.join(__dirname,'../routes/staffRoutes.js'));
    if(hasStaff) await admin.query(fs.readFileSync(path.join(__dirname,'../migrations/2026-10-03_00_firm_staff_roles.sql'),'utf8'));
    await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO legal_office_isolation_qa');
    // The source sandbox contains abandoned signup fixtures without owners. Make their ownership explicit
    // in this disposable clone only; the installer must never infer an owner for those rows in production.
    await admin.query(`INSERT INTO users(name,role,law_firm_tenant_id)
        SELECT 'Synthetic fixture owner','Admin',t.id FROM law_firm_tenants t
        WHERE NOT EXISTS(SELECT 1 FROM users u WHERE u.law_firm_tenant_id=t.id AND u.role='Admin')`);
    const A = crypto.randomUUID(), B = crypto.randomUUID();
    const slugA = 'qa-' + A.slice(0,8), slugB = 'qa-' + B.slice(0,8);
    await admin.query(`INSERT INTO law_firm_tenants(id,slug,name) VALUES($1,$2,'Synthetic office A'),($3,$4,'Synthetic office B')`,[A,slugA,B,slugB]);
    const owners = (await admin.query(`INSERT INTO users(name,role,law_firm_tenant_id) VALUES('Owner A','Admin',$1),('Owner B','Admin',$2) RETURNING userid`,[A,B])).rows.map(r=>r.userid);
    // Include the erroneous historical grant in the regression fixture.
    await admin.query(`INSERT INTO platform_admins(user_id,is_active) VALUES($1,true),($2,true)`,owners);
    const customers = (await admin.query(`INSERT INTO users(name,role,email,law_firm_tenant_id) VALUES('Customer A','User','same@synthetic.invalid',$1),('Customer B','User','same@synthetic.invalid',$2) RETURNING userid`,[A,B])).rows.map(r=>r.userid);
    await admin.query(`INSERT INTO firm_billing(law_firm_tenant_id,status,billing_enabled) VALUES($1,'active',false),($2,'active',false)`,[A,B]);
    const legacy = (await admin.query(`INSERT INTO users(name,role) VALUES('Synthetic legacy customer','User') RETURNING userid`)).rows[0].userid;
    const preflight = await admin.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass`);
    if (!preflight.rows[0].relrowsecurity) {
        const before = new Pool(config);
        const rows = (await before.query('SELECT userid FROM users')).rows.map(r=>r.userid);
        assert.ok(rows.includes(customers[0]) && rows.includes(customers[1]));
        console.log('BASELINE REPRODUCED: an unscoped application query returned both offices');
        await before.end();
    }
    await require('../scripts/install-office-isolation').install(admin);
    pool = require('../config/db');
    const scope = require('../lib/tenant/databaseScope');
    const tenant = require('../lib/tenant/tenantContext');
    const inA = fn => tenant.runWithTenant({id:A,slug:slugA,isActive:true},fn);
    const inB = fn => tenant.runWithTenant({id:B,slug:slugB,isActive:true},fn);
    await pool.ensureOfficeIsolation();

    await t.test('misconfigured shared mode fails closed for every accepted boolean spelling',async()=>{
        for(const value of ['true','TRUE',' true ']){
            process.env.MULTI_TENANT_MODE=value;delete process.env.TENANT_DB_ISOLATION_ENABLED;
            assert.throws(()=>pool.query('SELECT * FROM users'),/OFFICE_ISOLATION_CONFIGURATION_REQUIRED/);
            assert.throws(()=>pool.connect(),/OFFICE_ISOLATION_CONFIGURATION_REQUIRED/);
            process.env.TENANT_DB_ISOLATION_ENABLED='1';assert.equal(scope.enabled(),true);
        }
        process.env.MULTI_TENANT_MODE='true';
        const previous=process.env.CENTRAL_SERVICE_KEY;delete process.env.CENTRAL_SERVICE_KEY;
        const body=Buffer.from(JSON.stringify({v:1,productId:'layerwebsites',jti:crypto.randomUUID(),exp:Date.now()+60000})).toString('base64url');
        const sig=crypto.createHmac('sha256','dev-central-service-key-change-me').update(body).digest('base64url');
        assert.equal(require('../utils/centralHandoff').verifyAndConsumeCentralHandoff(body+'.'+sig,'layerwebsites'),null);
        if(previous)process.env.CENTRAL_SERVICE_KEY=previous;
    });

    await t.test('unscoped access denied; office and legacy reads remain usable', async () => {
        assert.equal((await pool.query('SELECT * FROM users')).rowCount,0);
        const idsA = (await inA(()=>pool.query('SELECT userid FROM users'))).rows.map(r=>r.userid);
        assert.ok(idsA.includes(customers[0])); assert.ok(!idsA.includes(customers[1])); assert.ok(!idsA.includes(legacy));
        const idsLegacy=(await scope.withLegacyOffice(()=>pool.query('SELECT userid FROM users'))).rows.map(r=>r.userid);
        assert.ok(idsLegacy.includes(legacy)); assert.ok(!idsLegacy.includes(customers[0]));
        assert.equal((await inA(()=>pool.query('SELECT * FROM platform_admins'))).rowCount,0);
    });
    let caseA,caseB;
    await t.test('inserts inherit office; foreign updates/deletes and links are denied', async () => {
        caseA=(await inA(()=>pool.query(`INSERT INTO cases(casename,userid) VALUES('Synthetic case A',$1) RETURNING caseid,law_firm_tenant_id`,[customers[0]]))).rows[0];
        caseB=(await inB(()=>pool.query(`INSERT INTO cases(casename,userid) VALUES('Synthetic case B',$1) RETURNING caseid,law_firm_tenant_id`,[customers[1]]))).rows[0];
        assert.equal(caseA.law_firm_tenant_id,A);
        assert.equal((await inA(()=>pool.query('UPDATE users SET name=$1 WHERE userid=$2',['tampered',customers[1]]))).rowCount,0);
        assert.equal((await inA(()=>pool.query('DELETE FROM cases WHERE caseid=$1',[caseB.caseid]))).rowCount,0);
        await assert.rejects(inA(()=>pool.query(`INSERT INTO users(name,role,law_firm_tenant_id) VALUES('wrong','User',$1)`,[B])),{code:'42501'});
        await assert.rejects(inA(()=>pool.query('UPDATE cases SET law_firm_tenant_id=$1 WHERE caseid=$2',[B,caseA.caseid])),{code:'42501'});
        await assert.rejects(inA(()=>pool.query(`INSERT INTO cases(casename,userid) VALUES('foreign link',$1)`,[customers[1]])),{code:'42501'});
        await assert.rejects(inA(()=>pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)',[caseB.caseid,customers[0]])),{code:'42501'});
        await assert.rejects(inA(()=>pool.query(`INSERT INTO stage_files(caseid,stage,file_key,file_name,uploaded_by) VALUES($1,1,'synthetic','test.pdf',$2)`,[caseB.caseid,owners[0]])),{code:'42501'});
        assert.equal((await inB(()=>pool.query('SELECT name FROM users WHERE userid=$1',[customers[1]]))).rows[0].name,'Customer B');
    });
    await t.test('pooled concurrent queries and abandoned transaction never carry another scope', async () => {
        const answers=await Promise.all(Array.from({length:30},(_,i)=>(i%2?inA:inB)(async()=>{
            const wanted=i%2?A:B;
            const rows=(await pool.query('SELECT DISTINCT law_firm_tenant_id AS id FROM users')).rows;
            assert.deepEqual(rows.map(r=>r.id),[wanted]);
        })));
        assert.equal(answers.length,30);
        await inA(async()=>{const c=await pool.connect();await c.query('BEGIN');await c.query(`INSERT INTO users(name,role) VALUES('rolled back','User')`);c.release();});
        assert.equal((await inB(()=>pool.query(`SELECT * FROM users WHERE name='rolled back'`))).rowCount,0);
        assert.equal((await inA(()=>pool.query(`SELECT * FROM users WHERE name='rolled back'`))).rowCount,0);
        assert.equal((await pool.query('SELECT * FROM users')).rowCount,0);
    });
    await t.test('settings/dashboard/type caches keep offices separate', async () => {
        const settings=require('../services/settingsService');
        await inA(()=>settings.upsertSetting('firm','QA_SCOPE_NAME','office A'));
        await inB(()=>settings.upsertSetting('firm','QA_SCOPE_NAME','office B'));
        assert.equal(await inA(()=>settings.getSetting('firm','QA_SCOPE_NAME')),'office A');
        assert.equal(await inB(()=>settings.getSetting('firm','QA_SCOPE_NAME')),'office B');
        const main=require('../utils/mainScreenDataCache');
        assert.equal(await inA(()=>main.getMainScreenDataCached({loader:async()=>A})),A);
        assert.equal(await inB(()=>main.getMainScreenDataCached({loader:async()=>B})),B);
        const types=require('../utils/caseTypesCache');
        assert.equal(await inA(()=>types.getCaseTypeByIdCached({caseTypeId:9,loader:async()=>A})),A);
        assert.equal(await inB(()=>types.getCaseTypeByIdCached({caseTypeId:9,loader:async()=>B})),B);
        assert.equal(await settings.isPlatformAdmin(owners[0]),false);
    });
    await t.test('duplicate OTP destination in two offices remains independent', async () => {
        await inA(()=>pool.query(`INSERT INTO otps(email,otp,expiry,userid) VALUES('same@synthetic.invalid','aaa',now()+interval '5 minutes',$1)`,[customers[0]]));
        await inB(()=>pool.query(`INSERT INTO otps(email,otp,expiry,userid) VALUES('same@synthetic.invalid','bbb',now()+interval '5 minutes',$1)`,[customers[1]]));
        await inA(()=>pool.query(`DELETE FROM otps WHERE email='same@synthetic.invalid'`));
        assert.equal((await inB(()=>pool.query(`SELECT otp FROM otps WHERE email='same@synthetic.invalid'`))).rows[0].otp,'bbb');
    });
    await t.test('HTTP headerless identities, office mismatch, global admin denial, own staff access', async () => {
        const express=require('express'), request=require('supertest'), jwt=require('jsonwebtoken');
        const app=express();app.use(express.json());app.use((_q,_s,next)=>scope.withoutScope(next));
        app.use(require('../middlewares/resolveTenant'));
        app.use('/api/Customers',require('../routes/customerRoutes'));
        if(hasStaff) app.use('/api/staff',require('../routes/staffRoutes'));
        app.use('/api/billing',require('../routes/billingRoutes'));
        app.get('/api/test-global',require('../middlewares/authMiddleware'),require('../middlewares/requirePlatformAdmin'),(_req,res)=>res.json({global:true}));
        app.use(require('../middlewares/errorHandler'));
        const token=jwt.sign({userid:owners[0],role:'Admin'},process.env.JWT_SECRET,{expiresIn:'5m'});
        const get=url=>request(app).get(url).set('Authorization','Bearer '+token);
        let response=await get('/api/Customers/GetCustomers');
        assert.equal(response.status,200,JSON.stringify(response.body));
        assert.deepEqual(response.body.map(r=>r.UserId),[customers[0]]);
        assert.equal((await get('/api/Customers/GetCustomers').set('x-tenant-slug',slugB)).status,403);
        assert.equal((await get('/api/Customers/GetCustomers?tenantSlug='+slugB).set('x-tenant-slug',slugA)).status,400);
        assert.equal((await get('/api/test-global')).status,403);
        if(hasStaff) assert.equal((await get('/api/staff/roles')).status,200);
        if(hasStaff){const session=await get('/api/staff/session-scope');assert.equal(session.status,200);assert.equal(session.body.isPlatformAdmin,false);assert.equal(session.body.isOfficeOwner,true);}
        const lock=await get('/api/billing/lock-status');assert.equal(lock.status,200);assert.equal(lock.body.canManageBilling,true);
        const plan=await get('/api/billing/plan');assert.equal(plan.status,200,JSON.stringify(plan.body));
        const clientToken=jwt.sign({userid:customers[0],role:'User'},process.env.JWT_SECRET,{expiresIn:'5m'});
        assert.equal((await request(app).get('/api/billing/plan').set('Authorization','Bearer '+clientToken)).status,403);
        const clientLock=await request(app).get('/api/billing/lock-status').set('Authorization','Bearer '+clientToken);
        assert.deepEqual(clientLock.body,{locked:false,canManageBilling:false});
    });
    await t.test('support proxy derives namespace from authenticated office and ignores supplied office',async()=>{
        const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken');
        process.env.CENTRAL_SERVICE_KEY=crypto.randomBytes(32).toString('hex');
        const previous=global.fetch, seen=[];
        global.fetch=async(url,options)=>{
            seen.push({url,headers:options.headers,body:options.body?JSON.parse(options.body):null});
            return {status:200,text:async()=>JSON.stringify({ok:true})};
        };
        try {
            const app=express();app.use(express.json());app.use((_q,_s,next)=>scope.withoutScope(next));
            app.use('/api/support',require('../routes/supportRoutes'));app.use(require('../middlewares/errorHandler'));
            for(let i=0;i<2;i++){
                const token=jwt.sign({userid:owners[i],role:'Admin'},process.env.JWT_SECRET,{expiresIn:'5m'});
                const r=await request(app).post('/api/support/tickets').set('Authorization','Bearer '+token)
                    .send({title:'Synthetic',description:'test',tenantSlug:'foreign',projectId:'foreign'});
                assert.equal(r.status,200,JSON.stringify(r.body));
                assert.equal(seen[i].headers['X-Central-Tenant-Slug'],i?slugB:slugA);
                assert.equal(seen[i].body.tenantSlug,i?slugB:slugA);
            }
        } finally {global.fetch=previous;}
    });
    await t.test('public capabilities recover their office without a tenant header', async () => {
        const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken');
        const publicScope=require('../middlewares/publicOfficeScope');
        const file=(await inA(()=>pool.query(`INSERT INTO signingfiles(lawyerid,clientid,filename,filekey,status) VALUES($1,$2,'synthetic.pdf','synthetic/qa','pending') RETURNING signingfileid`,[owners[0],customers[0]]))).rows[0];
        const inviteToken=crypto.randomBytes(24).toString('hex'), feedToken=crypto.randomBytes(24).toString('hex');
        await inA(()=>pool.query(`INSERT INTO calendar_events(owner_id,title,start_time,end_time,invite_token) VALUES($1,'Synthetic invitation',now(),now()+interval '1 hour',$2)`,[owners[0],inviteToken]));
        await inA(()=>pool.query('INSERT INTO user_calendar_tokens(user_id,ical_feed_token) VALUES($1,$2)',[owners[0],feedToken]));
        const app=express();app.use(express.json());app.use((_q,_s,next)=>scope.withoutScope(next));app.use(require('../middlewares/resolveTenant'));
        const result=async(_req,res)=>res.json((await pool.query('SELECT userid FROM users ORDER BY userid')).rows.map(r=>r.userid));
        app.get('/sign/:token',publicScope.signing('signing_public'),result);
        app.get('/invite/:token',publicScope.invite,result);
        app.get('/feed/:token',publicScope.calendarFeed,result);
        app.get('/callback',publicScope.calendarOAuth,result);
        app.use(require('../middlewares/errorHandler'));
        const token=jwt.sign({typ:'signing_public',signingFileId:file.signingfileid,signerUserId:customers[0]},process.env.JWT_SECRET,{expiresIn:'5m'});
        const wanted=[owners[0],customers[0]].sort((a,b)=>a-b);
        for(const url of ['/sign/'+token,'/invite/'+inviteToken,'/feed/'+feedToken+'.ics','/callback?state='+encodeURIComponent(require('../lib/calendarOAuthState').signOAuthState({userId:owners[0]}))]){
            const r=await request(app).get(url);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body,wanted);
            assert.equal((await request(app).get(url).set('x-tenant-slug',slugB)).status,404);
        }
        const wrongType=jwt.sign({typ:'access',signingFileId:file.signingfileid},process.env.JWT_SECRET);
        assert.equal((await request(app).get('/sign/'+wrongType)).status,404);
        assert.equal((await request(app).get('/invite/unknown')).status,404);
    });
    await t.test('refresh token login stays in its owning office; absent tenant OTP verification rejected', async()=>{
        const request=require('supertest'),express=require('express'),jwt=require('jsonwebtoken');
        const raw=crypto.randomBytes(48).toString('base64url');
        const hash=crypto.createHash('sha256').update(raw).update(String(process.env.REFRESH_TOKEN_PEPPER||'')).digest('hex');
        await inA(()=>pool.query(`INSERT INTO refresh_tokens(userid,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')`,[owners[0],hash]));
        const app=express();app.use(express.json());app.use((_q,_s,next)=>scope.withoutScope(next));app.use('/api/Auth',require('../routes/auth'));app.use(require('../middlewares/errorHandler'));
        assert.equal((await request(app).post('/api/Auth/Refresh').set('x-tenant-slug',slugB).send({refreshToken:raw})).status,404);
        const response=await request(app).post('/api/Auth/Refresh').send({refreshToken:raw});
        assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.isPlatformAdmin,false);
        assert.equal(jwt.verify(response.body.token,process.env.JWT_SECRET).userid,owners[0]);
        assert.equal((await request(app).post('/api/Auth/VerifyOtp').send({email:'same@synthetic.invalid',otp:'bbb'})).status,400);
        assert.equal((await request(app).post('/api/Auth/Logout').send({refreshToken:response.body.refreshToken})).status,200);
    });
    await t.test('background office runner has distinct data and no global business scope',async()=>{
        const visited=new Map();
        await require('../lib/tenant/officeJobs').forEachOffice(async()=>{
            const selected=scope.current();assert.notEqual(selected.mode,'system');
            visited.set(selected.tenantId,(await pool.query('SELECT userid FROM users')).rows.map(r=>r.userid));
        });
        assert.ok(visited.get(A).includes(customers[0]));assert.ok(!visited.get(A).includes(customers[1]));
        assert.ok(visited.get(B).includes(customers[1]));assert.ok(visited.get('').includes(legacy));
    });
});

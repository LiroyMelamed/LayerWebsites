const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const stage=require('../services/signingV2/caseStageAutomation');
const creation=require('../services/signingV2/creation');
const {databaseFixture}=require('./helpers/signingV2Fixture');
const {transaction}=require('../services/signingV2/transaction');
const {digest}=require('../lib/signingV2/canonical');

// Dedicated, socket-only synthetic PostgreSQL. No app dotenv or provider code.
async function fixture(t) {
 assert.equal(process.env.STAGE_TEST_SOCKET,'/tmp/codex-stage-automation-55494');
 const schema='stage_'+randomUUID().replaceAll('-','');
 const pool=new Pool({host:process.env.STAGE_TEST_SOCKET,port:55494,database:'postgres',user:'stage_automation_test_owner',options:`-c search_path=${schema},public`,max:8});
 t.after(async()=>{await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();});
 await pool.query(`CREATE SCHEMA ${schema}`);
 await pool.query(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY);CREATE TABLE users(userid serial PRIMARY KEY,name text,email text,phonenumber text,role text,passwordhash text,law_firm_tenant_id uuid,firm_staff_role_id uuid);
 CREATE TABLE platform_admins(user_id integer,is_active boolean);CREATE TABLE firm_staff_roles(id uuid PRIMARY KEY,law_firm_tenant_id uuid,permissions jsonb,is_active boolean DEFAULT true);
 CREATE TABLE cases(caseid serial PRIMARY KEY,casename text,currentstage integer,isclosed boolean DEFAULT false,userid integer,casemanagerid integer,law_firm_tenant_id uuid);
 CREATE TABLE casedescriptions(descriptionid serial PRIMARY KEY,caseid integer,stage integer,text text);
 CREATE TABLE case_users(caseid integer,userid integer);CREATE TABLE signingfiles(signingfileid serial PRIMARY KEY);
 CREATE TABLE signing_templates(id uuid PRIMARY KEY,law_firm_tenant_id uuid,owner_userid integer,name text,version integer DEFAULT 1,definition jsonb,archived boolean DEFAULT false);`);
 for(const filename of ['2026-10-07_00_signing_workflow_v2.sql','2026-10-07_01_signing_v2_reference_integrity.sql','2026-10-07_02_signing_v2_preflight.sql','2026-10-07_03_signing_v2_public_signing.sql','2026-10-08_00_signing_creation_drafts.sql','2026-10-08_01_signing_error_alerts.sql','2026-10-08_03_signing_template_lifecycle.sql','2026-10-08_04_signing_client_context.sql','2026-10-08_10_signing_approval_requests.sql','2026-10-08_11_signing_package_replacement.sql','2026-10-24_00_case_stage_documents.sql']) {
  await pool.query(fs.readFileSync(path.join(__dirname,'../migrations',filename),'utf8'));
 }
 const f=await databaseFixture(pool,{documentCount:2});
 const caseId=(await pool.query("INSERT INTO cases(casename,currentstage,userid) VALUES('Synthetic rental',1,$1) RETURNING caseid",[f.scope.userId])).rows[0].caseid;
 const stages=(await pool.query("INSERT INTO casedescriptions(caseid,stage,text) VALUES($1,1,'Open'),($1,2,'Sign rental'),($1,3,'Delivery') RETURNING *",[caseId])).rows;
 const contact=(await pool.query("INSERT INTO users(name,email,phonenumber,role) VALUES('Synthetic client','client@example.invalid','0501234567','User') RETURNING *")).rows[0];
 const body={expectedVersion:0,enabled:true,name:'Synthetic rental auto',templateVersionId:f.versionId,rows:[{key:'rental',data:{employeeId:'001234567'},recipients:{employee:{name:contact.name,email:contact.email,phone:contact.phonenumber,contactUserId:contact.userid,channel:'email'}}}],shared:{}};
 const scope={...f.scope,send:true,clientView:true};
 async function move(num,{closed=false,rollback=false}={}) {return transaction(pool,async db=>{
   await db.query('SELECT caseid FROM cases WHERE caseid=$1 FOR UPDATE',[caseId]);
   const old=(await db.query('SELECT currentstage,isclosed FROM cases WHERE caseid=$1',[caseId])).rows[0];
   const oldDescriptionId=await stage.stageIdentity(db,caseId,old.currentstage);
   await db.query('UPDATE cases SET currentstage=$2,isclosed=$3 WHERE caseid=$1',[caseId,num,closed]);
   const result=await stage.recordTransition(db,{caseId,oldDescriptionId,oldClosed:old.isclosed,newClosed:closed,actorId:scope.userId});
   if(rollback)throw Error('synthetic rollback');return result;
 });}
 const workOne=options=>stage.processOne(pool,{reserveCapacity:async()=>{},...options});
 return{pool,schema,f,scope,caseId,stages,body,contact,move,process:workOne};
}
process.env.SIGNING_V2_ENABLED='true';
process.env.SIGNING_ENABLED='true';

test('stage auto-send: atomic transition and existing immutable multi-PDF package queue, once across concurrency/reentry/config revision',async t=>{
 const f=await fixture(t),target=f.stages[1].descriptionid;
 const preview=await stage.preview(f.pool,f.scope,f.caseId,target,f.body);assert.equal(preview.valid,true);
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,0);
 const saved=await stage.save(f.pool,f.scope,f.caseId,target,{...f.body,previewHash:preview.previewHash});assert.equal(saved.rule.version,1);assert.equal(saved.rule.template.versionId,f.f.versionId);
 await assert.rejects(f.move(2,{rollback:true}),/synthetic rollback/);assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,0);
 await Promise.all([f.move(2),f.move(2)]);
 assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,1);
 const worked=await Promise.all([f.process(),f.process()]);assert.equal(worked.filter(Boolean).length,1);
 const run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.status,'created');assert.ok(run.submissionId);
 const sub=(await f.pool.query('SELECT * FROM signing_submissions WHERE id=$1',[run.submissionId])).rows[0];assert.equal(sub.document_count,2);assert.equal(sub.template_version_id,f.f.versionId);
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_tasks')).rows[0].n,2);
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_jobs')).rows[0].n,5);
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_deliveries')).rows[0].n,1);
 await stage.save(f.pool,f.scope,f.caseId,target,{...f.body,expectedVersion:1,name:'Edited after send'});
 await f.move(1);await f.move(2);assert.equal(await f.process(),false);
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,1);
 await assert.rejects(stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version}),e=>e.errorCode==='INVALID_ACTION');
});

test('stage config: stale revisions/hash, missing data, foreign tenant/case and current author permissions fail closed',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;
 const missing=structuredClone(f.body);delete missing.rows[0].data.employeeId;
 assert.equal((await stage.preview(f.pool,f.scope,f.caseId,id,missing)).valid,false);
 await assert.rejects(stage.save(f.pool,f.scope,f.caseId,id,missing),e=>e.errorCode==='INVALID_ROWS');
 await assert.rejects(stage.save(f.pool,f.scope,f.caseId,id,{...f.body,previewHash:'a'.repeat(64)}),e=>e.httpStatus===412);
 await stage.save(f.pool,f.scope,f.caseId,id,f.body);
 await assert.rejects(stage.save(f.pool,f.scope,f.caseId,id,f.body),e=>e.httpStatus===412);
 await assert.rejects(stage.list(f.pool,{...f.scope,tenantId:randomUUID()},f.caseId),e=>e.errorCode==='NOT_FOUND');
 const changed=structuredClone(f.body);changed.rows[0].recipients.employee.contactUserId=f.scope.userId;
 await assert.rejects(stage.preview(f.pool,f.scope,f.caseId,id,changed),e=>e.errorCode==='STAGE_CONTACT_CHANGED');
 await f.pool.query("UPDATE users SET role='User' WHERE userid=$1",[f.scope.userId]);
 await assert.rejects(stage.save(f.pool,f.scope,f.caseId,id,{expectedVersion:1,enabled:false}),e=>e.errorCode==='FORBIDDEN');
 assert.equal((await stage.list(f.pool,f.scope,f.caseId)).rules[0].enabled,true);
});

test('stage runtime: changed contacts block without partial package, durable deduped alert and explicit same-run recovery',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;
 await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
 await f.pool.query("UPDATE users SET email='changed@example.invalid' WHERE userid=$1",[f.contact.userid]);
 await f.process();let state=await stage.list(f.pool,f.scope,f.caseId);let run=state.runs[0];assert.equal(run.status,'blocked');assert.equal(run.errorCode,'STAGE_CONTACT_CHANGED');
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,0);
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_error_alerts')).rows[0].n,1);
 const alert=(await f.pool.query('SELECT * FROM signing_error_alerts')).rows[0];assert.equal(alert.stage_run_id,run.id);assert.equal(alert.case_id,f.caseId);
 const html=require('../services/signingV2/errorAlerts').buildAlertEmail([alert],{origin:'https://qa.example.invalid'}).htmlBody;assert.ok(html.includes(`stageRun=${run.id}`));assert.ok(!html.includes('changed@example.invalid'));
 await assert.rejects(stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version}),e=>e.errorCode==='STAGE_CONTACT_CHANGED');
 const fixed=structuredClone(f.body);fixed.expectedVersion=1;fixed.rows[0].recipients.employee.email='changed@example.invalid';
 await stage.save(f.pool,f.scope,f.caseId,id,fixed);
 await assert.rejects(stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version-1}),e=>e.httpStatus===412);
 await stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version});await f.process();
 run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.status,'created');assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,1);
});

test('stable stage identity: reorder unchanged identity, skip only target, closure/creation/reopen and deletion cannot send accidentally',async t=>{
 const f=await fixture(t);await stage.save(f.pool,f.scope,f.caseId,f.stages[1].descriptionid,f.body);
 await transaction(f.pool,async db=>{const old=await stage.stageIdentity(db,f.caseId,1);await db.query('UPDATE casedescriptions SET stage=stage+1 WHERE caseid=$1',[f.caseId]);await db.query('UPDATE cases SET currentstage=2 WHERE caseid=$1',[f.caseId]);assert.deepEqual(await stage.recordTransition(db,{caseId:f.caseId,oldDescriptionId:old,oldClosed:false,newClosed:false,actorId:f.scope.userId}),[]);});
 await f.move(4);assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,0);
 await f.move(3,{closed:true});assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,0);
 await f.move(3);assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,0);
 await f.move(2);await f.move(3);assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,1);
 await transaction(f.pool,async db=>{await db.query('DELETE FROM casedescriptions WHERE descriptionid=$1',[f.stages[1].descriptionid]);await stage.recordTransition(db,{caseId:f.caseId,oldDescriptionId:null,oldClosed:false,newClosed:false,actorId:f.scope.userId});});
 const state=await stage.list(f.pool,f.scope,f.caseId);assert.equal(state.rules[0].enabled,false);assert.equal(state.runs[0].status,'cancelled');assert.equal(await f.process(),false);
});

test('runtime current permissions, rule changes, unavailable templates, quota failure and crash rollback never partially queue',async t=>{
 const modes=(process.env.STAGE_TEST_MODES || 'permission,rule,template,quota,crash,case').split(',');
 for(const mode of modes)await t.test(mode,async child=>{
  const f=await fixture(child),id=f.stages[1].descriptionid;await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
  let options={};
  if(mode==='permission')await f.pool.query("UPDATE users SET role='User' WHERE userid=$1",[f.scope.userId]);
  if(mode==='rule')await stage.save(f.pool,f.scope,f.caseId,id,{...f.body,expectedVersion:1,name:'Changed config'});
  if(mode==='template')await f.pool.query('UPDATE signing_templates SET archived=true WHERE id=$1',[f.f.templateId]);
  if(mode==='quota')options.reserveCapacity=async()=>{const e=Error('syntheticquota');e.errorCode='LIMIT_EXCEEDED';throw e;};
  if(mode==='crash')options.reserveCapacity=async db=>{await db.query("INSERT INTO signing_people(id,owner_context_id,name) VALUES($1,$2,'Must rollback')",[randomUUID(),f.scope.contextId]);const e=Error('synthetic crash');e.errorCode='STAGE_PROCESSING_FAILED';throw e;};
  if(mode==='case')await f.move(3);
  await f.process(options);
  const run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.status,'blocked');
  assert.equal(run.errorCode,{permission:'STAGE_PERMISSION_REVOKED',rule:'STAGE_RULE_CHANGED',template:'STAGE_TEMPLATE_UNAVAILABLE',quota:'LIMIT_EXCEEDED',crash:'STAGE_PROCESSING_FAILED',case:'STAGE_CASE_CHANGED'}[mode]);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,0);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_jobs')).rows[0].n,0);
  assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_people WHERE name='Must rollback'")).rows[0].n,0);
 });
});

test('forward-only trigger never sends first backward entry; own-only signing cannot read or change another author rule',async t=>{
 const f=await fixture(t);await stage.save(f.pool,f.scope,f.caseId,f.stages[0].descriptionid,f.body);
 await f.move(2);await f.move(1);assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs.length,0);
 const permissions={areas:{cases:{visible:true,actions:['view','edit'],dataScope:'all_firm'},signing:{visible:true,actions:['view','upload'],dataScope:'assigned_only'}}};
 const roleId=randomUUID();await f.pool.query("INSERT INTO firm_staff_roles(id,permissions) VALUES($1,$2)",[roleId,permissions]);
 const staff=(await f.pool.query("INSERT INTO users(name,role,firm_staff_role_id) VALUES('Other staff','Staff',$1) RETURNING userid",[roleId])).rows[0].userid;
 const own=await stage.currentScope(f.pool,f.scope.contextId,staff,{edit:true});assert.equal(own.all,false);
 assert.equal((await stage.list(f.pool,own,f.caseId)).rules.length,0);
 await assert.rejects(stage.save(f.pool,own,f.caseId,f.stages[0].descriptionid,{expectedVersion:1,enabled:false}),e=>e.errorCode==='NOT_FOUND');
});

test('stage-origin final activation and actual delivery fence stop changed permission/contact/case before fake transport',async t=>{
 for(const mode of ['permission','contact','case'])await t.test(mode,async child=>{
  const f=await fixture(child),id=f.stages[1].descriptionid;await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);await f.process();
  const run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];
  const pkg=(await f.pool.query('SELECT * FROM signing_packages WHERE submission_id=$1',[run.submissionId])).rows[0];
  assert.equal(await stage.originGuard(f.pool,f.scope.contextId,pkg.id),null);
  assert.equal(await stage.originGuard(f.pool,f.scope.contextId,randomUUID()),null,'ordinary package has no extra stage-origin rule');
  if(mode==='permission')await f.pool.query("UPDATE users SET role='User' WHERE userid=$1",[f.scope.userId]);
  if(mode==='contact')await f.pool.query("UPDATE users SET email='new@example.invalid' WHERE userid=$1",[f.contact.userid]);
  if(mode==='case')await f.move(3);
  const code={permission:'STAGE_PERMISSION_REVOKED',contact:'STAGE_CONTACT_CHANGED',case:'STAGE_CASE_CHANGED'}[mode];
  const revision=(await f.pool.query('SELECT * FROM signing_package_revisions WHERE id=$1',[pkg.active_revision_id])).rows[0];
  const runtimeFile=fs.readFileSync(require.resolve('../services/signingV2/runtime'),'utf8');
  const activationSource=runtimeFile.slice(runtimeFile.indexOf('async function authorizeActivation('),runtimeFile.indexOf('\nconst MESSAGES ='));
  const permissions=require('../lib/firmRolePermissions');
  const activation=require('node:vm').compileFunction(activationSource+';return authorizeActivation;', ['require','expect','fail','hasAreaAction','normalizeRolePermissions'])(
   id=>id==='./caseStageAutomation'?stage:require(id),require('../lib/signingV2/errors').expect,require('../lib/signingV2/errors').fail,permissions.hasAreaAction,permissions.normalizeRolePermissions);
  await assert.rejects(activation(f.pool,revision),error=>error.errorCode===code);
  await f.pool.query("UPDATE signing_package_revisions SET workflow_state='active' WHERE id=$1",[revision.id]);
  const job=(await f.pool.query("UPDATE signing_jobs SET state='running',leased_by='stage-test',fencing_token=1,lease_until=clock_timestamp()+interval '1 minute' WHERE kind='dispatch_delivery' RETURNING *")).rows[0];
  let calls=0;
  const dispatch=require('../services/signingV2/delivery').createDeliveryService({pool:f.pool,provider:{send:async()=>{calls++;throw Error('must not reach transport');}},grantService:{tokenForDelivery:()=>{throw Error('must not issue token');}},linkFor:()=>{throw Error('must not create link');}});
  const result=await dispatch(job);assert.equal(result.state,'failed');assert.equal(result.code,code);assert.equal(calls,0);
  assert.equal((await stage.list(f.pool,f.scope,f.caseId)).runs[0].errorCode,code);
  const alerts=(await f.pool.query('SELECT * FROM signing_error_alerts WHERE stage_run_id=$1',[run.id])).rows;assert.equal(alerts.length,1);
 });
});

test('automation audit prevents physical deletion after stage removed; metadata triggered fact is not limited by recent-run pagination',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
 await f.pool.query('CREATE TABLE stage_files(caseid integer);ALTER TABLE signingfiles ADD COLUMN caseid integer');
 await f.pool.query('DELETE FROM casedescriptions WHERE caseid=$1',[f.caseId]);
 // Incumbent introspection explicitly targets public; bind only that metadata
 // lookup to this synthetic test schema, preserving the actual legal-data SQL.
 const schemaDb={query:(sql,params)=>f.pool.query(sql.includes('information_schema.columns')?sql.replace("table_schema = 'public'",'table_schema = current_schema()'):sql,params)};
 assert.equal(await require('../utils/legalData').caseHasLegalData(schemaDb,f.caseId),true);
 const original=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];
 await f.pool.query(`INSERT INTO signing_case_stage_rules(id,owner_context_id,case_id,description_id,configured_by,template_version_id,template_name,template_metadata,input,preview_hash,contact_hash,case_hash)
  SELECT gen_random_uuid(),owner_context_id,case_id,10000+g,configured_by,template_version_id,template_name,template_metadata,input,preview_hash,contact_hash,case_hash FROM signing_case_stage_rules CROSS JOIN generate_series(1,101) g WHERE description_id=$1`,[id]);
 await f.pool.query(`INSERT INTO signing_case_stage_runs(id,owner_context_id,rule_id,case_id,description_id,stage_title,rule_version,configured_by,transition_by,input,preview_hash,contact_hash,case_hash,status)
  SELECT gen_random_uuid(),owner_context_id,id,case_id,description_id,'Historical removed stage',version,configured_by,configured_by,input,preview_hash,contact_hash,case_hash,'cancelled' FROM signing_case_stage_rules WHERE description_id>10000`);
 const paged=await stage.list(f.pool,f.scope,f.caseId);assert.equal(paged.runs.length,100);assert.equal(paged.runs.some(run=>run.id===original.id),false);
 assert.equal(paged.rules.find(rule=>rule.descriptionId===id).alreadyTriggered,true);
});

test('case party identity changes invalidate preview/save, queued creation and already-created dispatch',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;
 const preview=await stage.preview(f.pool,f.scope,f.caseId,id,f.body);
 await f.pool.query('UPDATE cases SET userid=$2 WHERE caseid=$1',[f.caseId,f.contact.userid]);
 await assert.rejects(stage.save(f.pool,f.scope,f.caseId,id,{...f.body,previewHash:preview.previewHash}),e=>e.httpStatus===412);
 await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
 await f.pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)',[f.caseId,f.scope.userId]);await f.process();
 let run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.errorCode,'STAGE_CASE_CHANGED');assert.equal(run.status,'blocked');
 await assert.rejects(stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version}),e=>e.errorCode==='STAGE_DATA_CHANGED');
 await stage.save(f.pool,f.scope,f.caseId,id,{...f.body,expectedVersion:1});await stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version});await f.process();
 run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.status,'created');
 const pkg=(await f.pool.query('SELECT id FROM signing_packages WHERE submission_id=$1',[run.submissionId])).rows[0];
 await f.pool.query('UPDATE cases SET casemanagerid=$2 WHERE caseid=$1',[f.caseId,f.scope.userId]);
 assert.equal(await stage.originGuard(f.pool,f.scope.contextId,pkg.id),'STAGE_CASE_CHANGED');
});

test('actual stage worker death rolls back uncommitted directory/package and restart creates exactly once',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
 const {fork}=require('node:child_process');
 const child=fork(path.join(__dirname,'helpers/signingStageCrashChild.cjs'),[],{env:{...process.env,STAGE_TEST_SCHEMA:f.schema},execArgv:process.execArgv.filter(arg=>!arg.startsWith('--test')),stdio:['ignore','pipe','pipe','ipc']});
 let err='';child.stderr.on('data',chunk=>{err+=String(chunk);});
 const reached=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('stage child did not reach transaction fence: '+err)),15000);child.once('message',message=>{clearTimeout(timer);resolve(message);});child.once('exit',(code,signal)=>{clearTimeout(timer);if(code!=null)reject(Error('stage child exited early: '+code+' '+err));});});
 assert.equal(reached.phase,'uncommitted-directory-and-case-run');child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));
 const state=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(state.status,'queued');
 assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,0);
 assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_people WHERE created_by=$1",[f.scope.userId])).rows[0].n,0);
 await f.process();await f.process();assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_submissions')).rows[0].n,1);
});

test('existing UI language is one uniform preference, mixed recipient locales cannot become overrides',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;
 const body=structuredClone(f.body);body.rows[0].recipients.employee.locale='ar';
 const preview=await stage.preview(f.pool,f.scope,f.caseId,id,body);assert.equal(preview.valid,true);
 const saved=await stage.save(f.pool,f.scope,f.caseId,id,{...body,previewHash:preview.previewHash});assert.equal(saved.rule.rows[0].recipients.employee.locale,'ar');
 const mixed=structuredClone(body);mixed.shared.unused={name:'Unrequested',locale:'he'};
 await assert.rejects(stage.preview(f.pool,f.scope,f.caseId,id,mixed),e=>e.errorCode==='INVALID_LOCALE');
});

test('current case-edit permission and firm signing switch are required at delayed creation and dispatch',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
 await f.pool.query("UPDATE users SET role='Lawyer' WHERE userid=$1",[f.scope.userId]);
 assert.equal(await stage.currentScope(f.pool,f.scope.contextId,f.scope.userId,{edit:true}),null,'legacy Lawyer has signing upload but no cases.edit');
 await f.process();let run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.errorCode,'STAGE_PERMISSION_REVOKED');
 await f.pool.query("UPDATE users SET role='Admin' WHERE userid=$1",[f.scope.userId]);await stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version});
 process.env.SIGNING_ENABLED='false';try {await f.process();}finally {process.env.SIGNING_ENABLED='true';}
 run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.errorCode,'STAGE_SIGNING_DISABLED');
 await stage.retry(f.pool,f.scope,f.caseId,run.id,{expectedVersion:run.version});await f.process();run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];
 const pkg=(await f.pool.query('SELECT id FROM signing_packages WHERE submission_id=$1',[run.submissionId])).rows[0];
 process.env.SIGNING_ENABLED='false';try {assert.equal(await stage.originGuard(f.pool,f.scope.contextId,pkg.id),'STAGE_SIGNING_DISABLED');}finally {process.env.SIGNING_ENABLED='true';}
});

test('new stage operational failure reaches active-admin fake email summary with exact run link and no private payload',async t=>{
 const f=await fixture(t),id=f.stages[1].descriptionid;await stage.save(f.pool,f.scope,f.caseId,id,f.body);await f.move(2);
 await f.pool.query("UPDATE users SET email='private-new@example.invalid' WHERE userid=$1",[f.contact.userid]);await f.process();
 const run=(await stage.list(f.pool,f.scope,f.caseId)).runs[0];assert.equal(run.errorCode,'STAGE_CONTACT_CHANGED');
 await f.pool.query('INSERT INTO platform_admins(user_id,is_active) VALUES($1,true)',[f.scope.userId]);
 const messages=[];const alerts=require('../services/signingV2/errorAlerts');
 const worker=alerts.createErrorAlerts({pool:f.pool,origin:'https://qa.example.invalid',delaySeconds:0,sendEmail:async payload=>{messages.push(payload);return{ok:true,simulated:true};},log:{error(){}}});
 assert.equal(await worker.flush(),1);assert.equal(messages.length,1);
 assert.ok(messages[0].htmlBody.includes(`stageRun=${run.id}`));assert.ok(messages[0].htmlBody.includes(`caseId=${f.caseId}`));
 assert.ok(!messages[0].htmlBody.includes('private-new@example.invalid'));assert.ok(!messages[0].htmlBody.includes('0501234567'));
 assert.equal((await f.pool.query('SELECT state FROM signing_error_emails')).rows[0].state,'simulated');
 assert.equal(await worker.flush(),0);assert.equal(messages.length,1,'durable event is deduped, no second summary');
 const event=(await f.pool.query('SELECT * FROM signing_error_alerts WHERE stage_run_id=$1',[run.id])).rows[0];
 assert.ok(alerts.buildAlertEmail([event],{origin:'https://qa.example.invalid',locale:'ar'}).htmlBody.includes('مستندات تلقائية حسب مرحلة الملف'));
 assert.ok(alerts.buildAlertEmail([event],{origin:'https://qa.example.invalid',locale:'en'}).htmlBody.includes('Automatic documents for a case stage'));
});

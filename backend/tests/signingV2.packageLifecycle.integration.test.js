const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {deliveryHarness}=require('./helpers/signingV2Delivery');
const lifecycle=require('../services/signingV2/packageLifecycle');
const jobs=require('../services/signingV2/jobs');
const actions=require('../services/signingV2/actions');
const management=require('../services/signingV2/management');
const {createPublicSigningService,CONSENT_VERSION}=require('../services/signingV2/publicSigning');

test('new cancellation and assignment lifecycle only',{skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());
 const check=(name,fn)=>t.test(name,{skip:process.env.LIFECYCLE_CASES && !name.match(new RegExp(process.env.LIFECYCLE_CASES))},fn);
 const h=await deliveryHarness(pool,{endpoints:Array(5).fill('lifecycle@example.invalid'),documentCount:3,configure:({definition,packages})=>{
  definition.documents.forEach(d=>{d.fields.find(f=>f.type==='signature').type='text';});
  const roles=packages[0].roles,personId=roles.employee[0].personId;
  packages.forEach(p=>{p.roles=roles;p.delivery={[personId]:{channels:['email'],locale:'en',email:'lifecycle@example.invalid'}};});return definition;
 }});t.after(h.close);
 const scope={...h.f.scope,packageCancel:true,packageAssign:true};
 const receipt=await h.submit();await h.activate();await h.drain('dispatch_delivery');
 const {byKey,people}=await h.targets(receipt.submissionId),ids=Object.values(byKey).map(p=>p.id),id=n=>byKey['employee-'+n].id;
 const token=h.provider.calls[0].url.split('/s/')[1],codes=[];
 const service=createPublicSigningService({pool,storage:{},otpKey:Buffer.alloc(32,7),otpTransport:{send:async m=>codes.push(m)}});
 const request=async(n,action='cancel',assigneeIds)=>{const p=await lifecycle.previewPackageAction(pool,scope,id(n),{action,assigneeIds});return {action,assigneeIds,previewHash:p.previewHash,reason:'Synthetic lifecycle review',idempotencyKey:randomUUID()};};
 const consent=async(n,limit)=>{const p=(await service.describe(token)).packages.find(p=>p.packageId===id(n));const taskIds=p.documents.flatMap(d=>d.tasks.map(t=>t).filter(t=>t.state==='ready').map(t=>t.taskId)).slice(0,limit);const s=await service.createSession(token,{taskIds,consentVersion:CONSENT_VERSION});await service.challenge(token,s.sessionId);await service.verify(token,s.sessionId,{code:codes.at(-1).code});return {...s,taskIds};};
 const accept=s=>service.accept(token,s.sessionId,{consent:true,idempotencyKey:randomUUID(),values:Object.fromEntries(s.taskIds.map(id=>[id,{signature:'Synthetic lifecycle signature'}]))});
 await check('new capability plus current data scope and required reason are enforced',async()=>{
  await assert.rejects(lifecycle.previewPackageAction(pool,{...scope,packageCancel:false},id(0),{action:'cancel'}),{errorCode:'FORBIDDEN'});
  await assert.rejects(lifecycle.previewPackageAction(pool,{...scope,all:false,userId:scope.userId+999999},id(0),{action:'cancel'}),{errorCode:'FORBIDDEN'});
  const input=await request(0);await assert.rejects(lifecycle.executePackageAction(pool,scope,id(0),{...input,reason:' '}),{errorCode:'REASON_REQUIRED'});
 });
 await check('a new accepted signature invalidates cancellation review; current review preserves immutable signatures and shared packages',async()=>{
  const old=await request(0),first=await consent(0,1);await accept(first);
  await assert.rejects(lifecycle.executePackageAction(pool,scope,id(0),old),{errorCode:'VERSION_CHANGED'});
  const session=await consent(0),target={packageId:id(0),personId:people['employee-0'],purpose:'reminder'};
  const preview=await actions.previewParticipantAction(pool,scope,target);await actions.executeParticipantAction(pool,scope,{...target,previewHash:preview.previewHash,idempotencyKey:randomUUID()});
  const history=(await pool.query('SELECT * FROM signing_actions WHERE session_id=$1 ORDER BY id',[first.sessionId])).rows;
  const snapshot=(await pool.query('SELECT snapshot,revision_hash FROM signing_package_revisions WHERE id=$1',[byKey['employee-0'].revision_id])).rows[0];
  const input=await request(0),count=h.provider.calls.length;
  const results=await Promise.all([1,2].map(()=>lifecycle.executePackageAction(pool,scope,id(0),input)));assert.equal(results.filter(r=>r.reused).length,1);assert.equal(results[0].acceptedCount,1);assert.equal(results[0].remainingCount,2);
  await assert.rejects(accept(session),{errorCode:'REVISION_INACTIVE'});
  assert.deepEqual((await pool.query('SELECT * FROM signing_actions WHERE session_id=$1 ORDER BY id',[first.sessionId])).rows,history);
  assert.deepEqual((await pool.query('SELECT snapshot,revision_hash FROM signing_package_revisions WHERE id=$1',[byKey['employee-0'].revision_id])).rows[0],snapshot);
  const view=await service.describe(token);assert.equal(view.packages.length,4);assert.ok(!view.packages.some(p=>p.packageId===id(0)));
  await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
  const details=await management.packageDetails(pool,scope,id(0));assert.equal(details.package.workflow_state,'cancelled');assert.equal(details.participants.flatMap(p=>p.tasks).filter(t=>t.state==='accepted').length,1);
  const list=await management.listSubmissions(pool,scope,{state:'all'});const row=list.rows.find(p=>p.id===receipt.submissionId);assert.equal(row.cancelled_count,1);assert.equal(row.required_count,12);assert.equal(row.accepted_count,0);
  await assert.rejects(lifecycle.executePackageAction(pool,scope,id(0),{...input,reason:'changed reason'}),{errorCode:'IDEMPOTENCY_CONFLICT'});
 });
 await check('cancellation wins a waiting verified acceptance at the package fence',async()=>{
  const s=await consent(1),input=await request(1),locker=await pool.connect();let cancel,sign;
  try{await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[id(1)]);
   cancel=lifecycle.executePackageAction(pool,scope,id(1),input);let waiting=false;
   for(let i=0;i<100;i++){waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT p.id,p.external_key%'")).rowCount>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waiting,true);
   sign=accept(s).then(()=>({accepted:true}),e=>({error:e.errorCode}));await locker.query('COMMIT');await cancel;const result=await sign;assert.ok(['SESSION_CLOSED','REVISION_INACTIVE','SESSION_STALE'].includes(result.error),JSON.stringify(result));
   assert.equal((await pool.query('SELECT count(*)::int n FROM signing_actions WHERE session_id=$1',[s.sessionId])).rows[0].n,0);
  }finally{await locker.query('ROLLBACK');locker.release();await Promise.allSettled([cancel,sign].filter(Boolean));}
 });
 await check('a fully accepted package cannot be cancelled while final PDFs are still being produced',async()=>{
  const s=await consent(2);await accept(s);const preview=await lifecycle.previewPackageAction(pool,scope,id(2),{action:'cancel'});assert.equal(preview.eligible,false);assert.equal(preview.reason,'SIGNING_ALREADY_COMPLETE');
 });
 let staffId,roleId;
 await check('HTTP assignment requires a new explicit capability and exposes only eligible office staff',async()=>{
  const express=require('express'),requestHttp=require('supertest'),jwt=require('jsonwebtoken');process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[scope.contextId])).rows[0].deployment_key;
  const permissions={version:6,areas:{signing:{visible:true,actions:['view','manage'],dataScope:'all_firm'}}};
  roleId=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',['Lifecycle staff '+randomUUID(),permissions])).rows[0].id;
  staffId=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Lifecycle assignee',$1,'Staff','synthetic',$2) RETURNING userid",[randomUUID()+'@example.invalid',roleId])).rows[0].userid;
  const clientId=(await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Lifecycle client',$1,'User','synthetic') RETURNING userid",[randomUUID()+'@example.invalid'])).rows[0].userid;
  try{const app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));app.use((e,req,res,next)=>res.status(e.httpStatus||500).json({code:e.errorCode}));
   const auth='Bearer '+jwt.sign({userid:staffId,role:'Staff'},process.env.JWT_SECRET),path='/api/signing-v2/packages/'+id(3)+'/lifecycle-preview';
   assert.equal((await requestHttp(app).post(path).set('Authorization',auth).send({action:'assign'})).status,403);
   assert.equal((await requestHttp(app).post(path).set('Authorization',auth).send({action:'cancel'})).status,403);
   permissions.areas.signing.actions.push('package_assign','package_cancel');await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[roleId,permissions]);
   const response=await requestHttp(app).post(path).set('Authorization',auth).send({action:'assign',assigneeIds:[staffId]});assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(response.body.eligibleUsers.some(u=>u.id===staffId));assert.ok(!response.body.eligibleUsers.some(u=>u.id===clientId));
   assert.equal((await requestHttp(app).post(path).set('Authorization',auth).send({action:'assign',assigneeIds:[clientId]})).status,422);
   assert.equal((await requestHttp(app).post(path).send({action:'assign'})).status,401);
  }finally{delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;}
 });
 await check('assignment CAS, replay, actual visibility removal and revoked assignee eligibility',async()=>{
  const before=(await pool.query('SELECT snapshot FROM signing_package_revisions WHERE id=$1',[byKey['employee-3'].revision_id])).rows[0];
  const input=await request(3,'assign',[staffId]),originalCount=h.provider.calls.length;
  const assigned=await lifecycle.executePackageAction(pool,scope,id(3),input);assert.deepEqual(assigned.assigneeIds,[staffId]);assert.equal((await lifecycle.executePackageAction(pool,scope,id(3),input)).reused,true);
  const limited={...scope,userId:staffId,all:false};assert.equal((await management.packageDetails(pool,limited,id(3))).package.id,id(3));
  const removal=await request(3,'assign',[]);await lifecycle.executePackageAction(pool,scope,id(3),removal);await assert.rejects(management.packageDetails(pool,limited,id(3)),{errorCode:'NOT_FOUND'});
  const another=await request(3,'assign',[staffId]);await pool.query('UPDATE firm_staff_roles SET is_active=false WHERE id=$1',[roleId]);await assert.rejects(lifecycle.executePackageAction(pool,scope,id(3),another),{errorCode:'ASSIGNEE_UNAVAILABLE'});
  assert.deepEqual((await pool.query('SELECT snapshot FROM signing_package_revisions WHERE id=$1',[byKey['employee-3'].revision_id])).rows[0],before);assert.equal(h.provider.calls.length,originalCount);
 });
 await check('cancelling preparation retires claimed and dependent jobs without false failures or waiting invitations',async()=>{
  const pending=await deliveryHarness(pool,{endpoints:['pending@example.invalid'],documentCount:2});try{
   await pending.submit();const p=(await pool.query('SELECT id FROM signing_packages WHERE owner_context_id=$1',[pending.f.contextId])).rows[0].id;
   const s={...pending.f.scope,packageCancel:true},preview=await lifecycle.previewPackageAction(pool,s,p,{action:'cancel'});
   const [lease]=await jobs.claim(pool,{workerId:'cancel-qa',kinds:['prepare_document'],limit:1,contextIds:[s.contextId]});assert.ok(lease);
   await lifecycle.executePackageAction(pool,s,p,{action:'cancel',reason:'Cancel during preparation',previewHash:preview.previewHash,idempotencyKey:randomUUID()});
   const retired=await jobs.cancelObsolete(pool,[s.contextId]);assert.equal(retired.rowCount,4);await assert.rejects(jobs.complete(pool,lease,async()=>{}),{errorCode:'WORKER_LEASE_LOST'});
   assert.equal(await pending.drain('dispatch_delivery'),1);assert.equal(pending.provider.calls.length,0);
   const states=(await pool.query('SELECT state FROM signing_jobs WHERE owner_context_id=$1',[s.contextId])).rows;assert.ok(states.every(r=>['cancelled','complete'].includes(r.state)));
  }finally{await pending.close();}
 });
 await check('initial invitation waits behind cancellation and cannot be sent from an earlier read',async()=>{
  const initial=await deliveryHarness(pool,{endpoints:['cancel-invite@example.invalid'],documentCount:1});let locker,cancelling,dispatch;
  try{await initial.submit();await initial.activate();const pkg=(await pool.query('SELECT id FROM signing_packages WHERE owner_context_id=$1',[initial.f.contextId])).rows[0].id,s={...initial.f.scope,packageCancel:true};
   const preview=await lifecycle.previewPackageAction(pool,s,pkg,{action:'cancel'});locker=await pool.connect();await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[pkg]);
   cancelling=lifecycle.executePackageAction(pool,s,pkg,{action:'cancel',reason:'Cancel queued invitation',previewHash:preview.previewHash,idempotencyKey:randomUUID()});
   let waiting=false;for(let i=0;i<100;i++){waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT p.id,p.external_key%'")).rowCount>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waiting,true);
   dispatch=initial.drain('dispatch_delivery');let senderWaiting=false;for(let i=0;i<100;i++){senderWaiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT r.workflow_state,p.active_revision_id%'")).rowCount>0;if(senderWaiting)break;await new Promise(r=>setTimeout(r,10));}assert.equal(senderWaiting,true);
   await locker.query('COMMIT');await cancelling;await dispatch;assert.equal(initial.provider.calls.length,0);assert.equal((await pool.query('SELECT state FROM signing_deliveries WHERE owner_context_id=$1',[s.contextId])).rows[0].state,'cancelled');
  }finally{if(locker){await locker.query('ROLLBACK');locker.release();}await Promise.allSettled([cancelling,dispatch].filter(Boolean));await initial.close();}
 });
 assert.equal(ids.length,5);
});

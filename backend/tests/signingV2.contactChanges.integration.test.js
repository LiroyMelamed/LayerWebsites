const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deliveryHarness } = require('./helpers/signingV2Delivery');
const contacts = require('../services/signingV2/contactChanges');
const actions = require('../services/signingV2/actions');
const { createPublicSigningService,CONSENT_VERSION } = require('../services/signingV2/publicSigning');

test('contact correction is private, versioned and restricted to one existing person/revision',
{skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());
 const h=await deliveryHarness(pool,{endpoints:Array(3).fill('shared@example.invalid'),configure:({definition,packages})=>{
  definition.documents.forEach(d=>{ d.fields.find(f=>f.type==='signature').type='text'; });
  const role=packages[0].roles.employee,personId=role[0].personId;
  for(const item of packages){item.roles={employee:role};item.delivery={[personId]:{locale:'en',channels:['email'],email:'shared@example.invalid'}};}
  return definition;
 }});t.after(h.close);
 const receipt=await h.submit();await h.activate();await h.drain('dispatch_delivery');
 const {byKey,people}=await h.targets(receipt.submissionId),scope={...h.f.scope,contactCorrect:true};
 const id=byKey['employee-0'].id,personId=people['employee-0'],token=h.provider.calls[0].url.split('/s/')[1];
 const otp=[];
 const service=createPublicSigningService({pool,storage:{},otpKey:Buffer.alloc(32,7),otpTransport:{send:async message=>otp.push(message)}});
 let saved,session;
 const signInput=taskIds=>({consent:true,idempotencyKey:randomUUID(),values:Object.fromEntries(taskIds.map(id=>[id,{signature:'Synthetic test'}]))});
 const original=(await pool.query('SELECT snapshot FROM signing_package_revisions WHERE id=$1',[byKey['employee-0'].revision_id])).rows[0].snapshot;
 const first=await contacts.readContact(pool,scope,id,personId);
 const input={expectedVersion:first.version,revisionId:first.revisionId,reason:'Synthetic contact correction',endpoints:{email:' NEW@example.invalid '},idempotencyKey:randomUUID()};
 await t.test('only explicit capability and current package access can read or correct contact',async()=>{
  await assert.rejects(contacts.readContact(pool,{...scope,contactCorrect:false},id,personId),{errorCode:'FORBIDDEN'});
  await assert.rejects(contacts.correctContact(pool,{...scope,contactCorrect:false},id,personId,input),{errorCode:'FORBIDDEN'});
  await assert.rejects(contacts.readContact(pool,{...scope,all:false,userId:scope.userId+99999},id,personId),{errorCode:'NOT_FOUND'});
  await assert.rejects(contacts.correctContact(pool,scope,id,randomUUID(),input),{errorCode:'NOT_FOUND'});
 });
 await t.test('invalid removal, identity fields and unchanged endpoints cannot revoke current access',async()=>{
  await assert.rejects(contacts.correctContact(pool,scope,id,personId,{...input,endpoints:{phone:'0501234567'}}),{errorCode:'CHANNEL_UNAVAILABLE'});
  await assert.rejects(contacts.correctContact(pool,scope,id,personId,{...input,endpoints:{email:'shared@example.invalid',name:'Different person'}}),{errorCode:'INVALID_DELIVERY'});
  await assert.rejects(contacts.correctContact(pool,scope,id,personId,{...input,endpoints:{email:'shared@example.invalid'}}),{errorCode:'CONTACT_UNCHANGED'});
  assert.equal((await contacts.readContact(pool,scope,id,personId)).version,1);
 });
 await t.test('save closes selected consent/links, preserves shared-person other packages and never sends',async()=>{
  const view=await service.describe(token),p=view.packages.find(p=>p.packageId===id);
  session=await service.createSession(token,{taskIds:p.documents.flatMap(d=>d.tasks.map(t=>t.taskId)),consentVersion:CONSENT_VERSION});
  const target={packageId:id,personId,purpose:'reminder'},preview=await actions.previewParticipantAction(pool,scope,target);
  const op=await actions.executeParticipantAction(pool,scope,{...target,previewHash:preview.previewHash,idempotencyKey:randomUUID()});
  const count=h.provider.calls.length,operations=(await pool.query('SELECT count(*)::int AS n FROM signing_deliveries WHERE owner_context_id=$1',[scope.contextId])).rows[0].n;
  const results=await Promise.all([1,2].map(()=>contacts.correctContact(pool,scope,id,personId,input)));saved=results[0];
  assert.equal(saved.version,2);assert.equal(results.filter(r=>r.reused).length,1);assert.equal(saved.messageQueued,false);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_deliveries WHERE owner_context_id=$1',[scope.contextId])).rows[0].n,operations);
  assert.equal(h.provider.calls.length,count);
  const now=await service.describe(token);assert.equal(now.packages.length,2);assert.ok(!now.packages.some(p=>p.packageId===id));
  assert.ok((await pool.query('SELECT revoked_at FROM signing_sessions_v2 WHERE id=$1',[session.sessionId])).rows[0].revoked_at);
  await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);
  assert.equal((await actions.operationStatus(pool,scope,op.operationId)).items[0].errorCode,'CONTACT_CHANGED');
  assert.equal((await contacts.readContact(pool,scope,id,personId)).endpoints.email,'new@example.invalid');
  assert.equal((await contacts.readContact(pool,scope,byKey['employee-1'].id,personId)).version,1);
  assert.deepEqual((await pool.query('SELECT snapshot FROM signing_package_revisions WHERE id=$1',[first.revisionId])).rows[0].snapshot,original);
  const directory=(await pool.query('SELECT contact_endpoints FROM signing_people WHERE id=$1',[personId])).rows[0];assert.notEqual(directory.contact_endpoints.email,'new@example.invalid');
  const audit=(await pool.query("SELECT details FROM signing_events_v2 WHERE package_id=$1 AND kind='contact_corrected'",[id])).rows;assert.equal(audit.length,1);assert.ok(!JSON.stringify(audit).includes('new@example.invalid'));
 });
 await t.test('corrected contact requires explicit renewal/channel review, then one new scoped link and fresh OTP',async()=>{
  const target={packageId:id,personId,purpose:'resend',renewLink:true},allowed={...scope,linkRenew:true};
  await assert.rejects(actions.previewParticipantAction(pool,{...scope,linkRenew:false},target),{errorCode:'FORBIDDEN'});
  assert.equal((await actions.previewParticipantAction(pool,allowed,target)).reason,'CHANNEL_REQUIRED');
  assert.equal((await actions.previewParticipantAction(pool,allowed,{...target,renewLink:false})).reason,'LINK_UNAVAILABLE');
  const input={...target,channel:'email'},preview=await actions.previewParticipantAction(pool,allowed,input);
  assert.equal(preview.eligible,true);assert.equal(preview.tasks.length,2);
  const request={...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()};
  const count=h.provider.calls.length;
  const results=await Promise.all([1,2].map(()=>actions.executeParticipantAction(pool,allowed,request)));
  assert.equal(results.filter(r=>r.reused).length,1);assert.equal(h.provider.calls.length,count);
  assert.equal((await contacts.readContact(pool,scope,id,personId)).version,3);
  await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);assert.equal(h.provider.calls.at(-1).endpoint,'new@example.invalid');
  const newToken=h.provider.calls.at(-1).url.split('/s/')[1],view=await service.describe(newToken);
  assert.equal(view.packages.length,1);assert.equal(view.packages[0].packageId,id);
  assert.equal((await service.describe(token)).packages.length,2);
  await assert.rejects(service.challenge(token,session.sessionId),{errorCode:'SESSION_CLOSED'});
  const tasks=view.packages[0].documents.flatMap(d=>d.tasks.map(t=>t.taskId));
  const fresh=await service.createSession(newToken,{taskIds:tasks,consentVersion:CONSENT_VERSION});
  await assert.rejects(service.accept(newToken,fresh.sessionId,signInput(tasks)),{errorCode:'OTP_REQUIRED'});
  await service.challenge(newToken,fresh.sessionId,{channel:'email'});assert.equal(otp.at(-1).endpoint,'new@example.invalid');
  await service.verify(newToken,fresh.sessionId,{code:otp.at(-1).code});
  const accepted=await service.accept(newToken,fresh.sessionId,signInput(tasks));assert.ok(accepted);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_actions WHERE session_id=$1',[fresh.sessionId])).rows[0].n,2);
 });
 await t.test('contact changed while acceptance waits on package fence cannot use already verified consent',async()=>{
  const pkg=byKey['employee-1'].id,current=await contacts.readContact(pool,scope,pkg,personId);
  const view=(await service.describe(token)).packages.find(p=>p.packageId===pkg),taskIds=view.documents.flatMap(d=>d.tasks.map(t=>t.taskId));
  const consent=await service.createSession(token,{taskIds,consentVersion:CONSENT_VERSION});
  await service.challenge(token,consent.sessionId);await service.verify(token,consent.sessionId,{code:otp.at(-1).code});
  const locker=await pool.connect();let running;
  try{
   await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[pkg]);
   running=service.accept(token,consent.sessionId,signInput(taskIds)).then(()=>({accepted:true}),e=>({error:e}));
   let blocked=false;for(let i=0;i<100;i++){blocked=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT r.id,r.revision_hash,r.workflow_state%'")).rowCount>0;if(blocked)break;await new Promise(r=>setTimeout(r,20));}assert.equal(blocked,true);
   const profile=(await contacts.currentContact(locker,scope,pkg,personId)).profile;
   await contacts.invalidateProfile(locker,scope.contextId,profile,scope.userId,'Synthetic race',{email:'changed@example.invalid'});
   await locker.query('COMMIT');const result=await running;assert.equal(result.error?.errorCode,'SESSION_CLOSED');
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_actions WHERE session_id=$1',[consent.sessionId])).rows[0].n,0);
   await assert.rejects(service.verify(token,consent.sessionId,{code:otp.at(-1).code}),{errorCode:'SESSION_CLOSED'});
   const count=otp.length;await assert.rejects(service.challenge(token,consent.sessionId),{errorCode:'SESSION_CLOSED'});assert.equal(otp.length,count);
  }finally{await locker.query('ROLLBACK');locker.release();if(running)await running;}
 });
 await t.test('consent created while contact correction owns the package rechecks fresh grant items before insertion',async()=>{
  const pkg=byKey['employee-2'].id,view=(await service.describe(token)).packages.find(p=>p.packageId===pkg),taskIds=view.documents.flatMap(d=>d.tasks.map(t=>t.taskId));
  const locker=await pool.connect();let running;
  try{
   await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[pkg]);
   running=service.createSession(token,{taskIds,consentVersion:CONSENT_VERSION}).then(()=>({created:true}),e=>({error:e}));
   let blocked=false;for(let i=0;i<100;i++){blocked=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT p.id FROM signing_packages p JOIN signing_package_revisions r%'")).rowCount>0;if(blocked)break;await new Promise(r=>setTimeout(r,20));}assert.equal(blocked,true);
   const profile=(await contacts.currentContact(locker,scope,pkg,personId)).profile;
   await contacts.invalidateProfile(locker,scope.contextId,profile,scope.userId,'Synthetic consent race');
   await locker.query('COMMIT');const result=await running;assert.equal(result.error?.errorCode,'LINK_UNAVAILABLE');
  }finally{await locker.query('ROLLBACK');locker.release();if(running)await running;}
 });
 await t.test('stale versions/revisions, changed retry body and revoked scope cannot overwrite/recover',async()=>{
  await assert.rejects(contacts.correctContact(pool,scope,id,personId,{...input,idempotencyKey:randomUUID()}),{errorCode:'VERSION_CHANGED'});
  await assert.rejects(contacts.correctContact(pool,scope,id,personId,{...input,reason:'Changed reason'}),{errorCode:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(contacts.correctContact(pool,scope,id,personId,{...input,expectedVersion:2,revisionId:randomUUID(),idempotencyKey:randomUUID()}),{errorCode:'VERSION_CHANGED'});
  await assert.rejects(contacts.correctContact(pool,{...scope,all:false,userId:scope.userId+99999},id,personId,input),{errorCode:'NOT_FOUND'});
 });
});

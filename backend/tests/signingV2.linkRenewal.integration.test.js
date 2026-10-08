const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {deliveryHarness}=require('./helpers/signingV2Delivery');
const {createLegalEntity}=require('../services/signingV2/people');
const {createAuthority,changeAuthority}=require('../services/signingV2/authorities');
const {createPublicSigningService,CONSENT_VERSION}=require('../services/signingV2/publicSigning');
const actions=require('../services/signingV2/actions');
const {senderCanAccess}=require('../services/signingV2/followupScope');
test('renewal admission, live worker permission and post-activation authority revocation',{skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());let office;const authorities=[];
 const h=await deliveryHarness(pool,{endpoints:Array(5).fill('synthetic@example.invalid'),configure:async({definition,packages,contextId,userId})=>{
  office={contextId,userId,all:true,authorityManage:true};const company=await createLegalEntity(pool,office,{name:'Synthetic represented party'}),evidence=randomUUID();
  await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,created_by,ready_at) VALUES($1,$2,'authority',$3,$3,$4,123,'ready',$5,now())`,[evidence,contextId,'c'.repeat(64),contextId+'/test-authority.pdf',userId]);
  for(const item of packages){let a=await createAuthority(pool,office,{personId:item.roles.employee[0].personId,partyId:company.id,evidenceArtifactId:evidence,scope:{roleKeys:['employee']},validFrom:'2020-01-01T00:00:00Z'});a=await changeAuthority(pool,office,a.id,{expectedVersion:1,action:'approve',reason:'Synthetic review'});authorities.push(a);Object.assign(item.roles.employee[0],{partyId:company.id,authorityId:a.id});}
  packages[0].deadline=new Date(Date.now()+86400000).toISOString();
  definition.roles[0].capacity='representative';definition.documents.forEach(d=>d.fields.find(f=>f.type==='signature').type='text');return definition;
 }});t.after(h.close);const receipt=await h.submit();await h.activate();await h.drain('dispatch_delivery');
 const {byKey,people}=await h.targets(receipt.submissionId),scope={...h.f.scope,linkRenew:true};
 const target=i=>({packageId:byKey['employee-'+i].id,personId:people['employee-'+i],purpose:'resend',renewLink:true,channel:'email'});
 const queue=async(input,actor=scope)=>{const preview=await actions.previewParticipantAction(pool,actor,input);assert.equal(preview.eligible,true,JSON.stringify(preview));return actions.executeParticipantAction(pool,actor,{...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()});};
 const tokenFor=async i=>{for(const call of h.provider.calls){const token=call.url.split('/s/')[1];const g=(await pool.query('SELECT person_id FROM signing_public_grants WHERE token_hash=$1',[require('node:crypto').createHash('sha256').update(token).digest('hex')])).rows[0];if(g?.person_id===target(i).personId)return token;}throw Error('missing token');};
 const codes=[],service=createPublicSigningService({pool,storage:{},otpKey:Buffer.alloc(32,7),otpTransport:{send:async message=>codes.push(message)}});
 await t.test('an expired signing grant can be renewed without extending immutable business deadline',async()=>{
  const id=target(0),before=(await pool.query('SELECT deadline,snapshot FROM signing_package_revisions WHERE id=$1',[byKey['employee-0'].revision_id])).rows[0];
  await pool.query("UPDATE signing_public_grants SET created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second' WHERE owner_context_id=$1 AND person_id=$2",[scope.contextId,id.personId]);
  const op=await queue(id),count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count+1);assert.equal((await actions.operationStatus(pool,scope,op.operationId)).items[0].state,'provider_accepted');
  assert.deepEqual((await pool.query('SELECT deadline,snapshot FROM signing_package_revisions WHERE id=$1',[byKey['employee-0'].revision_id])).rows[0],before);
 });
 await t.test('revoked authority blocks already verified acceptance and renewal',async()=>{
  const token=await tokenFor(1),view=await service.describe(token),tasks=view.packages.flatMap(p=>p.documents.flatMap(d=>d.tasks));
  const session=await service.createSession(token,{taskIds:tasks.map(t=>t.taskId),consentVersion:CONSENT_VERSION});await service.challenge(token,session.sessionId);await service.verify(token,session.sessionId,{code:codes.at(-1).code});
  await changeAuthority(pool,office,authorities[1].id,{expectedVersion:2,action:'revoke',reason:'Synthetic after verification'});
  await assert.rejects(service.accept(token,session.sessionId,{consent:true,idempotencyKey:randomUUID(),values:Object.fromEntries(tasks.map(t=>[t.taskId,{signature:'Synthetic'}]))}),{errorCode:'AUTHORITY_EXPIRED'});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM signing_actions WHERE session_id=$1',[session.sessionId])).rows[0].n,0);
  await assert.rejects(actions.previewParticipantAction(pool,scope,target(1)),{errorCode:'AUTHORITY_EXPIRED'});
 });
 await t.test('authority revoked after review cancels queued renewal before provider or replacement grant',async()=>{
  const op=await queue(target(2)),count=h.provider.calls.length;await changeAuthority(pool,office,authorities[2].id,{expectedVersion:2,action:'revoke',reason:'Synthetic after queue'});await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);assert.equal((await actions.operationStatus(pool,scope,op.operationId)).items[0].errorCode,'AUTHORITY_EXPIRED');
 });
 await t.test('HTTP contact requires manage plus new explicit action; renewal needs upload plus explicit action at dispatch',async()=>{
  const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken');process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[scope.contextId])).rows[0].deployment_key;
  try{const app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));app.use((e,req,res,next)=>res.status(e.httpStatus||500).json({code:e.errorCode}));
   const permissions={version:4,areas:{signing:{visible:true,actions:['view','upload','manage'],dataScope:'all_firm'}}};
   const role=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',['Synthetic renewal '+randomUUID(),permissions])).rows[0].id;
   const uid=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Synthetic renewal staff',$1,'Staff','synthetic',$2) RETURNING userid",[randomUUID()+'@example.invalid',role])).rows[0].userid;
   const auth='Bearer '+jwt.sign({userid:uid,role:'Staff'},process.env.JWT_SECRET),path='/api/signing-v2/packages/'+target(3).packageId+'/participants/'+target(3).personId;
   assert.equal((await request(app).get(path+'/contact').set('Authorization',auth)).status,403);
   assert.equal((await request(app).post(path+'/action-preview').set('Authorization',auth).send(target(3))).status,403);
   const update=async list=>{permissions.areas.signing.actions=list;await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[role,permissions]);};
   await update(['view','delivery_contact_correct']);assert.equal((await request(app).get(path+'/contact').set('Authorization',auth)).status,403);
   await update(['view','manage','delivery_contact_correct']);assert.equal((await request(app).get(path+'/contact').set('Authorization',auth)).status,200);assert.equal((await request(app).get(path+'/contact')).status,401);
   await update(['view','upload','access_link_renew']);const reviewed=await request(app).post(path+'/action-preview').set('Authorization',auth).send(target(3));assert.equal(reviewed.status,200,JSON.stringify(reviewed.body));
   const sent=await request(app).post(path+'/actions').set('Authorization',auth).set('Idempotency-Key',randomUUID()).send({...target(3),previewHash:reviewed.body.previewHash});assert.equal(sent.status,202,JSON.stringify(sent.body));
   assert.equal(await senderCanAccess(pool,scope.contextId,uid,target(3).packageId,'access_link_renew'),true);
   await update(['view','upload']);const count=h.provider.calls.length;await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,count);assert.equal((await actions.operationStatus(pool,{...scope,userId:uid},sent.body.operationId)).items[0].errorCode,'SENDER_ACCESS_CHANGED');
  }finally{delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;}
 });
});

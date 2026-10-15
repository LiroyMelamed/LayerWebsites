const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {deliveryHarness}=require('./helpers/signingV2Delivery');
const approvals=require('../services/signingV2/approvals');
const submissions=require('../services/signingV2/submissions');
const {compilePackage}=require('../lib/signingV2/compiler');
const jobs=require('../services/signingV2/jobs');
const management=require('../services/signingV2/management');

async function bindReviewer(pool,h,userId){
 h.f.input.reviewerUserId=userId;
 const template=(await pool.query('SELECT * FROM signing_template_versions WHERE id=$1',[h.f.versionId])).rows[0];
 const directory=await submissions.loadDirectory(pool,h.f.scope,template.definition,h.f.input.packages);
 h.f.input.previewHash=submissions.previewHash(template,h.f.input.packages,h.f.input.packages.map(p=>compilePackage(template.definition,p,directory)),userId);
}

test('new internal approval admission, PDF review and dispatch gate only',{skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());
 const check=(name,fn)=>t.test(name,{skip:process.env.APPROVAL_CASES && !name.match(new RegExp(process.env.APPROVAL_CASES))},fn);
 const permissions={version:6,areas:{signing:{visible:true,actions:['view','package_approve'],dataScope:'assigned_only'}}};
 const roleId=(await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',['Approval reviewer '+randomUUID(),permissions])).rows[0].id;
 const reviewerId=(await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Named reviewer',$1,'Staff','synthetic',$2) RETURNING userid",[randomUUID()+'@example.invalid',roleId])).rows[0].userid;
 const h=await deliveryHarness(pool,{endpoints:Array.from({length:5},(_,i)=>`review-${i}@example.invalid`),documentCount:2,
  configure:({definition})=>({...definition,policy:{...definition.policy,internalApproval:true}})});t.after(h.close);
 await bindReviewer(pool,h,reviewerId);const receipt=await h.submit();await h.activate();
 const {byKey}=await h.targets(receipt.submissionId),id=n=>byKey['employee-'+n].id;
 const scope={...h.f.scope,userId:reviewerId,all:false,packageApprove:true};
 const body=review=>({action:'approve',reviewed:true,documents:review.documents.map(({id,hash,artifactId})=>({id,hash,artifactId})),reviewHash:review.reviewHash,idempotencyKey:randomUUID()});
 await check('new approval admission binds reviewer and leaves real prepared PDFs blocked without attempts or invitations',async()=>{
  const original={...h.f.input};
  try{delete h.f.input.reviewerUserId;h.f.input.idempotencyKey=randomUUID();await assert.rejects(h.submit(),{errorCode:'APPROVER_REQUIRED'});
   h.f.input.reviewerUserId=h.f.scope.userId;await assert.rejects(h.submit(),{errorCode:'SEPARATE_APPROVER_REQUIRED'});
   const other=(await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Other reviewer',$1,'Lawyer','synthetic') RETURNING userid",[randomUUID()+'@example.invalid'])).rows[0].userid;
   h.f.input.reviewerUserId=other;await assert.rejects(h.submit(),{errorCode:'PREVIEW_CHANGED'});
  }finally{h.f.input=original;}
  const requests=(await pool.query('SELECT state,reviewer_userid FROM signing_approval_requests WHERE owner_context_id=$1',[scope.contextId])).rows;assert.equal(requests.length,5);assert.ok(requests.every(q=>q.state==='pending'&&q.reviewer_userid===reviewerId));
  assert.equal(await h.drain('dispatch_delivery'),0);assert.equal(h.provider.calls.length,0);
  assert.deepEqual((await pool.query("SELECT DISTINCT state,attempts FROM signing_jobs WHERE owner_context_id=$1 AND kind='activate_package'",[scope.contextId])).rows,[{state:'pending',attempts:0}]);
  assert.ok((await pool.query('SELECT state,stage_artifact_id FROM signing_tasks WHERE owner_context_id=$1',[scope.contextId])).rows.every(t=>t.state==='blocked'&&t.stage_artifact_id===null));
  await assert.rejects(pool.query('UPDATE signing_approval_requests SET reviewer_userid=$2 WHERE owner_context_id=$1',[scope.contextId,h.f.scope.userId]),{code:'23514'});
 });
 await check('named reviewer must review exact PDFs; HTTP grants, retry and activation do not sign any task',async()=>{
  const review=await approvals.readReview(pool,scope,id(0));assert.equal(review.ready,true);assert.equal(review.documents.length,2);assert.ok(review.documents.every(d=>/^[a-f0-9]{64}$/.test(d.hash)));
  await assert.rejects(approvals.readReview(pool,{...scope,packageApprove:false},id(0)),{errorCode:'FORBIDDEN'});
  await assert.rejects(approvals.readReview(pool,{...h.f.scope,packageApprove:true},id(0)),{errorCode:'NOT_FOUND'});
  const input=body(review);await assert.rejects(approvals.decide(pool,scope,id(0),{...input,documents:input.documents.slice(0,1)}),{errorCode:'PDF_REVIEW_REQUIRED'});
  await assert.rejects(approvals.decide(pool,scope,id(0),{...input,reviewed:false}),{errorCode:'PDF_REVIEW_REQUIRED'});
  const express=require('express'),http=require('supertest'),jwt=require('jsonwebtoken');process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_DEPLOYMENT_KEY=(await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1',[scope.contextId])).rows[0].deployment_key;
  try{const app=express();app.use(express.json());app.use('/api/signing-v2',require('../routes/signingV2Routes'));app.use((e,req,res,next)=>res.status(e.httpStatus||500).json({code:e.errorCode}));
   const url='/api/signing-v2/packages/'+id(0)+'/approval',auth='Bearer '+jwt.sign({userid:reviewerId,role:'Staff'},process.env.JWT_SECRET);
   assert.equal((await http(app).get(url)).status,401);assert.equal((await http(app).get(url).set('Authorization',auth)).status,200);
   const res=await http(app).post(url).set('Authorization',auth).set('Idempotency-Key',input.idempotencyKey).send(input);assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(res.body.state,'approved');
  }finally{delete process.env.SIGNING_V2_ENABLED;delete process.env.SIGNING_DEPLOYMENT_KEY;}
  assert.equal((await approvals.decide(pool,scope,id(0),input)).reused,true);
  assert.equal(await h.drain('activate_package'),1);assert.equal(await h.drain('dispatch_delivery'),1);assert.equal(h.provider.calls.length,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM signing_actions WHERE owner_context_id=$1',[scope.contextId])).rows[0].n,0);
  assert.equal((await management.packageDetails(pool,scope,id(0))).approval.state,'approved');
 });
 await check('return for correction preserves prepared revision and blocks invitations without a retry loop',async()=>{
  const review=await approvals.readReview(pool,scope,id(1)),input={action:'return',reviewHash:review.reviewHash,idempotencyKey:randomUUID(),reason:'The amount needs correction'};
  const before=(await pool.query('SELECT snapshot,revision_hash FROM signing_package_revisions WHERE id=$1',[review.revisionId])).rows[0];
  await assert.rejects(approvals.decide(pool,scope,id(1),{...input,reason:' '}),{errorCode:'REASON_REQUIRED'});
  assert.equal((await approvals.decide(pool,scope,id(1),input)).state,'returned');
  assert.equal((await approvals.readReview(pool,scope,id(1))).reason,input.reason);
  assert.deepEqual((await pool.query('SELECT snapshot,revision_hash FROM signing_package_revisions WHERE id=$1',[review.revisionId])).rows[0],before);
  assert.equal((await pool.query('SELECT workflow_state FROM signing_package_revisions WHERE id=$1',[review.revisionId])).rows[0].workflow_state,'attention');
  assert.equal(await h.drain('activate_package'),0);assert.equal(await h.drain('dispatch_delivery'),0);
 });
 await check('reviewer loses current data access while approval waits and cannot use stale all-firm scope',async()=>{
  const review=await approvals.readReview(pool,scope,id(2)),input=body(review),locker=await pool.connect();let pending;
  try{await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[roleId,{...permissions,areas:{signing:{...permissions.areas.signing,dataScope:'all_firm'}}}]);
   await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[id(2)]);
   pending=approvals.decide(pool,{...scope,all:true},id(2),input).then(()=>({accepted:true}),e=>({error:e.errorCode}));
   let waiting=false;for(let i=0;i<100;i++){waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT r.*,p.external_key%'")).rowCount>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waiting,true);
   await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[roleId,permissions]);await locker.query('DELETE FROM signing_package_assignments WHERE owner_context_id=$1 AND package_id=$2',[scope.contextId,id(2)]);await locker.query('COMMIT');
   assert.deepEqual(await pending,{error:'NOT_FOUND'});assert.equal((await pool.query('SELECT count(*)::int n FROM signing_approvals WHERE revision_id=$1',[review.revisionId])).rows[0].n,0);
  }finally{await locker.query('ROLLBACK');locker.release();if(pending)await pending;await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[roleId,permissions]);}
 });
 await check('permission revoked after review approval still blocks worker activation',async()=>{
  const review=await approvals.readReview(pool,scope,id(3));await approvals.decide(pool,scope,id(3),body(review));
  await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[roleId,{version:6,areas:{signing:{visible:true,actions:['view'],dataScope:'assigned_only'}}}]);
  try{await assert.rejects(h.drain('activate_package'),{errorCode:'FORBIDDEN'});assert.equal(await h.drain('dispatch_delivery'),0);
   assert.equal((await pool.query('SELECT count(*)::int n FROM signing_grant_items WHERE revision_id=$1',[review.revisionId])).rows[0].n,0);
  }finally{await pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1',[roleId,permissions]);}
 });
 await check('explicit solo policy permits internal approval but never creates a signature',async()=>{
  const solo=await deliveryHarness(pool,{endpoints:['solo-review@example.invalid'],documentCount:1,configure:({definition})=>({...definition,policy:{...definition.policy,internalApproval:true,soloApproval:true}})});
  try{await bindReviewer(pool,solo,solo.f.scope.userId);const receipt=await solo.submit();await solo.activate();const {byKey}=await solo.targets(receipt.submissionId),pkg=byKey['employee-0'].id,s={...solo.f.scope,packageApprove:true};
   const review=await approvals.readReview(pool,s,pkg);assert.equal(review.soloProfile,true);await approvals.decide(pool,s,pkg,body(review));await solo.drain('activate_package');await solo.drain('dispatch_delivery');assert.equal(solo.provider.calls.length,1);
   assert.equal((await pool.query('SELECT count(*)::int n FROM signing_actions WHERE owner_context_id=$1',[s.contextId])).rows[0].n,0);
  }finally{await solo.close();}
 });
});

const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const {deliveryHarness}=require('./helpers/signingV2Delivery');
const replacement=require('../services/signingV2/replacement'),creation=require('../services/signingV2/creation'),management=require('../services/signingV2/management'),jobs=require('../services/signingV2/jobs');
const {createPublicSigningService,CONSENT_VERSION}=require('../services/signingV2/publicSigning');
const {bytesHash,digest}=require('../lib/signingV2/canonical');

test('new immutable package replacement cases only',{skip:process.env.LEGAL_DB_QA!=='true',timeout:120000},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());await pool.query(fs.readFileSync('./migrations/2026-10-08_11_signing_package_replacement.sql','utf8'));
 const h=await deliveryHarness(pool,{endpoints:Array(6).fill('replacement@example.invalid'),documentCount:2,configure:({definition})=>{definition.documents.forEach(d=>d.fields.find(f=>f.type==='signature').type='text');return definition;}});t.after(h.close);
 const scope={...h.f.scope,packageRevise:true,send:true,manage:true};const submitted=await h.submit();await h.activate();await h.drain('dispatch_delivery');
 const{byKey}=await h.targets(submitted.submissionId),id=n=>byKey['employee-'+n].id,codes=[];
 const storage={read:async key=>{const bytes=h.objects.get(key);assert.ok(bytes,'memory artifact '+key);return bytes;},write:async(key,bytes)=>h.objects.set(key,Buffer.from(bytes)),verify:async(key,size,hash)=>{assert.equal(h.objects.get(key).length,size);assert.equal(bytesHash(h.objects.get(key)),hash);}};
 const publicService=createPublicSigningService({pool,storage,otpKey:Buffer.alloc(32,12),otpTransport:{send:async m=>codes.push(m)}});
 const tokens=new Map();for(const c of h.provider.calls){const token=c.url.split('/s/')[1];for(const p of(await publicService.describe(token)).packages)tokens.set(p.packageId,token);}
 const check=(name,fn)=>t.test(name,{skip:process.env.REPLACEMENT_CASES&&!name.match(new RegExp(process.env.REPLACEMENT_CASES))},fn);
 const consent=async(pkg,token=tokens.get(pkg),limit)=>{const p=(await publicService.describe(token)).packages.find(p=>p.packageId===pkg);assert.ok(p);const ids=p.documents.flatMap(d=>d.tasks.filter(t=>t.state==='ready').map(t=>t.taskId)).slice(0,limit);const session=await publicService.createSession(token,{taskIds:ids,consentVersion:CONSENT_VERSION});await publicService.challenge(token,session.sessionId);await publicService.verify(token,session.sessionId,{code:codes.at(-1).code});return{...session,token,taskIds:ids};};
 const accept=s=>publicService.accept(s.token,s.sessionId,{consent:true,idempotencyKey:randomUUID(),values:Object.fromEntries(s.taskIds.map(id=>[id,{signature:'Synthetic replacement signature'}]))});
 const start=async(n,stopCurrent=true)=>{const read=await replacement.readReplacement(pool,scope,id(n));return replacement.startReplacement(pool,scope,id(n),{expectedPackageVersion:read.packageVersion,expectedRevisionId:read.revisionId,sourceReviewHash:read.sourceReviewHash,reason:'Correct synthetic terms',stopCurrent,idempotencyKey:randomUUID()});};
 const reviewed=async(n,content)=>{const read=await replacement.readReplacement(pool,scope,id(n));content=content||read.content;content.rows[0].data.employeeId='000987654';const input={content,reason:'Correct synthetic terms',expectedPackageVersion:read.packageVersion,expectedRevisionId:read.revisionId};const preview=await replacement.previewReplacement(pool,scope,id(n),input);assert.equal(preview.valid,true,JSON.stringify(preview.errors));return{...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()};};
 const quota={reserveCapacity:async()=>{}};
 await check('explicit replacement capability scope reason and source review are mandatory',async()=>{
  await assert.rejects(replacement.readReplacement(pool,{...scope,packageRevise:false},id(0)),{errorCode:'FORBIDDEN'});
  await assert.rejects(replacement.readReplacement(pool,{...scope,contextId:randomUUID()},id(0)),{errorCode:'FORBIDDEN'});
  const read=await replacement.readReplacement(pool,scope,id(0));assert.equal(read.content.rows.length,1);assert.equal(read.content.rows[0].recipients.employee.people[0].personId,read.content.rows[0].recipients.employee.people[0].personId);
  const input={expectedPackageVersion:read.packageVersion,expectedRevisionId:read.revisionId,sourceReviewHash:read.sourceReviewHash,idempotencyKey:randomUUID()};await assert.rejects(replacement.startReplacement(pool,scope,id(0),{...input,reason:' '}),{errorCode:'REASON_REQUIRED'});
  await assert.rejects(replacement.startReplacement(pool,scope,id(0),{...input,reason:'review',sourceReviewHash:'stale'}),{errorCode:'VERSION_CHANGED'});
  await assert.rejects(replacement.executeReplacement(pool,scope,id(0),await reviewed(0),quota),{errorCode:'REPLACEMENT_DRAFT_REQUIRED'});
 });
 await check('default stopping preserves accepted actions immutable snapshot and other package access',async()=>{
  const signed=await consent(id(1),undefined,1);await accept(signed);const pending=await consent(id(1));const oldRevision=byKey['employee-1'].revision_id;
  const actions=(await pool.query('SELECT * FROM signing_actions WHERE session_id=$1',[signed.sessionId])).rows,snapshot=(await pool.query('SELECT snapshot,revision_hash FROM signing_package_revisions WHERE id=$1',[oldRevision])).rows[0],count=h.provider.calls.length;
  const started=await start(1);assert.equal(started.sourceState,'replacement_pending');assert.equal(started.acceptedCount,1);
  await assert.rejects(accept(pending),e=>['REVISION_INACTIVE','SESSION_CLOSED','SESSION_STALE','NOT_FOUND','LINK_UNAVAILABLE'].includes(e.errorCode));
  await assert.rejects(publicService.describe(tokens.get(id(1))),{errorCode:'LINK_UNAVAILABLE'});
  assert.equal((await publicService.describe(tokens.get(id(0)))).packages[0].packageId,id(0));
  assert.deepEqual((await pool.query('SELECT * FROM signing_actions WHERE session_id=$1',[signed.sessionId])).rows,actions);
  assert.deepEqual((await pool.query('SELECT snapshot,revision_hash FROM signing_package_revisions WHERE id=$1',[oldRevision])).rows[0],snapshot);assert.equal(h.provider.calls.length,count);
  const detail=await management.packageDetails(pool,scope,id(1));assert.equal(detail.revisionHistory[0].acceptedCount,1);
 });
 await check('retained source stays active until explicit publish and fresh tasks require fresh consent and OTP',async()=>{
  const stale=await replacement.readReplacement(pool,scope,id(2));const oldSession=await consent(id(2),undefined,1);await accept(oldSession);
  await assert.rejects(replacement.startReplacement(pool,scope,id(2),{expectedRevisionId:stale.revisionId,expectedPackageVersion:stale.packageVersion,sourceReviewHash:stale.sourceReviewHash,reason:'review',stopCurrent:false,idempotencyKey:randomUUID()}),{errorCode:'VERSION_CHANGED'});
  const started=await start(2,false);assert.equal(started.sourceState,'active');assert.ok((await publicService.describe(tokens.get(id(2)))).packages.length);
  const oldActions=(await pool.query('SELECT * FROM signing_actions WHERE session_id=$1',[oldSession.sessionId])).rows,input=await reviewed(2),result=await replacement.executeReplacement(pool,scope,id(2),input,quota);
  assert.equal(result.revisionNumber,2);assert.equal(result.packageId,id(2));assert.equal((await replacement.executeReplacement(pool,scope,id(2),input,quota)).reused,true);
  await assert.rejects(replacement.executeReplacement(pool,scope,id(2),{...input,reason:'different'},quota),{errorCode:'IDEMPOTENCY_CONFLICT'});
  assert.equal((await pool.query('SELECT count(*)::int n FROM signing_packages WHERE owner_context_id=$1',[scope.contextId])).rows[0].n,6);
  assert.equal((await pool.query('SELECT count(*)::int n FROM signing_actions a JOIN signing_tasks t ON t.id=a.task_id WHERE t.revision_id=$1',[result.revisionId])).rows[0].n,0);
  assert.deepEqual((await pool.query('SELECT * FROM signing_actions WHERE session_id=$1',[oldSession.sessionId])).rows,oldActions);
  await assert.rejects(publicService.describe(tokens.get(id(2))),{errorCode:'LINK_UNAVAILABLE'});
  const before=h.provider.calls.length;await h.activate();await h.drain('dispatch_delivery');assert.equal(h.provider.calls.length,before+1);
  const token=h.provider.calls.at(-1).url.split('/s/')[1],p=(await publicService.describe(token)).packages[0];assert.equal(p.packageId,id(2));assert.equal((await pool.query('SELECT revision_id FROM signing_tasks WHERE id=$1',[p.documents[0].tasks[0].taskId])).rows[0].revision_id,result.revisionId);
  const ids=p.documents.flatMap(d=>d.tasks.map(t=>t.taskId)),newSession=await publicService.createSession(token,{taskIds:ids,consentVersion:CONSENT_VERSION});
  await assert.rejects(publicService.accept(token,newSession.sessionId,{consent:true,idempotencyKey:randomUUID(),values:Object.fromEntries(ids.map(id=>[id,{signature:'new signature'}]))}),{errorCode:'OTP_REQUIRED'});
  const fresh=await consent(id(2),token);await accept(fresh);assert.notEqual(fresh.sessionId,oldSession.sessionId);
  const list=await management.listSubmissions(pool,scope,{state:'all'});assert.equal(list.rows.find(r=>r.id===submitted.submissionId).package_count,6);
  assert.equal((await pool.query('SELECT package_count,document_count FROM signing_submissions WHERE id=$1',[submitted.submissionId])).rows[0].document_count,12);
 });
 await check('review binds exact content contact directory task versions and quota failure rolls back publish',async()=>{
  await start(3);const input=await reviewed(3),before=(await pool.query('SELECT active_revision_id FROM signing_packages WHERE id=$1',[id(3)])).rows[0];
  await assert.rejects(replacement.executeReplacement(pool,scope,id(3),{...input,content:{...input.content,rows:[{...input.content.rows[0],data:{employeeId:'different'}}]}},quota),{errorCode:'PREVIEW_CHANGED'});
  await assert.rejects(replacement.executeReplacement(pool,scope,id(3),input,{reserveCapacity:async()=>{throw Object.assign(new Error('quota blocked'),{errorCode:'LIMIT_EXCEEDED'});}}),{errorCode:'LIMIT_EXCEEDED'});
  assert.deepEqual((await pool.query('SELECT active_revision_id FROM signing_packages WHERE id=$1',[id(3)])).rows[0],before);assert.equal((await pool.query('SELECT count(*)::int n FROM signing_package_revisions WHERE package_id=$1',[id(3)])).rows[0].n,1);
  const result=await replacement.executeReplacement(pool,scope,id(3),input,quota);assert.equal(result.revisionNumber,2);
 });
 await check('completed old real final and evidence PDFs remain office-downloadable after supersession',async()=>{
  const s=await consent(id(4));await accept(s);
  const {RenderPool}=require('../services/signingV2/renderPool'),renderer=new RenderPool({concurrency:1});try{
   const complete=require('../services/signingV2/completion').createCompletionService({pool,storage,renderer});
   for(const kind of ['finalize_document','render_evidence']){let leases;while((leases=await jobs.claim(pool,{contextIds:[scope.contextId],workerId:'replacement-completion',kinds:[kind],limit:8})).length)for(const lease of leases)await (kind==='finalize_document'?complete.finalizeDocument:complete.renderEvidence)(lease);}
  }finally{await renderer.close();}
  const oldRevision=byKey['employee-4'].revision_id,docs=(await pool.query('SELECT id,final_artifact_id FROM signing_documents WHERE revision_id=$1 ORDER BY id',[oldRevision])).rows;
  const before=await management.packageDocumentFile(pool,scope,id(4),docs[0].id,storage),evidence=await management.packageEvidenceFile(pool,scope,id(4),storage);assert.equal(before.final,true);assert.ok(evidence.bytes.subarray(0,5).equals(Buffer.from('%PDF-')));
  await start(4);await replacement.executeReplacement(pool,scope,id(4),await reviewed(4),quota);
  assert.equal(bytesHash((await management.packageDocumentFile(pool,scope,id(4),docs[0].id,storage,oldRevision)).bytes),bytesHash(before.bytes));assert.equal(bytesHash((await management.packageEvidenceFile(pool,scope,id(4),storage,oldRevision)).bytes),bytesHash(evidence.bytes));
  await assert.rejects(management.packageDocumentFile(pool,scope,id(0),docs[0].id,storage,oldRevision),{errorCode:'NOT_FOUND'});
  const history=(await management.packageDetails(pool,scope,id(4))).revisionHistory;assert.equal(history[1].state,'superseded');assert.equal(history[1].evidence,true);assert.equal(history[1].acceptedCount,2);
 });
 await check('stop wins waiting verified acceptance under the package fence',async()=>{
  const s=await consent(id(5)),read=await replacement.readReplacement(pool,scope,id(5)),locker=await pool.connect();let stopping,signing;
  try{await locker.query('BEGIN');await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE',[id(5)]);
   stopping=replacement.startReplacement(pool,scope,id(5),{expectedRevisionId:read.revisionId,expectedPackageVersion:read.packageVersion,sourceReviewHash:read.sourceReviewHash,reason:'Stop before new revision',idempotencyKey:randomUUID()});
   let wait=false;for(let i=0;i<100;i++){wait=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT p.*,p.version AS package_version%'")).rowCount>0;if(wait)break;await new Promise(r=>setTimeout(r,10));}assert.equal(wait,true);
   signing=accept(s).then(()=>({ok:true}),e=>({error:e.errorCode}));await locker.query('COMMIT');await stopping;const result=await signing;assert.ok(['REVISION_INACTIVE','SESSION_CLOSED','SESSION_STALE','NOT_FOUND'].includes(result.error),JSON.stringify(result));assert.equal((await pool.query('SELECT count(*)::int n FROM signing_actions WHERE session_id=$1',[s.sessionId])).rows[0].n,0);
  }finally{await locker.query('ROLLBACK');locker.release();await Promise.allSettled([stopping,signing].filter(Boolean));}
 });
 await check('reopened retained draft can explicitly stop but never quietly resume its old revision',async()=>{
  const pending=await deliveryHarness(pool,{endpoints:['reopen@example.invalid'],documentCount:1});try{
   await pending.submit();await pending.activate();await pending.drain('dispatch_delivery');const pkg=(await pool.query('SELECT id FROM signing_packages WHERE owner_context_id=$1',[pending.f.contextId])).rows[0].id,sc={...pending.f.scope,packageRevise:true};
   const initial=await replacement.readReplacement(pool,sc,pkg),startInput={expectedRevisionId:initial.revisionId,expectedPackageVersion:initial.packageVersion,sourceReviewHash:initial.sourceReviewHash,reason:'Retain while reviewing',stopCurrent:false,idempotencyKey:randomUUID()};
   const retained=await replacement.startReplacement(pool,sc,pkg,startInput);assert.equal(retained.stopCurrent,false);assert.equal((await replacement.readReplacement(pool,sc,pkg)).sourceState,'active');
   const fresh=await replacement.readReplacement(pool,sc,pkg),stopped=await replacement.startReplacement(pool,sc,pkg,{expectedRevisionId:fresh.revisionId,expectedPackageVersion:fresh.packageVersion,sourceReviewHash:fresh.sourceReviewHash,reason:'Explicit stop now',stopCurrent:true,idempotencyKey:randomUUID()});assert.equal(stopped.stopCurrent,true);assert.equal(stopped.sourceState,'replacement_pending');
   const final=await replacement.readReplacement(pool,sc,pkg);await assert.rejects(replacement.startReplacement(pool,sc,pkg,{expectedRevisionId:final.revisionId,expectedPackageVersion:final.packageVersion,sourceReviewHash:final.sourceReviewHash,reason:'Attempt silent resume',stopCurrent:false,idempotencyKey:randomUUID()}),{errorCode:'REVISION_INACTIVE'});
  }finally{await pending.close();}
 });
 await check('replacement with internal approval creates an independent named review and emits no invitation before fresh approval',async()=>{
  const pending=await deliveryHarness(pool,{endpoints:['fresh-review@example.invalid'],documentCount:1});try{
   await pending.submit();await pending.activate();await pending.drain('dispatch_delivery');const pkg=(await pool.query('SELECT id FROM signing_packages WHERE owner_context_id=$1',[pending.f.contextId])).rows[0].id,sc={...pending.f.scope,packageRevise:true};
   const def=JSON.parse(JSON.stringify(pending.f.definition));def.policy.internalApproval=true;def.policy.soloApproval=true;const versionId=randomUUID();await pool.query("INSERT INTO signing_template_versions(id,owner_context_id,template_id,version,state,definition,definition_hash,created_by,published_by,published_at) VALUES($1,$2,$3,2,'published',$4,$5,$6,$6,now())",[versionId,sc.contextId,pending.f.templateId,def,digest(def),sc.userId]);
   const read=await replacement.readReplacement(pool,sc,pkg);await replacement.startReplacement(pool,sc,pkg,{expectedRevisionId:read.revisionId,expectedPackageVersion:read.packageVersion,sourceReviewHash:read.sourceReviewHash,reason:'New reviewed policy',idempotencyKey:randomUUID()});
   const fresh=await replacement.readReplacement(pool,sc,pkg),content={...fresh.content,templateVersionId:versionId,reviewerUserId:sc.userId},input={content,reason:'New reviewed policy',expectedRevisionId:fresh.revisionId,expectedPackageVersion:fresh.packageVersion};const preview=await replacement.previewReplacement(pool,sc,pkg,input);assert.equal(preview.valid,true,JSON.stringify(preview.errors));
   const result=await replacement.executeReplacement(pool,sc,pkg,{...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()},quota),before=pending.provider.calls.length;await pending.drain('prepare_document');await pending.drain('validate_package');assert.equal(await pending.drain('activate_package'),0);assert.equal(await pending.drain('dispatch_delivery'),0);assert.equal(pending.provider.calls.length,before);
   const request=(await pool.query('SELECT revision_id,reviewer_userid,state FROM signing_approval_requests WHERE owner_context_id=$1',[sc.contextId])).rows[0];assert.equal(request.revision_id,result.revisionId);assert.equal(request.reviewer_userid,sc.userId);assert.equal(request.state,'pending');assert.equal((await pool.query('SELECT count(*)::int n FROM signing_actions a JOIN signing_tasks t ON t.id=a.task_id WHERE t.revision_id=$1',[result.revisionId])).rows[0].n,0);
  }finally{await pending.close();}
 });

});

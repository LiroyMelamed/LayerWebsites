const {randomUUID}=require('node:crypto');
const {UUID,admission,conditionMatches}=require('../../lib/signingV2/compiler');
const {digest}=require('../../lib/signingV2/canonical');
const {expect,fail}=require('../../lib/signingV2/errors');
const {normalizeRolePermissions,hasAreaAction,getSigningDataScope}=require('../../lib/firmRolePermissions');
const {scopeParams,packageScopeSql}=require('./access');
const {transaction}=require('./transaction');
const creation=require('./creation');
const {buildRows,persistRevisionRows}=require('./submissions');
const {approvalPlan,createRequests}=require('./approvals');

async function currentScope(db,scope){
 if(scope.packageRevise!==true)fail('FORBIDDEN',403);
 const u=(await db.query(`SELECT u.role,u.firm_staff_role_id,u.law_firm_tenant_id,r.permissions,r.is_active,r.law_firm_tenant_id AS role_tenant,
 EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id=u.userid AND a.is_active) AS platform_admin
 FROM signing_owner_contexts c JOIN users u ON u.userid=$2 AND u.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
 LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id WHERE c.id=$1`,[scope.contextId,scope.userId])).rows[0];
 if(!u||!['Admin','Lawyer','Staff'].includes(u.role))fail('FORBIDDEN',403);
 if(u.platform_admin)return scope;
 if(!u.firm_staff_role_id){if(!['Admin','Lawyer'].includes(u.role))fail('FORBIDDEN',403);return scope;}
 const p=normalizeRolePermissions(u.permissions);
 if(!u.is_active||String(u.role_tenant||'')!==String(u.law_firm_tenant_id||'')||!['view','manage','upload','package_revision_create'].every(a=>hasAreaAction(p,'signing',a)))fail('FORBIDDEN',403);
 return {...scope,all:scope.all&&getSigningDataScope(p)==='all_firm',assignedCases:scope.assignedCases&&p.areas?.signing?.legacyCaseAssignment===true};
}
async function load(db,scope,id,lock=false){
 expect(UUID.test(id||''),'INVALID_ACTION');let current=await currentScope(db,scope);
 const pkg=(await db.query(`SELECT p.*,p.version AS package_version,r.id AS revision_id,r.revision_no,r.version AS revision_version,r.workflow_state,r.snapshot,r.revision_hash,r.deadline,
 COALESCE(r.template_version_id,s.template_version_id) AS template_version_id FROM signing_packages p
 JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
 LEFT JOIN signing_submissions s ON s.owner_context_id=p.owner_context_id AND s.id=p.submission_id
 WHERE ${packageScopeSql('p')} AND p.id=$5 ${lock?'FOR UPDATE OF p,r':''}`,[...scopeParams(current),id])).rows[0];
 if(!pkg)fail('NOT_FOUND',404);
 if(lock){current=await currentScope(db,scope);if(!(await db.query(`SELECT 1 FROM signing_packages p WHERE ${packageScopeSql('p')} AND p.id=$5`,[...scopeParams(current),id])).rowCount)fail('NOT_FOUND',404);}
 return {pkg,current};
}
const reasonFor=input=>{expect(typeof input.reason==='string'&&input.reason.trim().length>0&&input.reason.length<=1000,'REASON_REQUIRED');return input.reason.trim();};
function cas(pkg,input){if(pkg.revision_id!==input.expectedRevisionId||pkg.package_version!==input.expectedPackageVersion)fail('VERSION_CHANGED',412);}
async function taskState(db,scope,pkg){return(await db.query('SELECT id,state,version FROM signing_tasks WHERE owner_context_id=$1 AND revision_id=$2 ORDER BY id',[scope.contextId,pkg.revision_id])).rows;}
async function profileState(db,scope,pkg){return(await db.query('SELECT id,version,endpoints_snapshot,policy_snapshot FROM signing_delivery_profiles WHERE owner_context_id=$1 AND revision_id=$2 ORDER BY id',[scope.contextId,pkg.revision_id])).rows;}
async function initialContent(db,scope,pkg){
 const v=(await db.query('SELECT definition FROM signing_template_versions WHERE owner_context_id=$1 AND id=$2',[scope.contextId,pkg.template_version_id])).rows[0];if(!v)fail('NOT_FOUND',404);
 const def=v.definition,profiles=(await db.query('SELECT person_id,endpoints_snapshot,policy_snapshot FROM signing_delivery_profiles WHERE owner_context_id=$1 AND revision_id=$2',[scope.contextId,pkg.revision_id])).rows;
 const recipients={};for(const role of def.roles){const people=pkg.snapshot.participants.filter(p=>p.roleKey===role.key).sort((a,b)=>a.occurrence-b.occurrence).map(p=>{
 const profile=profiles.find(v=>v.person_id===p.personId),e=profile?.endpoints_snapshot||{},policy=profile?.policy_snapshot||{};
 return {personId:p.personId,name:p.identity.name,locale:policy.locale||pkg.snapshot.locale,channel:(policy.channels||[]).length===2?'both':policy.channels?.[0]||'email',...(e.email?{email:e.email}:{}),...(e.phone?{phone:e.phone}:{}),...(p.capacity==='representative'?{partyId:p.partyId,authorityId:p.authorityId,partyName:p.identity.partyName,authorityVersion:p.authorityVersion}: {})};});
 if(people.length)recipients[role.key]={people};}
 const keys=new Map(def.dataKeys.map(k=>[k.key,k]));
 const omittedRoles=def.roles.filter(r=>!recipients[r.key]&&conditionMatches(r.when,pkg.snapshot.data,keys)).map(r=>r.key);
 const groups=pkg.snapshot.stages.map((_,i)=>pkg.snapshot.participants.filter(p=>p.stage===i).map(p=>p.roleKey)).map(g=>[...new Set(g)]).filter(g=>g.length);
 // Participant snapshots do not store stage; tasks provide the published role order.
 if(!groups.length){for(let i=0;i<pkg.snapshot.stages.length;i++){const g=[...new Set(pkg.snapshot.tasks.filter(t=>t.stage===i).map(t=>t.roleKey))];if(g.length)groups.push(g);}}
 const missing=def.roles.filter(r=>!omittedRoles.includes(r.key)&&!groups.flat().includes(r.key)).map(r=>r.key);if(missing.length){if(groups.length)groups[0].push(...missing);else groups.push(missing);}
 const content={name:pkg.external_key,templateVersionId:pkg.template_version_id,roleAudience:Object.fromEntries(def.roles.map(r=>[r.key,'each'])),shared:{},rows:[{key:pkg.external_key,data:pkg.snapshot.data,recipients}],omittedRoles,
 ...(groups.length?{signingOrder:{mode:'grouped',groups}}:{}),...(pkg.case_id?{caseId:pkg.case_id}:{}),...(pkg.client_userid?{clientId:pkg.client_userid}:{}),...(pkg.deadline?{deadline:new Date(pkg.deadline).toISOString()}: {})};
 return {content,template:{versionId:pkg.template_version_id,name:def.name,roles:def.roles,dataKeys:def.dataKeys,documents:def.documents.map(d=>({key:d.key,name:d.name})),approvalRequired:def.policy.internalApproval||def.policy.requiredAllPdfReview,soloApproval:def.policy.soloApproval===true}};
}
async function history(db,scope,id){const evidence=new Set((await db.query("SELECT inputs_hash FROM signing_artifacts WHERE owner_context_id=$1 AND kind='evidence' AND state='ready'",[scope.contextId])).rows.map(a=>a.inputs_hash));return(await db.query(`SELECT r.id AS "revisionId",r.revision_no AS "revisionNumber",r.workflow_state AS state,r.created_at AS "createdAt",r.replaces_revision_id AS "replacesRevisionId",
 (SELECT count(*)::int FROM signing_tasks t WHERE t.owner_context_id=r.owner_context_id AND t.revision_id=r.id AND t.state='accepted') AS "acceptedCount",
 (SELECT reason FROM signing_replacement_drafts rd WHERE rd.owner_context_id=r.owner_context_id AND rd.replacement_revision_id=r.id) AS reason,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'final',d.final_artifact_id IS NOT NULL) ORDER BY d.document_key) FROM signing_documents d WHERE d.owner_context_id=r.owner_context_id AND d.revision_id=r.id),'[]') AS documents,
 r.revision_hash FROM signing_package_revisions r WHERE r.owner_context_id=$1 AND r.package_id=$2 ORDER BY r.revision_no DESC`,[scope.contextId,id])).rows.map(r=>{const {revision_hash,...rest}=r;return {...rest,evidence:evidence.has(digest({revisionId:r.revisionId,revisionHash:revision_hash,kind:'evidence'}))};});}
async function readView(db,scope,pkg){
 const draft=(await db.query("SELECT * FROM signing_replacement_drafts WHERE owner_context_id=$1 AND package_id=$2 AND source_revision_id=$3 AND state='draft'",[scope.contextId,pkg.id,pkg.revision_id])).rows[0];
 const initial=await initialContent(db,scope,pkg),tasks=await taskState(db,scope,pkg),profiles=await profileState(db,scope,pkg);
 return {packageId:pkg.id,revisionId:pkg.revision_id,packageVersion:pkg.package_version,revisionVersion:pkg.revision_version,expectedPackageVersion:pkg.package_version,expectedRevisionId:pkg.revision_id,
 templateVersionId:pkg.template_version_id,sourceState:pkg.workflow_state,reasonRequired:true,acceptedCount:tasks.filter(t=>t.state==='accepted').length,stopDefault:true,
 sourceReviewHash:digest({revisionId:pkg.revision_id,packageVersion:pkg.package_version,revisionVersion:pkg.revision_version,tasks,profiles}),...initial,stopCurrent:draft?.stop_current??true,content:draft?.content||initial.content,reason:draft?.reason||'',replacementDraftId:draft?.id||null,history:await history(db,scope,pkg.id)};
}
async function readReplacement(db,scope,id){const{pkg,current}=await load(db,scope,id);return readView(db,current,pkg);}
async function invalidateSessions(db,scope,revisionId){await db.query(`UPDATE signing_sessions_v2 SET revoked_at=clock_timestamp() WHERE owner_context_id=$1 AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(exact_manifest->'items') item WHERE item->>'revisionId'=$2)`,[scope.contextId,revisionId]);}
async function replay(db,scope,kind,input,requestHash){const r=(await db.query('SELECT request_hash,result FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4',[scope.contextId,`user:${scope.userId}`,kind,input.idempotencyKey])).rows[0];if(r){if(r.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT',409);return {...r.result,reused:true};}return null;}
async function receipt(db,scope,kind,input,requestHash,result){await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at) VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp())`,[randomUUID(),scope.contextId,`user:${scope.userId}`,kind,input.idempotencyKey,requestHash,result]);return {...result,reused:false};}
async function startReplacement(pool,scope,id,input){
 const reason=reasonFor(input);expect(UUID.test(input.idempotencyKey||''),'INVALID_ACTION');expect(input.stopCurrent===undefined||typeof input.stopCurrent==='boolean','INVALID_ACTION');
 const stop=input.stopCurrent!==false,kind='replacement_start',hash=digest({id,reason,stop,expectedRevisionId:input.expectedRevisionId,expectedPackageVersion:input.expectedPackageVersion,sourceReviewHash:input.sourceReviewHash});
 return transaction(pool,async db=>{
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${kind}:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
 const{pkg,current}=await load(db,scope,id,true),old=await replay(db,current,kind,input,hash);if(old)return old;cas(pkg,input);
 const source=await readView(db,current,pkg);if(input.sourceReviewHash!==source.sourceReviewHash)fail('VERSION_CHANGED',412);
 expect(pkg.workflow_state!=='superseded','REVISION_INACTIVE');
 const exists=(await db.query("SELECT id,stop_current FROM signing_replacement_drafts WHERE owner_context_id=$1 AND package_id=$2 AND source_revision_id=$3 AND state='draft'",[scope.contextId,id,pkg.revision_id])).rows[0];
 if(exists){
  if(!stop&&exists.stop_current)fail('REVISION_INACTIVE',409);
  if(stop&&!exists.stop_current){
   await db.query("UPDATE signing_package_revisions SET workflow_state='replacement_pending',version=version+1 WHERE owner_context_id=$1 AND id=$2",[current.contextId,pkg.revision_id]);
   await invalidateSessions(db,current,pkg.revision_id);
   await db.query('UPDATE signing_packages SET version=version+1 WHERE owner_context_id=$1 AND id=$2',[current.contextId,id]);
   await db.query('UPDATE signing_replacement_drafts SET stop_current=true WHERE owner_context_id=$1 AND id=$2',[current.contextId,exists.id]);
   await db.query("INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'replacement_stopped',$4)",[current.contextId,id,'user:'+current.userId,{revisionId:pkg.revision_id,reason}]);
  }
  return receipt(db,current,kind,input,hash,{...(await readView(db,current,(await load(db,current,id)).pkg)),state:'replacement_pending'});
 }

 const{content}=await initialContent(db,current,pkg);const draftId=randomUUID();
 await db.query('INSERT INTO signing_replacement_drafts(id,owner_context_id,package_id,source_revision_id,created_by,reason,source_state,stop_current,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[draftId,current.contextId,id,pkg.revision_id,current.userId,reason,pkg.workflow_state,stop,content]);
 if(stop){await db.query("UPDATE signing_package_revisions SET workflow_state='replacement_pending',version=version+1 WHERE owner_context_id=$1 AND id=$2",[current.contextId,pkg.revision_id]);await invalidateSessions(db,current,pkg.revision_id);}
 await db.query('UPDATE signing_packages SET version=version+1 WHERE owner_context_id=$1 AND id=$2',[current.contextId,id]);
 await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'replacement_started',$4)`,[current.contextId,id,`user:${current.userId}`,{revisionId:pkg.revision_id,reason,stopCurrent:stop,draftId}]);
 const updated=(await load(db,current,id)).pkg;return receipt(db,current,kind,input,hash,{...(await readView(db,current,updated)),state:'replacement_pending'});
 });
}
function singleContent(pkg,input){expect(input.content&&Array.isArray(input.content.rows)&&input.content.rows.length===1,'INVALID_ROWS');
 const content={...input.content,caseId:pkg.case_id,clientId:pkg.client_userid};expect(content.rows[0].key===pkg.external_key,'INVALID_ROWS');return content;}
async function review(db,scope,pkg,input){cas(pkg,input);const reason=reasonFor(input),content=singleContent(pkg,input),tasks=await taskState(db,scope,pkg),profiles=await profileState(db,scope,pkg);
 const preview=await creation.previewCreation(db,scope,content);return {...preview,creationPreviewHash:preview.previewHash,previewHash:preview.valid?digest({packageId:pkg.id,revisionId:pkg.revision_id,packageVersion:pkg.package_version,revisionVersion:pkg.revision_version,revisionHash:pkg.revision_hash,tasks,profiles,reason,creationPreviewHash:preview.previewHash}):null,
 packageId:pkg.id,expectedRevisionId:pkg.revision_id,expectedPackageVersion:pkg.package_version,acceptedCount:tasks.filter(t=>t.state==='accepted').length};}
async function previewReplacement(db,scope,id,input){const{pkg,current}=await load(db,scope,id);return review(db,current,pkg,input);}
async function executeReplacement(pool,scope,id,input,{reserveCapacity}={}){
 expect(UUID.test(input.idempotencyKey||''),'INVALID_ACTION');expect(typeof reserveCapacity==='function','CAPACITY_ADAPTER_REQUIRED');const reason=reasonFor(input),kind='package_replacement',hash=digest({id,...input});
 return transaction(pool,async db=>{
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${kind}:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
 const{pkg,current}=await load(db,scope,id,true),old=await replay(db,current,kind,input,hash);if(old)return old;
 const draft=(await db.query("SELECT id FROM signing_replacement_drafts WHERE owner_context_id=$1 AND package_id=$2 AND source_revision_id=$3 AND state='draft'",[current.contextId,id,pkg.revision_id])).rows[0];expect(draft,'REPLACEMENT_DRAFT_REQUIRED');
 const preview=await review(db,current,pkg,input);if(!preview.valid||preview.previewHash!==input.previewHash)fail('PREVIEW_CHANGED',412);
 const content=singleContent(pkg,input);
 return creation.createFromRowsInTransaction(db,current,{...content,previewHash:preview.creationPreviewHash,idempotencyKey:input.idempotencyKey},{reserveCapacity,persistRevision:async({template,definition,packages,compiled,plan})=>{
 const approval=await approvalPlan(db,current,definition.policy,plan.reviewerUserId),capacity=admission(compiled);await reserveCapacity(db,current,capacity,pkg.submission_id);
 const rows=buildRows(packages,compiled);rows.packages[0].id=id;rows.revisions[0].package_id=id;
 const revisionId=rows.revisions[0].id;await persistRevisionRows(db,current,rows,{revisionNo:pkg.revision_no+1,replacesRevisionId:pkg.revision_id,templateVersionId:template.id,authorizedBy:current.userId});
 await createRequests(db,current,rows,approval);
 await db.query("UPDATE signing_package_revisions SET workflow_state='superseded',version=version+1 WHERE owner_context_id=$1 AND id=$2",[current.contextId,pkg.revision_id]);
 await invalidateSessions(db,current,pkg.revision_id);
 await db.query('UPDATE signing_packages SET active_revision_id=$3,version=version+1 WHERE owner_context_id=$1 AND id=$2',[current.contextId,id,revisionId]);
 await db.query("UPDATE signing_replacement_drafts SET state='published',replacement_revision_id=$3,reason=$4,content=$5,document_count=$6,published_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2",[current.contextId,draft.id,revisionId,reason,content,capacity.documents]);
 const result={packageId:id,revisionId,replacedRevisionId:pkg.revision_id,revisionNumber:pkg.revision_no+1,submissionId:pkg.submission_id,state:'authorized_preparing',durable:true};
 await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'package_replaced',$4)`,[current.contextId,id,`user:${current.userId}`,{...result,reason,previewHash:input.previewHash}]);
 return receipt(db,current,kind,input,hash,result);
 }});
 });
}
module.exports={readReplacement,startReplacement,previewReplacement,executeReplacement,history,currentScope};

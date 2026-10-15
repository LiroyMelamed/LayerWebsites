const test=require('node:test'),assert=require('node:assert/strict');
const {databaseFixture}=require('./helpers/signingV2Fixture');
const templates=require('../services/signingV2/templates');
const creation=require('../services/signingV2/creation');
test('new internal approval publication is explicit and solo is administrator-only',{skip:process.env.LEGAL_DB_QA!=='true'},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());const f=await databaseFixture(pool,{documentCount:1});
 const definition={...f.definition,policy:{...f.definition.policy,internalApproval:true,soloApproval:true}};
 const draft=await templates.createDraft(pool,f.scope,{definition});await pool.query("UPDATE users SET role='Lawyer' WHERE userid=$1",[f.scope.userId]);
 await assert.rejects(templates.publish(pool,f.scope,draft.template_id,draft.id,draft.edit_version,draft.definition_hash),{errorCode:'SOLO_PROFILE_ADMIN_REQUIRED'});
 await pool.query("UPDATE users SET role='Admin' WHERE userid=$1",[f.scope.userId]);const published=await templates.publish(pool,f.scope,draft.template_id,draft.id,draft.edit_version,draft.definition_hash);assert.equal(published.definition.policy.soloApproval,true);
 const catalog=await creation.listTemplates(pool,f.scope);const entry=catalog.templates.find(v=>v.versionId===published.id);assert.equal(entry.approvalRequired,true);assert.equal(entry.soloApproval,true);
 const input={templateVersionId:published.id,name:'Explicit solo from composer',rows:[{key:'one',data:{employeeId:'000000123'},recipients:{employee:{name:'Recipient',email:'new-approval@example.invalid',channel:'email'}}}]};
 const missing=await creation.previewCreation(pool,f.scope,input);assert.equal(missing.valid,false);assert.ok(missing.errors.some(e=>e.code==='APPROVER_REQUIRED'));
 input.reviewerUserId=f.scope.userId;const preview=await creation.previewCreation(pool,f.scope,input);assert.equal(preview.valid,true,JSON.stringify(preview.errors));assert.equal(preview.approval.reviewerId,f.scope.userId);
 const result=await creation.createFromRows(pool,f.scope,{...input,previewHash:preview.previewHash,idempotencyKey:require('node:crypto').randomUUID()},{reserveCapacity:async()=>{}});assert.equal(result.durable,true);
 assert.equal((await pool.query('SELECT count(*)::int n FROM signing_approval_requests WHERE owner_context_id=$1 AND reviewer_userid=$2',[f.contextId,f.scope.userId])).rows[0].n,1);
});
test('new reviewer database failure reaches operational error handling instead of being labelled missing input',{skip:process.env.LEGAL_DB_QA!=='true'},async t=>{
 const pool=require('../config/db');t.after(()=>pool.end());const f=await databaseFixture(pool,{documentCount:1,configure:({definition})=>({...definition,policy:{...definition.policy,internalApproval:true}})});
 const failure=Object.assign(new Error('Synthetic reviewer query failure'),{code:'08006'});
 const db={query:(sql,args)=>String(sql).includes('FROM signing_owner_contexts c JOIN users u')?Promise.reject(failure):pool.query(sql,args)};
 await assert.rejects(creation.previewCreation(db,f.scope,{name:'New approval failure',templateVersionId:f.versionId,reviewerUserId:f.scope.userId,rows:[{key:'one',data:{employeeId:'123'},recipients:{employee:{name:'Recipient',email:'error@example.invalid',channel:'email'}}}]}),error=>error===failure);
});

const { randomUUID } = require('node:crypto');
const { digest } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { fail, expect } = require('../../lib/signingV2/errors');
const { normalizeRolePermissions, hasAreaAction, getSigningDataScope } = require('../../lib/firmRolePermissions');
const { packageScopeSql, scopeParams } = require('./access');
const { transaction } = require('./transaction');
const { preparedManifest } = require('./workflow');
const { assertCurrentAuthorities } = require('./authorities');

const needsApproval = policy => policy?.internalApproval === true || policy?.requiredAllPdfReview === true;

async function eligibleReviewers(db, scope) {
    const rows=(await db.query(`SELECT u.userid AS id,u.name,u.role,u.firm_staff_role_id,r.permissions,r.is_active,
        r.law_firm_tenant_id AS role_tenant,u.law_firm_tenant_id
        FROM signing_owner_contexts c JOIN users u ON u.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
        LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id
        WHERE c.id=$1 AND u.role IN ('Admin','Lawyer','Staff') ORDER BY u.name,u.userid`,[scope.contextId])).rows;
    return rows.filter(u=>u.firm_staff_role_id
        ? u.is_active && String(u.role_tenant||'')===String(u.law_firm_tenant_id||'') && ['view','package_approve'].every(a=>hasAreaAction(normalizeRolePermissions(u.permissions),'signing',a))
        : ['Admin','Lawyer'].includes(u.role));
}
async function approvers(db, scope) {
    return (await eligibleReviewers(db,scope)).map(u=>({id:u.id,name:u.name,self:u.id===scope.userId}));
}
async function currentReviewerScope(db,scope) {
    if(scope.packageApprove!==true)fail('FORBIDDEN',403);
    const user=(await eligibleReviewers(db,scope)).find(u=>u.id===scope.userId);
    if(!user)fail('FORBIDDEN',403);
    if(!user.firm_staff_role_id)return scope;
    const permissions=normalizeRolePermissions(user.permissions);
    return {...scope,all:scope.all && getSigningDataScope(permissions)==='all_firm',
        assignedCases:scope.assignedCases && permissions.areas?.signing?.legacyCaseAssignment===true};
}

async function approvalPlan(db, scope, policy, reviewerId) {
    if (!needsApproval(policy)) {
        expect(reviewerId==null,'APPROVAL_NOT_REQUIRED');
        return null;
    }
    expect(Number.isSafeInteger(reviewerId) && reviewerId>0,'APPROVER_REQUIRED');
    const reviewer=(await approvers(db,scope)).find(u=>u.id===reviewerId);
    expect(reviewer,'APPROVER_UNAVAILABLE');
    const solo=reviewerId===scope.userId;
    expect(!solo || policy.soloApproval===true,'SEPARATE_APPROVER_REQUIRED');
    return {reviewerId,preparerId:scope.userId,soloProfile:solo,name:reviewer.name};
}

async function createRequests(db, scope, rows, plan) {
    if(!plan)return;
    await db.query(`INSERT INTO signing_approval_requests(owner_context_id,revision_id,preparer_userid,reviewer_userid,solo_profile)
        SELECT $1,id,$2,$3,$4 FROM jsonb_to_recordset($5::jsonb) AS r(id uuid)`,[scope.contextId,plan.preparerId,plan.reviewerId,plan.soloProfile,JSON.stringify(rows.revisions)]);
    // Assignment is explicit in the sending review. It grants this package's
    // data scope only; the review action still needs live package_approve.
    await db.query(`INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id)
        SELECT $1,id,$2 FROM jsonb_to_recordset($3::jsonb) AS p(id uuid) ON CONFLICT DO NOTHING`,[scope.contextId,plan.reviewerId,JSON.stringify(rows.packages)]);
}

async function loadReview(db, scope, packageId, lock=false) {
    let current=await currentReviewerScope(db,scope);
    expect(UUID.test(packageId||''),'INVALID_ACTION');
    const revision=(await db.query(`SELECT r.*,p.external_key,p.owner_userid FROM signing_packages p
        JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE ${packageScopeSql('p')} AND p.id=$5 ${lock?'FOR UPDATE OF p,r':''}`,[...scopeParams(current),packageId])).rows[0];
    if(!revision)fail('NOT_FOUND',404);
    const request=(await db.query(`SELECT a.*,u.name AS preparer_name FROM signing_approval_requests a JOIN users u ON u.userid=a.preparer_userid
        WHERE a.owner_context_id=$1 AND a.revision_id=$2`,[scope.contextId,revision.id])).rows[0];
    if(!request || request.reviewer_userid!==scope.userId)fail('NOT_FOUND',404);
    if(lock)current=await currentReviewerScope(db,scope);
    // Current assignment may have been removed while the request waited.
    if(!(await db.query(`SELECT 1 FROM signing_packages p WHERE ${packageScopeSql('p')} AND p.id=$5`,[...scopeParams(current),packageId])).rowCount)fail('NOT_FOUND',404);
    return {revision,request};
}

async function reviewView(db, scope, revision, request) {
    const ready=revision.workflow_state==='awaiting_approval' && request.state==='pending';
    const prepared=ready?await preparedManifest(db,revision):null;
    const documents=prepared?prepared.documents.map(d=>({id:d.id,name:d.name,hash:d.content_sha256,artifactId:d.prepared_artifact_id})):[];
    const stateHash=digest({revisionId:revision.id,revisionHash:revision.revision_hash,previewHash:prepared?.previewHash||null,
        revisionVersion:revision.version,requestVersion:request.version,state:request.state,reviewerId:request.reviewer_userid});
    return {packageId:revision.package_id,name:revision.external_key,revisionId:revision.id,state:request.state,
        ready,preparer:request.preparer_name,soloProfile:request.solo_profile,reason:request.reason,documents,reviewHash:stateHash};
}
async function readReview(db, scope, packageId) {
    const {revision,request}=await loadReview(db,scope,packageId);
    return reviewView(db,scope,revision,request);
}

async function decide(pool, scope, packageId, input) {
    expect(['approve','return'].includes(input.action) && UUID.test(input.idempotencyKey||'') && /^[a-f0-9]{64}$/.test(input.reviewHash||''),'INVALID_ACTION');
    expect(input.action!=='return' || (typeof input.reason==='string' && input.reason.trim().length>0 && input.reason.length<=1000),'REASON_REQUIRED');
    const reason=input.action==='return'?input.reason.trim():null,documents=input.action==='approve'?input.documents:null;
    if(input.action==='approve')expect(Array.isArray(documents) && input.reviewed===true,'PDF_REVIEW_REQUIRED');
    const actor=`user:${scope.userId}`,kind='package_approval',requestHash=digest({packageId,action:input.action,reviewHash:input.reviewHash,reason,documents});
    return transaction(pool,async db=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${kind}:${scope.contextId}:${actor}:${input.idempotencyKey}`]);
        const {revision,request}=await loadReview(db,scope,packageId,true);
        const previous=(await db.query(`SELECT request_hash,result FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4`,[scope.contextId,actor,kind,input.idempotencyKey])).rows[0];
        if(previous){if(previous.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT',409);return {...previous.result,reused:true};}
        const review=await reviewView(db,scope,revision,request);
        if(review.reviewHash!==input.reviewHash)fail('VERSION_CHANGED',412);
        expect(review.ready,'APPROVAL_NOT_READY');
        if(input.action==='approve'){
            expect(digest(documents)===digest(review.documents.map(d=>({id:d.id,hash:d.hash,artifactId:d.artifactId}))),'PDF_REVIEW_REQUIRED');
            expect(!request.solo_profile || revision.snapshot.policy.soloApproval===true,'SEPARATE_APPROVER_REQUIRED');
            expect(!revision.deadline || new Date(revision.deadline)>new Date(),'DEADLINE_EXPIRED');
            await assertCurrentAuthorities(db,scope.contextId,revision.id);
            await db.query(`INSERT INTO signing_approvals(id,owner_context_id,revision_id,revision_hash,preview_hash,preparer_userid,approver_userid,solo_profile)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),scope.contextId,revision.id,revision.revision_hash,revision.preview_hash,request.preparer_userid,scope.userId,request.solo_profile]);
        }
        const state=input.action==='approve'?'approved':'returned';
        await db.query(`UPDATE signing_approval_requests SET state=$3,reason=$4,version=version+1,decided_at=clock_timestamp() WHERE owner_context_id=$1 AND revision_id=$2`,[scope.contextId,revision.id,state,reason]);
        await db.query(`UPDATE signing_package_revisions SET workflow_state=$3,version=version+1 WHERE owner_context_id=$1 AND id=$2`,[scope.contextId,revision.id,input.action==='approve'?'authorized_preparing':'attention']);
        const result={packageId,revisionId:revision.id,state};
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,$4,$5)`,[scope.contextId,packageId,actor,`approval_${state}`,{...result,reason,previewHash:revision.preview_hash}]);
        await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at)
            VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp())`,[randomUUID(),scope.contextId,actor,kind,input.idempotencyKey,requestHash,result]);
        return {...result,reused:false};
    });
}
module.exports={needsApproval,approvers,approvalPlan,createRequests,readReview,decide,currentReviewerScope};

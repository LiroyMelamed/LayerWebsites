const { digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const limits = require('../../lib/signingV2/limits');
const { complete } = require('./jobs');
const { assertCurrentAuthorities } = require('./authorities');
const { packageScopeSql, scopeParams } = require('./access');

async function lockRevision(db,contextId,revisionId) {
    const result=await db.query(`SELECT r.*,p.owner_userid,p.case_id,p.active_revision_id,
        r.deadline IS NULL OR r.deadline > clock_timestamp() AS before_deadline
        FROM signing_package_revisions r JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
        WHERE r.owner_context_id=$1 AND r.id=$2 FOR UPDATE OF p,r`,[contextId,revisionId]);
    if(!result.rowCount) fail('NOT_FOUND',404);
    const revision=result.rows[0];
    expect(revision.active_revision_id===revision.id && !['cancelled','superseded','expired','draft'].includes(revision.workflow_state),'REVISION_INACTIVE');
    expect(revision.before_deadline,'DEADLINE_EXPIRED');
    expect(digest(revision.snapshot)===revision.revision_hash,'REVISION_CHANGED');
    return revision;
}

async function preparedManifest(db,revision) {
    const documents=(await db.query(`SELECT d.*,a.kind AS artifact_kind,a.content_sha256,a.bytes,a.state AS artifact_state,a.metadata
        FROM signing_documents d LEFT JOIN signing_artifacts a ON a.owner_context_id=d.owner_context_id AND a.id=d.prepared_artifact_id
        WHERE d.owner_context_id=$1 AND d.revision_id=$2 ORDER BY d.document_key`,[revision.owner_context_id,revision.id])).rows;
    expect(documents.length===revision.snapshot.documents.length,'PREFLIGHT_MISMATCH');
    let bytes=0,pages=0;
    for(const document of documents) {
        const source=revision.snapshot.documents.find(item=>item.key===document.document_key);
        expect(source && document.source_artifact_id===source.sourceArtifactId
            && digest(document.field_bindings)===digest(source.fields) && document.informational===source.informational,'PREFLIGHT_MISMATCH');
        expect(document.state==='ready' && document.artifact_kind==='prepared' && document.artifact_state==='ready','ARTIFACT_NOT_READY');
        expect(document.metadata.sourceHash===source.sourceHash && Array.isArray(document.metadata.pages)
            && document.metadata.pages.length===source.pages.length,'PREFLIGHT_MISMATCH');
        bytes+=Number(document.bytes);pages+=document.metadata.pages.length;
    }
    expect(bytes>0 && bytes<=limits.outputBytes && pages<=limits.outputPages,'CAPACITY_BUDGET_EXCEEDED');
    const participants=(await db.query(`SELECT * FROM signing_participations WHERE owner_context_id=$1 AND revision_id=$2 ORDER BY role_key,occurrence`,
        [revision.owner_context_id,revision.id])).rows;
    expect(participants.length===revision.snapshot.participants.length,'PREFLIGHT_MISMATCH');
    for(const participant of participants) {
        const frozen=revision.snapshot.participants.find(item=>item.roleKey===participant.role_key && item.occurrence===participant.occurrence);
        expect(frozen && frozen.personId===participant.person_id && frozen.partyId===participant.represented_party_id
            && frozen.capacity===participant.capacity && frozen.authorityId===participant.authority_id
            && frozen.authorityVersion===participant.authority_version && digest(frozen.identity)===digest(participant.identity_snapshot),'PREFLIGHT_MISMATCH');
    }
    const tasks=(await db.query(`SELECT t.*,d.document_key,p.role_key,p.occurrence FROM signing_tasks t
        JOIN signing_documents d ON d.owner_context_id=t.owner_context_id AND d.id=t.document_id
        JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
        WHERE t.owner_context_id=$1 AND t.revision_id=$2 ORDER BY d.document_key,p.role_key,p.occurrence`,[revision.owner_context_id,revision.id])).rows;
    expect(tasks.length===revision.snapshot.tasks.length && tasks.some(task=>task.required),'PREFLIGHT_MISMATCH');
    expect(tasks.every(task=>task.state==='blocked' && task.stage_artifact_id===null),'PREFLIGHT_MISMATCH');
    for(const task of tasks) {
        const frozen=revision.snapshot.tasks.find(item=>item.documentKey===task.document_key && item.roleKey===task.role_key && item.occurrence===task.occurrence);
        expect(frozen && frozen.stage===task.stage && frozen.required===task.required && digest(frozen.fieldIds)===digest(task.field_ids),'PREFLIGHT_MISMATCH');
    }
    const manifest={revisionId:revision.id,revisionHash:revision.revision_hash,documents:documents.map(doc=>({
        documentId:doc.id,artifactId:doc.prepared_artifact_id,contentHash:doc.content_sha256,bytes:Number(doc.bytes),pages:doc.metadata.pages.length,
    }))};
    return {manifest,previewHash:digest(manifest),documents,tasks};
}

function createWorkflowService({pool,authorizeActivation,grantService}) {
    expect(typeof authorizeActivation==='function' && typeof grantService?.issueRevisionGrants==='function','WORKFLOW_ADAPTER_REQUIRED');
    async function validatePackage(lease) {
        expect(lease.kind==='validate_package','INVALID_JOB');
        return complete(pool,lease,async db=>{
            const revision=await lockRevision(db,lease.owner_context_id,lease.subject_id);
            expect(lease.input_hash===revision.revision_hash,'REVISION_CHANGED');
            expect(['authorized_preparing','awaiting_approval'].includes(revision.workflow_state),'REVISION_INACTIVE');
            const prepared=await preparedManifest(db,revision);
            await assertCurrentAuthorities(db,revision.owner_context_id,revision.id);
            await db.query(`INSERT INTO signing_preflights(owner_context_id,revision_id,revision_hash,preview_hash,manifest)
                VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[revision.owner_context_id,revision.id,revision.revision_hash,prepared.previewHash,prepared.manifest]);
            const existing=(await db.query(`SELECT preview_hash FROM signing_preflights WHERE owner_context_id=$1 AND revision_id=$2`,[revision.owner_context_id,revision.id])).rows[0];
            expect(existing.preview_hash===prepared.previewHash,'PREVIEW_CHANGED');
            await db.query('UPDATE signing_package_revisions SET preview_hash=$3 WHERE owner_context_id=$1 AND id=$2',
                [revision.owner_context_id,revision.id,prepared.previewHash]);
            if (revision.snapshot.policy.internalApproval || revision.snapshot.policy.requiredAllPdfReview) {
                await db.query("UPDATE signing_approval_requests SET state='pending',version=version+1 WHERE owner_context_id=$1 AND revision_id=$2 AND state='preparing'",[revision.owner_context_id,revision.id]);
                await db.query("UPDATE signing_package_revisions SET workflow_state='awaiting_approval',version=version+1 WHERE owner_context_id=$1 AND id=$2",[revision.owner_context_id,revision.id]);
            }
            return {previewHash:prepared.previewHash,documentsReady:prepared.documents.length};
        });
    }
    async function activatePackage(lease) {
        expect(lease.kind==='activate_package','INVALID_JOB');
        return complete(pool,lease,async db=>{
            const revision=await lockRevision(db,lease.owner_context_id,lease.subject_id);
            expect(lease.input_hash===revision.revision_hash && revision.workflow_state==='authorized_preparing','REVISION_INACTIVE');
            // This adapter checks the current creator's permission, office policy
            // and feature availability, not the stale authorization from enqueue.
            await authorizeActivation(db,revision);
            const prepared=await preparedManifest(db,revision);
            const proof=(await db.query(`SELECT preview_hash FROM signing_preflights WHERE owner_context_id=$1 AND revision_id=$2 AND revision_hash=$3`,
                [revision.owner_context_id,revision.id,revision.revision_hash])).rows[0];
            expect(proof && proof.preview_hash===prepared.previewHash && revision.preview_hash===prepared.previewHash,'PREFLIGHT_REQUIRED');
            if(revision.snapshot.policy.internalApproval || revision.snapshot.policy.requiredAllPdfReview) {
                const approval=await db.query(`SELECT a.id,a.approver_userid FROM signing_approvals a
                    JOIN signing_approval_requests q ON q.owner_context_id=a.owner_context_id AND q.revision_id=a.revision_id
                    AND q.reviewer_userid=a.approver_userid AND q.state='approved'
                    WHERE a.owner_context_id=$1 AND a.revision_id=$2 AND a.revision_hash=$3 AND a.preview_hash=$4`,
                    [revision.owner_context_id,revision.id,revision.revision_hash,prepared.previewHash]);
                expect(approval.rowCount===1,'APPROVAL_REQUIRED');
                const scope=await require('./approvals').currentReviewerScope(db,{contextId:revision.owner_context_id,
                    userId:approval.rows[0].approver_userid,packageApprove:true,all:true,assignedCases:true});
                expect((await db.query(`SELECT 1 FROM signing_packages p WHERE ${packageScopeSql('p')} AND p.id=$5`,
                    [...scopeParams(scope),revision.package_id])).rowCount===1,'APPROVER_UNAVAILABLE');
            }
            await assertCurrentAuthorities(db,revision.owner_context_id,revision.id);
            const stage=Math.min(...prepared.tasks.map(task=>task.stage));
            // Every actor in a parallel stage sees this same immutable PDF. Their
            // actions are merged only when producing the next stage's artifact.
            await db.query(`UPDATE signing_tasks t SET state='ready',stage_artifact_id=d.prepared_artifact_id,version=t.version+1
                FROM signing_documents d WHERE t.owner_context_id=$1 AND t.revision_id=$2 AND t.stage=$3 AND t.state='blocked'
                    AND d.owner_context_id=t.owner_context_id AND d.id=t.document_id`,[revision.owner_context_id,revision.id,stage]);
            const result=await grantService.issueRevisionGrants(db,revision,prepared.documents);
            await db.query(`UPDATE signing_package_revisions SET workflow_state='active',version=version+1 WHERE owner_context_id=$1 AND id=$2`,[revision.owner_context_id,revision.id]);
            await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details)
                VALUES($1,$2,'system:workflow','package_activated',$3)`,[revision.owner_context_id,revision.package_id,{revisionId:revision.id,previewHash:prepared.previewHash,stage}]);
            return {state:'active',stage,...result};
        });
    }
    return {validatePackage,activatePackage};
}

module.exports={createWorkflowService,lockRevision,preparedManifest};

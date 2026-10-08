const { randomUUID } = require('node:crypto');
const { digest } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');
const { packageScopeSql, scopeParams } = require('./access');
const { checkedSnapshot } = require('./selections');
const { evaluate } = require('./actions');
const { taskManifest } = require('./followupScope');
const { documentManifest } = require('./completedCopy');
const { transaction } = require('./transaction');

const PURPOSES = new Set(['reminder','resend','completed_copy']);
const CHANNELS = new Set(['email','sms']);

// All current rows are read from one MVCC statement. Each CTE is bounded by the
// selected authorized revisions; there is no application query per person/PDF.
async function loadTargets(db, scope, selection) {
    return (await db.query(`WITH picked AS MATERIALIZED (
        SELECT p.id,p.external_key,p.active_revision_id,r.revision_hash,r.workflow_state,r.deadline,
            r.deadline IS NULL OR r.deadline>clock_timestamp() AS before_deadline,r.snapshot,
            CASE WHEN $6::boolean AND ($7::boolean OR EXISTS(SELECT 1 FROM case_users cu WHERE cu.caseid=p.case_id AND cu.userid=$3))
                THEN (SELECT c.casename FROM cases c WHERE c.caseid=p.case_id) END AS case_name
        FROM signing_packages p JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE ${packageScopeSql('p')} AND p.id=ANY($5::uuid[])
    ), profiles AS MATERIALIZED (
        SELECT dp.* FROM signing_delivery_profiles dp JOIN picked p ON p.active_revision_id=dp.revision_id WHERE dp.owner_context_id=$1
    ), parts AS (
        SELECT p.revision_id,p.person_id,jsonb_agg(jsonb_build_object('id',p.id,'roleKey',p.role_key,'occurrence',p.occurrence,
            'capacity',p.capacity,'name',p.identity_snapshot->>'name','partyName',p.identity_snapshot->>'partyName') ORDER BY p.role_key,p.occurrence) AS participations
        FROM signing_participations p JOIN picked x ON x.active_revision_id=p.revision_id WHERE p.owner_context_id=$1 GROUP BY p.revision_id,p.person_id
    ), tasks AS (
        SELECT t.revision_id,p.person_id,jsonb_agg(jsonb_build_object('taskId',t.id,'documentId',t.document_id,
            'documentName',d.name,'version',t.version,'stage',t.stage,'state',t.state,'required',t.required) ORDER BY t.id) AS tasks
        FROM picked x JOIN signing_tasks t ON t.owner_context_id=$1 AND t.revision_id=x.active_revision_id
        JOIN signing_participations p ON p.owner_context_id=$1 AND p.id=t.participation_id
        JOIN signing_documents d ON d.owner_context_id=$1 AND d.id=t.document_id GROUP BY t.revision_id,p.person_id
    ), history AS (
        SELECT d.profile_id,jsonb_agg(jsonb_build_object('purpose',d.purpose,'channel',d.channel,'state',d.state,'createdAt',d.created_at,
            'attemptedAt',d.attempted_at,'providerAcceptedAt',d.provider_accepted_at) ORDER BY d.created_at DESC,d.id) AS deliveries
        FROM profiles dp JOIN signing_deliveries d ON d.owner_context_id=$1 AND d.profile_id=dp.id GROUP BY d.profile_id
    ), links AS (
        SELECT DISTINCT ON (i.revision_id,g.person_id) i.revision_id,g.person_id,g.id AS grant_id
        FROM profiles dp JOIN signing_grant_items i ON i.owner_context_id=$1 AND i.delivery_profile_id=dp.id
        JOIN signing_public_grants g ON g.owner_context_id=$1 AND g.id=i.grant_id AND g.person_id=dp.person_id
        WHERE g.purpose='sign' AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AND i.delivery_profile_version=dp.version
        ORDER BY i.revision_id,g.person_id,g.created_at DESC,g.id
    ), documents AS (
        SELECT dp.id AS profile_id,jsonb_agg(jsonb_build_object('documentId',d.id,'documentName',d.name,
            'artifactId',d.final_artifact_id,'contentHash',a.content_sha256,'ready',(d.state='final' AND a.state='ready') IS TRUE) ORDER BY d.id) AS documents
        FROM profiles dp JOIN picked x ON x.active_revision_id=dp.revision_id
        CROSS JOIN LATERAL jsonb_array_elements(x.snapshot->'documents') source
        JOIN signing_documents d ON d.owner_context_id=$1 AND d.revision_id=dp.revision_id AND d.document_key=source->>'key'
        LEFT JOIN signing_artifacts a ON a.owner_context_id=$1 AND a.id=d.final_artifact_id
        WHERE source->'readPersonIds' ? dp.person_id::text GROUP BY dp.id
    ) SELECT x.id,x.external_key,x.active_revision_id,x.revision_hash,x.workflow_state,x.deadline,x.before_deadline,x.case_name,
        dp.person_id,to_jsonb(dp) AS profile,COALESCE(p.participations,'[]') AS participations,COALESCE(t.tasks,'[]') AS tasks,
        COALESCE(h.deliveries,'[]') AS deliveries,l.grant_id,COALESCE(d.documents,'[]') AS documents
        FROM picked x JOIN profiles dp ON dp.revision_id=x.active_revision_id
        LEFT JOIN parts p ON p.revision_id=dp.revision_id AND p.person_id=dp.person_id
        LEFT JOIN tasks t ON t.revision_id=dp.revision_id AND t.person_id=dp.person_id
        LEFT JOIN history h ON h.profile_id=dp.id LEFT JOIN links l ON l.revision_id=dp.revision_id AND l.person_id=dp.person_id
        LEFT JOIN documents d ON d.profile_id=dp.id ORDER BY x.id,dp.person_id`,
    [...scopeParams(scope),selection.items.map(item=>item.packageId),Boolean(scope.caseView),Boolean(scope.caseAll)])).rows;
}

function frozenReason(item,target,purpose) {
    if (item.revisionId!==target.active_revision_id || item.revisionHash!==target.revision_hash) return 'REVISION_CHANGED';
    const profile=item.profiles.find(profile=>profile.personId===target.person_id);
    if(!profile || profile.profileId!==target.profile.id || profile.version!==target.profile.version) return 'CONTACT_CHANGED';
    if(purpose==='completed_copy') return item.workflowState==='complete' ? null : 'COMPLETED_COPY_NOT_READY';
    const frozen=item.tasks.filter(task=>task.personId===target.person_id && task.state==='ready');
    if(frozen.length && frozen.every(task=>target.tasks.some(now=>now.taskId===task.taskId && now.state==='accepted'))) return 'ALREADY_COMPLETED';
    const current=target.tasks.filter(task=>task.state==='ready');
    if(digest(taskManifest(frozen))!==digest(taskManifest(current))) return 'ACTION_SCOPE_CHANGED';
    return null;
}

function buildPlan(selection,targets,input) {
    const frozen=new Map(selection.items.map(item=>[item.packageId,item]));
    const visible=new Set(targets.map(target=>target.id));
    const excluded=selection.items.filter(item=>!visible.has(item.packageId)).map(item=>({packageId:item.packageId,reason:'ACCESS_CHANGED'}));
    const groups=new Map();
    const considered=new Set(),people=new Set(),participations=new Set();
    for(const target of targets) {
        const item=frozen.get(target.id),personId=target.person_id;
        // A newly introduced profile or participant is never silently added.
        if(!item.profiles.some(profile=>profile.personId===personId)) continue;
        considered.add(target.id);people.add(personId);
        target.participations.forEach(part=>participations.add(part.id));
        if(!target.participations.length) { excluded.push({packageId:target.id,personId,reason:'ACTION_SCOPE_CHANGED'});continue; }
        const result=evaluate(target,{...input,personId}),{preview,channel,endpoint}=result;
        const reason=frozenReason(item,target,input.purpose) || preview.reason;
        const publicItem={packageId:target.id,personId,package:preview.package,recipient:preview.recipient,
            tasks:preview.tasks,documents:input.purpose==='completed_copy'?preview.documents:[],
            destination:preview.destination,lastInvitation:preview.lastInvitation,lastFollowUp:preview.lastFollowUp};
        if(reason) {
            excluded.push({...publicItem,reason,cooldownUntil:preview.cooldownUntil});continue;
        }
        const binding={packageId:target.id,revisionId:target.active_revision_id,revisionHash:target.revision_hash,personId,
            profileId:target.profile.id,profileVersion:target.profile.version,grantId:input.purpose==='completed_copy'?null:target.grant_id,
            deadline:target.deadline ? new Date(target.deadline).toISOString() : null,
            tasks:taskManifest(input.purpose==='completed_copy'?[]:target.tasks.filter(task=>task.state==='ready')),
            documents:input.purpose==='completed_copy'?documentManifest(target.documents):[],previewHash:preview.previewHash};
        // Equality includes the entire delivery policy, not just its first channel:
        // different scheduling/consent/locale policies cannot be merged accidentally.
        const groupKey=digest({contextId:selection.owner_context_id,personId,channel,endpoint,purpose:input.purpose,policy:target.profile.policy_snapshot});
        if(!groups.has(groupKey)) groups.set(groupKey,{groupKey,personId,channel,endpoint,policy:target.profile.policy_snapshot,
            destination:preview.destination,recipientName:preview.recipient.name,items:[]});
        groups.get(groupKey).items.push({binding,display:publicItem});
    }
    const messages=[...groups.values()].sort((a,b)=>a.groupKey.localeCompare(b.groupKey));
    const included=messages.flatMap(group=>group.items);
    return {purpose:input.purpose,channel:input.channel||null,selectionId:selection.id,selectionHash:selection.selection_hash,
        messages,excluded,counts:{selectedPackages:selection.items.length,visiblePackages:considered.size,
            selectedPeople:people.size,selectedParticipations:participations.size,
            packages:new Set(included.map(item=>item.binding.packageId)).size,
            people:new Set(messages.map(group=>group.personId)).size,
            participations:new Set(included.flatMap(item=>item.display.recipient.participations.map(part=>part.id))).size,
            documents:new Set(included.flatMap(item=>[...item.binding.tasks,...item.binding.documents].map(doc=>doc.documentId))).size,
            messages:messages.length,excluded:excluded.length}};
}

// Endpoints, policies, grants and hashes of individual private targets stay server
// side. The approval hash binds them without publishing any bearer capability.
function publicReview(row,plan,reused=false) {
    return {reviewId:row.id,previewHash:row.preview_hash,selectionId:row.selection_id,
        createdAt:row.created_at,expiresAt:row.expires_at,reused,purpose:plan.purpose,counts:plan.counts,
        messages:plan.messages.map(group=>({groupKey:group.groupKey,personId:group.personId,recipientName:group.recipientName,
            destination:group.destination,packages:group.items.map(item=>item.display)})),excluded:plan.excluded};
}

async function previewBulkAction(pool,scope,input) {
    expect(UUID.test(input.selectionId||'') && UUID.test(input.idempotencyKey||'') && PURPOSES.has(input.purpose),'INVALID_ACTION');
    expect(input.channel===undefined || input.channel===null || CHANNELS.has(input.channel),'INVALID_ACTION');
    const requestHash=digest({selectionId:input.selectionId,purpose:input.purpose,channel:input.channel||null});
    return transaction(pool,async db=>{
        const selection=await checkedSnapshot(db,scope,input.selectionId);
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`bulk-review:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
        const previous=(await db.query('SELECT * FROM signing_bulk_reviews WHERE owner_context_id=$1 AND created_by=$2 AND idempotency_key=$3',
            [scope.contextId,scope.userId,input.idempotencyKey])).rows[0];
        if(previous && previous.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT',409);
        const plan=buildPlan(selection,await loadTargets(db,scope,selection),input),previewHash=digest(plan);
        if(previous) {
            // Do not return stored names/contact/history after access or state drift.
            if(previous.preview_hash!==previewHash)fail('PREVIEW_CHANGED',412);
            return publicReview(previous,plan,true);
        }
        const row=(await db.query(`INSERT INTO signing_bulk_reviews(id,owner_context_id,created_by,selection_id,idempotency_key,
            request_hash,preview_hash,purpose,channel,plan,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [randomUUID(),scope.contextId,scope.userId,selection.id,input.idempotencyKey,requestHash,previewHash,input.purpose,input.channel||null,plan,selection.expires_at])).rows[0];
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,actor_key,kind,details) VALUES($1,$2,'action_previewed',$3)`,
            [scope.contextId,`user:${scope.userId}`,{reviewId:row.id,selectionId:selection.id,purpose:input.purpose,counts:plan.counts}]);
        return publicReview(row,plan);
    });
}

module.exports={previewBulkAction,loadTargets,buildPlan};

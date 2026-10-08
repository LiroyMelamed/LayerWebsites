const {digest}=require('../../lib/signingV2/canonical');
const {lockTargets}=require('./bulkActions');
const {loadTargets}=require('./bulkReview');
const {currentSenderScope,taskManifest,requiredDeliveryActions}=require('./followupScope');
const {documentManifest,copiesReady}=require('./completedCopy');

async function planBulkDelivery(db,delivery,grantService) {
    const contextId=delivery.owner_context_id;
    const bindings=(await db.query('SELECT binding FROM signing_delivery_items WHERE owner_context_id=$1 AND delivery_id=$2 ORDER BY package_id',
        [contextId,delivery.id])).rows.map(row=>row.binding);
    const skip=(state,code)=>({skip:{state,code},delivery});
    if(!bindings.length || !['reminder','resend','completed_copy'].includes(delivery.purpose))return skip('cancelled','ACTION_REVIEW_REQUIRED');
    const review=(await db.query('SELECT purpose,plan FROM signing_bulk_reviews WHERE owner_context_id=$1 AND id=$2 AND created_by=$3',
        [contextId,delivery.target_snapshot.reviewId,delivery.target_snapshot.actorUserId])).rows[0];
    const group=review?.plan.messages.find(group=>group.groupKey===delivery.target_snapshot.groupKey);
    const approved=new Set((group?.items||[]).map(item=>digest(item.binding)));
    if(!group || review.purpose!==delivery.purpose || group.channel!==delivery.channel
        || group.personId!==delivery.target_snapshot.personId || group.endpoint!==delivery.target_snapshot.endpoint
        || digest(group.policy)!==digest(delivery.target_snapshot.policy)
        || bindings.some(binding=>!approved.has(digest(binding))))return skip('cancelled','ACTION_REVIEW_REQUIRED');
    await lockTargets(db,contextId,bindings);
    const scope=await currentSenderScope(db,contextId,delivery.target_snapshot.actorUserId,requiredDeliveryActions(delivery.purpose));
    const targets=scope?await loadTargets(db,scope,{items:bindings}):[];
    const byPackage=new Map(targets.filter(target=>target.person_id===delivery.target_snapshot.personId).map(target=>[target.id,target]));
    const links=new Set((await db.query(`SELECT id FROM signing_public_grants WHERE owner_context_id=$1 AND id=ANY($2::uuid[])
        AND person_id=$3 AND purpose='sign' AND revoked_at IS NULL AND expires_at>clock_timestamp()`,
    [contextId,bindings.map(item=>item.grantId).filter(Boolean),delivery.target_snapshot.personId])).rows.map(row=>row.id));
    const accepted=[],outcomes=[];
    const copy=delivery.purpose==='completed_copy';
    for(const binding of bindings) {
        const target=byPackage.get(binding.packageId);let reason=null,state='cancelled';
        if(!scope || !target)reason='SENDER_ACCESS_CHANGED';
        else if(target.active_revision_id!==binding.revisionId || target.revision_hash!==binding.revisionHash)reason='REVISION_INACTIVE';
        else if(target.profile.id!==binding.profileId || target.profile.version!==binding.profileVersion)reason='CONTACT_CHANGED';
        else if(digest(target.profile.policy_snapshot)!==digest(delivery.target_snapshot.policy))reason='CONTACT_CHANGED';
        else if((delivery.channel==='email'?target.profile.endpoints_snapshot.email:target.profile.endpoints_snapshot.phone)!==delivery.target_snapshot.endpoint)reason='CONTACT_CHANGED';
        else if(copy) {
            if(target.workflow_state!=='complete' || !copiesReady(target.documents)
                || digest(documentManifest(target.documents))!==digest(binding.documents))reason='COMPLETED_COPY_CHANGED';
        } else if(binding.tasks.length && binding.tasks.every(item=>target.tasks.some(task=>task.taskId===item.taskId && task.state==='accepted'))) {
            reason='ALREADY_COMPLETED';state='skipped_completed';
        } else if(!['active','attention'].includes(target.workflow_state))reason='REVISION_INACTIVE';
        else if(!target.before_deadline)reason='DEADLINE_EXPIRED';
        else if(!links.has(binding.grantId))reason='LINK_UNAVAILABLE';
        else if(digest(taskManifest(target.tasks.filter(task=>task.state==='ready')))!==digest(binding.tasks))reason='ACTION_SCOPE_CHANGED';
        if(reason)outcomes.push({profileId:binding.profileId,state,errorCode:reason});
        else accepted.push(binding);
    }
    if(outcomes.length)await db.query(`UPDATE signing_delivery_items i SET state=v->>'state',error_code=v->>'errorCode'
        FROM jsonb_array_elements($3::jsonb) v WHERE i.owner_context_id=$1 AND i.delivery_id=$2 AND i.profile_id=(v->>'profileId')::uuid`,
    [contextId,delivery.id,JSON.stringify(outcomes)]);
    if(!accepted.length)return skip(outcomes.every(item=>item.state==='skipped_completed')?'skipped_completed':'cancelled',
        outcomes.every(item=>item.state==='skipped_completed')?'ALREADY_COMPLETED':outcomes[0]?.errorCode||'ACTION_SCOPE_CHANGED');
    const grant=await grantService.issueBulkGrant(db,{contextId,personId:delivery.target_snapshot.personId,purpose:copy?'download':'sign',items:accepted});
    await db.query(`UPDATE signing_deliveries SET grant_id=$3,state='dispatching',attempted_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2`,
        [contextId,delivery.id,grant.id]);
    Object.assign(delivery,{live_grant_id:grant.id,grant_context_id:grant.owner_context_id,grant_person_id:grant.person_id,
        grant_purpose:grant.purpose,encrypted_token:grant.encrypted_token,token_hash:grant.token_hash});
    return {send:true,delivery,endpoint:delivery.target_snapshot.endpoint};
}

module.exports={planBulkDelivery};

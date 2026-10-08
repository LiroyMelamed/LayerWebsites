const {randomUUID}=require('node:crypto');
const {digest}=require('../../lib/signingV2/canonical');
const {UUID}=require('../../lib/signingV2/compiler');
const {expect,fail}=require('../../lib/signingV2/errors');
const {transaction}=require('./transaction');
const {checkedSnapshot}=require('./selections');
const {loadTargets,buildPlan}=require('./bulkReview');
const {packageScopeSql,scopeParams}=require('./access');
const {currentSenderScope}=require('./followupScope');
const {enqueue,job}=require('./jobs');

// Shared with dispatch. Lock in incumbent signing order, with deterministic
// ordering within each table, and re-read eligibility after waiting for locks.
async function lockTargets(db,contextId,bindings) {
    if(!bindings.length)return;
    const values=JSON.stringify(bindings);
    await db.query(`SELECT p.id FROM signing_packages p WHERE p.owner_context_id=$1 AND p.id IN
        (SELECT (v->>'packageId')::uuid FROM jsonb_array_elements($2::jsonb) v) ORDER BY p.id FOR UPDATE`,[contextId,values]);
    await db.query(`SELECT r.id FROM signing_package_revisions r WHERE r.owner_context_id=$1 AND r.id IN
        (SELECT (v->>'revisionId')::uuid FROM jsonb_array_elements($2::jsonb) v) ORDER BY r.id FOR UPDATE`,[contextId,values]);
    await db.query(`SELECT t.id FROM signing_tasks t WHERE t.owner_context_id=$1 AND t.revision_id IN
        (SELECT (v->>'revisionId')::uuid FROM jsonb_array_elements($2::jsonb) v) ORDER BY t.id FOR SHARE`,[contextId,values]);
    await db.query(`SELECT p.id FROM signing_delivery_profiles p WHERE p.owner_context_id=$1 AND p.id IN
        (SELECT (v->>'profileId')::uuid FROM jsonb_array_elements($2::jsonb) v) ORDER BY p.id FOR SHARE`,[contextId,values]);
    await db.query(`SELECT g.id FROM signing_public_grants g WHERE g.owner_context_id=$1 AND g.id IN
        (SELECT (v->>'grantId')::uuid FROM jsonb_array_elements($2::jsonb) v) ORDER BY g.id FOR SHARE`,[contextId,values]);
}

const keyOf=item=>`${item.packageId}:${item.personId}`;
function shrinkPlan(approved,current) {
    const eligible=new Map(current.messages.flatMap(group=>group.items.map(item=>[keyOf(item.binding),item])));
    const excluded=new Map(current.excluded.map(item=>[keyOf(item),item.reason]));
    const packageExcluded=new Map(current.excluded.filter(item=>!item.personId).map(item=>[item.packageId,item.reason]));
    const exclusions=approved.excluded.map(({packageId,personId,reason})=>({packageId,...(personId?{personId}:{}),reason}));
    const messages=[];
    for(const group of approved.messages) {
        const items=[];
        for(const item of group.items) {
            const next=eligible.get(keyOf(item.binding));
            if(next && digest(next.binding)===digest(item.binding))items.push(item);
            else exclusions.push({packageId:item.binding.packageId,personId:item.binding.personId,
                reason:packageExcluded.get(item.binding.packageId)||excluded.get(keyOf(item.binding))||'ACTION_SCOPE_CHANGED'});
        }
        if(items.length)messages.push({...group,items});
    }
    return {messages,exclusions};
}

async function bulkOperationStatus(db,scope,id) {
    if(!scope.send)fail('FORBIDDEN',403);
    expect(UUID.test(id||''),'INVALID_ACTION');
    const op=(await db.query(`SELECT * FROM signing_operations WHERE owner_context_id=$1 AND id=$2 AND actor_key=$3 AND kind='bulk_action'`,
        [scope.contextId,id,`user:${scope.userId}`])).rows[0];
    if(!op)fail('NOT_FOUND',404);
    const rows=(await db.query(`SELECT i.package_id AS "packageId",i.person_id AS "personId",i.delivery_id AS "deliveryId",
        (${packageScopeSql('p')}) AS authorized,
        CASE WHEN i.state<>'included' THEN i.state WHEN d.state IN ('pending','dispatching') THEN 'queued' ELSE d.state END AS state,
        COALESCE(i.error_code,d.error_code) AS "errorCode",d.provider_accepted_at AS "providerAcceptedAt"
        FROM signing_delivery_items i JOIN signing_deliveries d ON d.owner_context_id=i.owner_context_id AND d.id=i.delivery_id
        JOIN signing_packages p ON p.owner_context_id=i.owner_context_id AND p.id=i.package_id
        WHERE i.owner_context_id=$1 AND d.id=ANY($5::uuid[]) ORDER BY i.delivery_id,i.package_id`,
    [...scopeParams(scope),(op.result.items||[]).map(item=>item.deliveryId)])).rows;
    const items=rows.filter(row=>row.authorized).map(({authorized,...item})=>item);
    const oldExclusions=op.result.exclusions||[];
    const visible=new Set((await db.query(`SELECT p.id FROM signing_packages p WHERE ${packageScopeSql('p')} AND p.id=ANY($5::uuid[])`,
        [...scopeParams(scope),oldExclusions.map(item=>item.packageId)])).rows.map(row=>row.id));
    const exclusions=oldExclusions.map(item=>visible.has(item.packageId)?item:{packageId:item.packageId,reason:'ACCESS_CHANGED'});
    exclusions.push(...rows.filter(row=>!row.authorized).map(row=>({packageId:row.packageId,reason:'ACCESS_CHANGED'})));
    const states=new Set(items.map(item=>item.state));
    return {operationId:id,reviewId:op.result.reviewId,selectionId:op.result.selectionId,createdAt:op.created_at,
        state:states.has('queued')?'running':states.has('uncertain')?'uncertain':states.has('failed')||rows.length!==items.length?'partial':'complete',
        items,exclusions,counts:{packages:new Set(items.map(item=>item.packageId)).size,messages:new Set(items.map(item=>item.deliveryId)).size,
            acceptedMessages:new Set(items.filter(item=>['provider_accepted','delivered'].includes(item.state)).map(item=>item.deliveryId)).size}};
}

async function executeBulkAction(pool,scope,input) {
    if(!scope.send)fail('FORBIDDEN',403);
    expect(UUID.test(input.reviewId||'') && UUID.test(input.idempotencyKey||'') && /^[a-f0-9]{64}$/.test(input.previewHash||''),'INVALID_ACTION');
    const requestHash=digest({reviewId:input.reviewId,previewHash:input.previewHash});
    return transaction(pool,async db=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`bulk-request:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
        const alias=(await db.query('SELECT * FROM signing_bulk_requests WHERE owner_context_id=$1 AND created_by=$2 AND idempotency_key=$3',
            [scope.contextId,scope.userId,input.idempotencyKey])).rows[0];
        if(alias) {
            if(alias.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT',409);
            return {...await bulkOperationStatus(db,scope,alias.operation_id),reused:true};
        }
        const review=(await db.query('SELECT * FROM signing_bulk_reviews WHERE owner_context_id=$1 AND id=$2 AND created_by=$3',
            [scope.contextId,input.reviewId,scope.userId])).rows[0];
        if(!review)fail('NOT_FOUND',404);
        if(review.preview_hash!==input.previewHash)fail('PREVIEW_CHANGED',412);
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`bulk-review-execute:${scope.contextId}:${review.id}`]);
        let op=(await db.query(`SELECT id FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind='bulk_action' AND request_hash=$3`,
            [scope.contextId,`user:${scope.userId}`,requestHash])).rows[0];
        let reused=Boolean(op);
        if(!op) {
            const bindings=review.plan.messages.flatMap(group=>group.items.map(item=>item.binding));
            const lockKeys=[...new Set(bindings.map(item=>`signing-v2-action:${scope.contextId}:${item.packageId}:${item.personId}`))].sort();
            await db.query('SELECT pg_advisory_xact_lock(hashtextextended(value,0)) FROM (SELECT unnest($1::text[]) AS value ORDER BY value) keys',[lockKeys]);
            await lockTargets(db,scope.contextId,bindings);
            const currentScope=await currentSenderScope(db,scope.contextId,scope.userId);
            if(!currentScope)fail('FORBIDDEN',403);
            const liveScope={...scope,...currentScope};
            const selection=await checkedSnapshot(db,liveScope,review.selection_id);
            const current=buildPlan(selection,await loadTargets(db,liveScope,selection),{purpose:review.purpose,channel:review.channel});
            const {messages,exclusions}=shrinkPlan(review.plan,current),operationId=randomUUID();
            const deliveries=messages.map(group=>({id:randomUUID(),group}));
            if(deliveries.length) {
                const rows=deliveries.map(({id,group})=>{const first=group.items[0].binding;return {id,profile_id:first.profileId,profile_version:first.profileVersion,
                    grant_id:first.grantId,event_key:`bulk:${operationId}:${group.groupKey}`,purpose:review.purpose,channel:group.channel,
                    target_snapshot:{bulk:true,actorUserId:scope.userId,reviewId:review.id,groupKey:group.groupKey,personId:group.personId,endpoint:group.endpoint,
                        locale:group.policy.locale,policy:group.policy}};});
                await db.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,grant_id,event_key,purpose,channel,target_snapshot)
                    SELECT id,$1,profile_id,profile_version,grant_id,event_key,purpose,channel,target_snapshot FROM jsonb_to_recordset($2::jsonb)
                    AS d(id uuid,profile_id uuid,profile_version integer,grant_id uuid,event_key text,purpose text,channel text,target_snapshot jsonb)`,[scope.contextId,JSON.stringify(rows)]);
                const members=deliveries.flatMap(({id,group})=>group.items.map(item=>({delivery_id:id,...item.binding})));
                await db.query(`INSERT INTO signing_delivery_items(owner_context_id,delivery_id,package_id,revision_id,person_id,profile_id,profile_version,binding)
                    SELECT $1,(v->>'delivery_id')::uuid,(v->>'packageId')::uuid,(v->>'revisionId')::uuid,(v->>'personId')::uuid,
                        (v->>'profileId')::uuid,(v->>'profileVersion')::integer,v-'delivery_id' FROM jsonb_array_elements($2::jsonb) v`,[scope.contextId,JSON.stringify(members)]);
                await enqueue(db,scope.contextId,deliveries.map(({id,group})=>job('dispatch_delivery',id,digest({review:review.preview_hash,group:group.groupKey}))));
            }
            op=(await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result)
                VALUES($1,$2,$3,'bulk_action',$4,$5,$6,$7) RETURNING id`,[operationId,scope.contextId,`user:${scope.userId}`,input.idempotencyKey,
                requestHash,deliveries.length?'running':'complete',{reviewId:review.id,selectionId:selection.id,
                    items:deliveries.map(({id,group})=>({deliveryId:id,personId:group.personId})),exclusions}])).rows[0];
            await db.query(`INSERT INTO signing_events_v2(owner_context_id,actor_key,kind,details) VALUES($1,$2,'action_queued',$3)`,
                [scope.contextId,`user:${scope.userId}`,{operationId,reviewId:review.id,purpose:review.purpose,messages:deliveries.length,excluded:exclusions.length}]);
        }
        await db.query('INSERT INTO signing_bulk_requests(owner_context_id,created_by,idempotency_key,request_hash,operation_id) VALUES($1,$2,$3,$4,$5)',
            [scope.contextId,scope.userId,input.idempotencyKey,requestHash,op.id]);
        return {...await bulkOperationStatus(db,scope,op.id),reused};
    });
}

module.exports={executeBulkAction,bulkOperationStatus,lockTargets};

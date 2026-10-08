const { randomUUID } = require('node:crypto');
const { digest } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');
const { scopeParams, packageScopeSql } = require('./access');
const { filters, projectionCte, queryMatchesSql, stateMatchesSql } = require('./management');
const { transaction } = require('./transaction');

const MAX_PACKAGES = 1000;
const MAX_TASKS = 20000;
const scopeHash = scope => digest({ contextId:scope.contextId,userId:scope.userId,all:Boolean(scope.all),
    assignedCases:Boolean(scope.assignedCases),caseView:Boolean(scope.caseView),caseAll:Boolean(scope.caseAll),send:Boolean(scope.send) });

function selectionInput(input) {
    expect(input && ['explicit','all_matching'].includes(input.mode), 'INVALID_SELECTION');
    expect(UUID.test(input.idempotencyKey || ''), 'INVALID_SELECTION');
    const filter = filters({ state:input.filter?.state,query:input.filter?.query });
    const submissionId = input.filter?.submissionId || null;
    expect(submissionId === null || UUID.test(submissionId), 'INVALID_SELECTION');
    expect(!input.filter || Object.keys(input.filter).every(key => ['state','query','submissionId'].includes(key)), 'INVALID_FILTER');
    let packageIds = null;
    if (input.mode === 'explicit') {
        expect(Array.isArray(input.packageIds) && input.packageIds.length>0 && input.packageIds.length<=MAX_PACKAGES
            && input.packageIds.every(id=>UUID.test(id)) && new Set(input.packageIds).size===input.packageIds.length, 'INVALID_SELECTION');
        packageIds = [...input.packageIds].sort();
    } else expect(input.packageIds === undefined, 'INVALID_SELECTION');
    return { source:{mode:input.mode,state:filter.state,query:filter.query,submissionId},packageIds,pattern:filter.pattern };
}

// One statement captures package, task and contact versions from one MVCC view.
// Aggregates start from the bounded authorized selection, not the whole office.
function itemCtes() {
    return `task_rows AS (
        SELECT t.revision_id,jsonb_agg(jsonb_build_object('taskId',t.id,'documentId',t.document_id,
            'personId',p.person_id,'participationId',p.id,'version',t.version,'stage',t.stage,'state',t.state,'required',t.required)
            ORDER BY t.id) AS tasks
        FROM picked a JOIN signing_tasks t ON t.owner_context_id=a.owner_context_id AND t.revision_id=a.active_revision_id
        JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id GROUP BY t.revision_id
    ), profile_rows AS (
        SELECT p.revision_id,jsonb_agg(jsonb_build_object('profileId',p.id,'personId',p.person_id,'version',p.version)
            ORDER BY p.id) AS profiles
        FROM picked a JOIN signing_delivery_profiles p ON p.owner_context_id=a.owner_context_id AND p.revision_id=a.active_revision_id
        GROUP BY p.revision_id
    ) SELECT a.id AS "packageId",a.external_key AS name,a.active_revision_id AS "revisionId",a.revision_hash AS "revisionHash",
        a.workflow_state AS "workflowState",COALESCE(t.tasks,'[]') AS tasks,COALESCE(p.profiles,'[]') AS profiles
        FROM picked a LEFT JOIN task_rows t ON t.revision_id=a.active_revision_id LEFT JOIN profile_rows p ON p.revision_id=a.active_revision_id
        ORDER BY a.id`;
}

async function matchingItems(db,scope,normalized) {
    return (await db.query(`WITH ${projectionCte(scope)}, picked AS (
        SELECT * FROM projected p WHERE ${queryMatchesSql()} AND ${stateMatchesSql('p',6)}
            AND ($7::uuid IS NULL OR p.group_id=$7) AND ($8::uuid[] IS NULL OR p.id=ANY($8::uuid[]))
        ORDER BY p.id LIMIT $9
    ), ${itemCtes()}`, [...scopeParams(scope),normalized.packageIds ? '%%' : normalized.pattern,
        normalized.packageIds ? 'all' : normalized.source.state,normalized.packageIds ? null : normalized.source.submissionId,
        normalized.packageIds,MAX_PACKAGES+1])).rows;
}

async function currentItems(db,scope,ids) {
    return (await db.query(`WITH picked AS (
        SELECT p.*,r.revision_hash,r.workflow_state FROM signing_packages p
        JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE ${packageScopeSql('p')} AND p.id=ANY($5::uuid[])
    ), ${itemCtes()}`, [...scopeParams(scope),ids])).rows;
}

function publicSelection(row,current,reused=false) {
    const live = new Map(current.map(item=>[item.packageId,item]));
    const packages = row.items.map(item=>{
        const now = live.get(item.packageId);
        if (!now) return { packageId:item.packageId,reason:'ACCESS_CHANGED' };
        const reason = now.revisionId !== item.revisionId || now.revisionHash !== item.revisionHash ? 'REVISION_CHANGED'
            : digest(now.profiles) !== digest(item.profiles) ? 'CONTACT_CHANGED'
                : now.workflowState !== item.workflowState || digest(now.tasks) !== digest(item.tasks) ? 'TASKS_CHANGED' : null;
        return { packageId:item.packageId,name:now?.name || null,revisionId:item.revisionId,reason,
            taskCount:item.tasks.length,readyTaskCount:item.tasks.filter(task=>task.state==='ready').length };
    });
    const tasks = row.items.filter(item=>live.has(item.packageId)).flatMap(item=>item.tasks);
    return { selectionId:row.id,selectionHash:row.selection_hash,createdAt:row.created_at,expiresAt:row.expires_at,
        filter:row.source_filter,reused,packages,counts:{packages:current.length,selectedPackages:packages.length,
            people:new Set(tasks.map(task=>task.personId)).size,participations:new Set(tasks.map(task=>task.participationId)).size,
            tasks:tasks.length,readyTasks:tasks.filter(task=>task.state==='ready').length,
            changedPackages:packages.filter(item=>item.reason).length},requiresReview:packages.some(item=>item.reason) };
}

async function checkedSnapshot(db,scope,id) {
    // This is a saved selection, not authorization to dispatch. Action previews
    // and workers must still recheck its exact items against current rows.
    if (!scope.send) fail('FORBIDDEN',403);
    expect(UUID.test(id || ''),'INVALID_SELECTION');
    const row=(await db.query(`SELECT *,expires_at>clock_timestamp() AS live FROM signing_selection_snapshots
        WHERE owner_context_id=$1 AND id=$2 AND created_by=$3`,[scope.contextId,id,scope.userId])).rows[0];
    if(!row)fail('NOT_FOUND',404);
    if(!row.live)fail('SELECTION_EXPIRED',410);
    if(row.scope_hash!==scopeHash(scope))fail('SELECTION_ACCESS_CHANGED',403);
    return row;
}

async function getSelection(db,scope,id) {
    const row=await checkedSnapshot(db,scope,id);
    const current=await currentItems(db,scope,row.items.map(item=>item.packageId));
    // Revoked package names and details are never returned from the stored copy.
    return publicSelection(row,current);
}

async function freezeSelection(pool,scope,input) {
    if(!scope.send)fail('FORBIDDEN',403);
    const normalized=selectionInput(input),requestHash=digest({source:normalized.source,packageIds:normalized.packageIds});
    return transaction(pool,async db=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`selection:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
        const previous=(await db.query('SELECT id,request_hash FROM signing_selection_snapshots WHERE owner_context_id=$1 AND created_by=$2 AND idempotency_key=$3',
            [scope.contextId,scope.userId,input.idempotencyKey])).rows[0];
        if(previous) {
            if(previous.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT',409);
            return {...await getSelection(db,scope,previous.id),reused:true};
        }
        const items=await matchingItems(db,scope,normalized);
        if(normalized.packageIds && items.length!==normalized.packageIds.length)fail('NOT_FOUND',404);
        expect(items.length>0,'EMPTY_SELECTION');
        expect(items.length<=MAX_PACKAGES,'SELECTION_TOO_LARGE');
        expect(items.reduce((total,item)=>total+item.tasks.length,0)<=MAX_TASKS,'SELECTION_TOO_LARGE');
        const row=(await db.query(`INSERT INTO signing_selection_snapshots(id,owner_context_id,created_by,idempotency_key,request_hash,scope_hash,selection_hash,source_filter,items)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[randomUUID(),scope.contextId,scope.userId,input.idempotencyKey,
            requestHash,scopeHash(scope),digest(items),normalized.source,JSON.stringify(items)])).rows[0];
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,actor_key,kind,details) VALUES($1,$2,'selection_frozen',$3)`,
            [scope.contextId,`user:${scope.userId}`,{selectionId:row.id,selectionHash:row.selection_hash,packageCount:items.length,mode:normalized.source.mode}]);
        return publicSelection(row,items);
    });
}

module.exports={freezeSelection,getSelection,checkedSnapshot,MAX_PACKAGES,MAX_TASKS};

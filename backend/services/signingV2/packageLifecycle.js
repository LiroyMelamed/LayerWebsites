const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { hasAreaAction, normalizeRolePermissions, getSigningDataScope } = require('../../lib/firmRolePermissions');
const { transaction } = require('./transaction');
const { packageScopeSql, scopeParams } = require('./access');

const ACTIONS = { cancel: 'package_cancel', assign: 'package_assign' };
const CAPABILITIES = { cancel: 'packageCancel', assign: 'packageAssign' };

// Recheck live permissions after the package fence too. A request that waited
// behind signing/assignment must not act with an obsolete request-time scope.
async function currentScope(db, scope, action) {
    expect(ACTIONS[action], 'INVALID_ACTION');
    if (scope[CAPABILITIES[action]] !== true) fail('FORBIDDEN', 403);
    const row = (await db.query(`SELECT u.role,u.firm_staff_role_id,r.permissions,r.is_active,
        r.law_firm_tenant_id AS role_tenant,u.law_firm_tenant_id,
        EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id=u.userid AND a.is_active) AS platform_admin
        FROM signing_owner_contexts c JOIN users u ON u.userid=$2 AND u.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
        LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id WHERE c.id=$1`, [scope.contextId,scope.userId])).rows[0];
    if (!row || !['Admin','Lawyer','Staff'].includes(row.role)) fail('FORBIDDEN',403);
    if (row.platform_admin) return scope;
    if (!row.firm_staff_role_id) {
        if (!['Admin','Lawyer'].includes(row.role)) fail('FORBIDDEN',403);
        return scope;
    }
    const permissions = normalizeRolePermissions(row.permissions);
    if (!row.is_active || String(row.role_tenant || '') !== String(row.law_firm_tenant_id || '')
        || !['view','manage',ACTIONS[action]].every(a=>hasAreaAction(permissions,'signing',a))) fail('FORBIDDEN',403);
    return { ...scope,all:scope.all && getSigningDataScope(permissions)==='all_firm',
        assignedCases:scope.assignedCases && permissions.areas?.signing?.legacyCaseAssignment===true };
}

async function loadPackage(db, scope, packageId, action, lock=false) {
    expect(UUID.test(packageId || ''), 'INVALID_ACTION');
    let current = await currentScope(db,scope,action);
    const pkg = (await db.query(`SELECT p.id,p.external_key,p.owner_userid,p.version AS package_version,
        p.active_revision_id,r.version AS revision_version,r.workflow_state,r.revision_hash
        FROM signing_packages p JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE ${packageScopeSql('p')} AND p.id=$5 ${lock?'FOR UPDATE OF p,r':''}`, [...scopeParams(current),packageId])).rows[0];
    if (!pkg) fail('NOT_FOUND',404);
    if (lock) {
        current = await currentScope(db,scope,action);
        if (!(await db.query(`SELECT 1 FROM signing_packages p WHERE ${packageScopeSql('p')} AND p.id=$5`, [...scopeParams(current),packageId])).rowCount) fail('NOT_FOUND',404);
    }
    return pkg;
}

async function eligibleAssignees(db, contextId) {
    const rows = (await db.query(`SELECT u.userid AS id,u.name,u.role,u.firm_staff_role_id,r.permissions,r.is_active,
        r.law_firm_tenant_id AS role_tenant,u.law_firm_tenant_id
        FROM signing_owner_contexts c JOIN users u ON u.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
        LEFT JOIN firm_staff_roles r ON r.id=u.firm_staff_role_id
        WHERE c.id=$1 AND u.role IN ('Admin','Lawyer','Staff') ORDER BY u.name,u.userid`, [contextId])).rows;
    return rows.filter(u=>u.firm_staff_role_id
        ? u.is_active && String(u.role_tenant || '')===String(u.law_firm_tenant_id || '') && hasAreaAction(normalizeRolePermissions(u.permissions),'signing','view')
        : ['Admin','Lawyer'].includes(u.role)).map(u=>({id:u.id,name:u.name}));
}

async function summarize(db, scope, pkg, action, assigneeIds) {
    const tasks = (await db.query(`SELECT id,document_id,state,version,required FROM signing_tasks
        WHERE owner_context_id=$1 AND revision_id=$2 ORDER BY id`, [scope.contextId,pkg.active_revision_id])).rows;
    const assignments = (await db.query(`SELECT a.user_id AS id,u.name FROM signing_package_assignments a
        JOIN users u ON u.userid=a.user_id WHERE a.owner_context_id=$1 AND a.package_id=$2 ORDER BY a.user_id`, [scope.contextId,pkg.id])).rows;
    const owner = (await db.query('SELECT userid AS id,name FROM users WHERE userid=$1',[pkg.owner_userid])).rows[0];
    const accepted = tasks.filter(t=>t.state==='accepted'), remaining = tasks.filter(t=>!['accepted','cancelled'].includes(t.state));
    let reason = null, eligibleUsers = [], selected = [];
    if (action==='cancel') {
        if (['cancelled','superseded','complete'].includes(pkg.workflow_state)) reason='REVISION_INACTIVE';
        else if (!remaining.some(t=>t.required)) reason='SIGNING_ALREADY_COMPLETE';
    } else {
        eligibleUsers = await eligibleAssignees(db,scope.contextId);
        if (assigneeIds!==undefined) {
            expect(Array.isArray(assigneeIds) && assigneeIds.length<=50 && assigneeIds.every(id=>Number.isSafeInteger(id)&&id>0), 'INVALID_ACTION');
            selected = [...new Set(assigneeIds)].sort((a,b)=>a-b);
            expect(selected.every(id=>eligibleUsers.some(u=>u.id===id)), 'ASSIGNEE_UNAVAILABLE');
        } else selected = assignments.filter(u=>eligibleUsers.some(e=>e.id===u.id)).map(u=>u.id);
        if (digest(selected)===digest(assignments.map(u=>u.id))) reason='ASSIGNMENT_UNCHANGED';
    }
    const manifest = { action,packageId:pkg.id,revisionId:pkg.active_revision_id,packageVersion:pkg.package_version,
        revisionVersion:pkg.revision_version,workflowState:pkg.workflow_state,revisionHash:pkg.revision_hash,tasks,
        assignments:assignments.map(u=>u.id),assigneeIds:action==='assign'?selected:[] };
    return { action,packageId:pkg.id,name:pkg.external_key,revisionId:pkg.active_revision_id,
        eligible:!reason,reason,acceptedCount:accepted.length,remainingCount:remaining.length,
        remainingDocuments:new Set(remaining.map(t=>t.document_id)).size,owner,assignments,eligibleUsers,assigneeIds:selected,
        previewHash:digest(manifest) };
}

async function previewPackageAction(db, scope, packageId, input) {
    const pkg = await loadPackage(db,scope,packageId,input.action);
    return summarize(db,scope,pkg,input.action,input.assigneeIds);
}

async function executePackageAction(pool, scope, packageId, input) {
    expect(ACTIONS[input.action] && UUID.test(input.idempotencyKey || '') && /^[a-f0-9]{64}$/.test(input.previewHash || ''), 'INVALID_ACTION');
    expect(typeof input.reason==='string' && input.reason.trim() && input.reason.length<=1000,'REASON_REQUIRED');
    const reason=input.reason.trim(),actor=`user:${scope.userId}`,kind=`package_${input.action}`;
    const requestHash=digest({packageId,action:input.action,previewHash:input.previewHash,reason,
        assigneeIds:input.action==='assign'?input.assigneeIds:null});
    return transaction(pool,async db=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${kind}:${scope.contextId}:${actor}:${input.idempotencyKey}`]);
        const pkg=await loadPackage(db,scope,packageId,input.action,true);
        const prior=(await db.query(`SELECT request_hash,result FROM signing_operations
            WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4`,[scope.contextId,actor,kind,input.idempotencyKey])).rows[0];
        if(prior){if(prior.request_hash!==requestHash)fail('IDEMPOTENCY_CONFLICT',409);return {...prior.result,reused:true};}
        const preview=await summarize(db,scope,pkg,input.action,input.assigneeIds);
        if(preview.previewHash!==input.previewHash)fail('VERSION_CHANGED',412);
        if(!preview.eligible)fail(preview.reason,409);
        if(input.action==='cancel'){
            // Do not lock jobs or deliveries while holding a package: workers
            // acquire their job/delivery fence first. Their live revision check
            // blocks dispatch, and the job sweeper retires obsolete PDF work.
            await db.query(`UPDATE signing_package_revisions SET workflow_state='cancelled',version=version+1
                WHERE owner_context_id=$1 AND id=$2`,[scope.contextId,pkg.active_revision_id]);
            await db.query(`UPDATE signing_tasks SET state='cancelled',version=version+1
                WHERE owner_context_id=$1 AND revision_id=$2 AND state NOT IN ('accepted','cancelled')`,[scope.contextId,pkg.active_revision_id]);
            await db.query(`UPDATE signing_sessions_v2 SET revoked_at=clock_timestamp()
                WHERE owner_context_id=$1 AND revoked_at IS NULL AND EXISTS
                (SELECT 1 FROM jsonb_array_elements(exact_manifest->'items') item WHERE item->>'revisionId'=$2)`,[scope.contextId,pkg.active_revision_id]);
        } else {
            await db.query('DELETE FROM signing_package_assignments WHERE owner_context_id=$1 AND package_id=$2',[scope.contextId,packageId]);
            await db.query(`INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id)
                SELECT $1,$2,unnest($3::integer[])`,[scope.contextId,packageId,preview.assigneeIds]);
        }
        await db.query('UPDATE signing_packages SET version=version+1 WHERE owner_context_id=$1 AND id=$2',[scope.contextId,packageId]);
        const result={packageId,revisionId:pkg.active_revision_id,state:input.action==='cancel'?'cancelled':'saved',
            acceptedCount:preview.acceptedCount,remainingCount:preview.remainingCount,assigneeIds:preview.assigneeIds};
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,$4,$5)`,
            [scope.contextId,packageId,actor,kind,{...result,reason,previewHash:input.previewHash,previousAssignees:preview.assignments.map(u=>u.id)}]);
        await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at)
            VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp())`,[randomUUID(),scope.contextId,actor,kind,input.idempotencyKey,requestHash,result]);
        return {...result,reused:false};
    });
}

module.exports={previewPackageAction,executePackageAction,eligibleAssignees};

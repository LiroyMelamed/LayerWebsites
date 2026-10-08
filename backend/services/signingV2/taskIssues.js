const { randomUUID } = require('node:crypto');
const { expect, fail } = require('../../lib/signingV2/errors');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest } = require('../../lib/signingV2/canonical');
const { loadPublicGrant } = require('./grants');
const { transaction } = require('./transaction');
const { packageScopeSql, scopeParams } = require('./access');

const taskState = kind => kind === 'decline' ? 'declined' : 'clarification';
const reasonText = (value, required) => {
    expect(typeof value === 'string' && value.trim().length <= 2000 && (!required || value.trim().length > 0), 'ISSUE_NOTE_REQUIRED');
    return value.trim();
};

async function previousOperation(db, contextId, actorKey, kind, key, hash) {
    const row = (await db.query(`SELECT result,request_hash FROM signing_operations
        WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4`, [contextId, actorKey, kind, key])).rows[0];
    if (!row) return null;
    if (row.request_hash !== hash) fail('IDEMPOTENCY_CONFLICT', 409);
    return { ...row.result, reused: true };
}
async function rememberOperation(db, contextId, actorKey, kind, key, hash, result) {
    await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at)
        VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp())`, [randomUUID(), contextId, actorKey, kind, key, hash, result]);
    return { ...result, reused: false };
}

// The current recipient pauses only their current ready tasks on one PDF.
// An issue is not a signature, and requires neither fabricated acceptance nor
// disclosure of an OTP. Resuming increments task versions and needs fresh consent.
async function reportTaskIssue(pool, token, input) {
    expect(['decline', 'clarify'].includes(input.kind) && UUID.test(input.idempotencyKey || ''), 'INVALID_TASK_ISSUE');
    expect(Array.isArray(input.taskIds) && input.taskIds.length > 0 && input.taskIds.length <= 200
        && input.taskIds.every(id => UUID.test(id)) && new Set(input.taskIds).size === input.taskIds.length, 'INVALID_SELECTION');
    const reason = reasonText(input.reason ?? '', input.kind === 'clarify');
    const taskIds = [...input.taskIds].sort();
    const hash = digest({ kind: input.kind, taskIds, reason });
    const grant = await loadPublicGrant(pool, token);
    if (grant.allowed_task_ids && taskIds.some(id => !grant.allowed_task_ids.includes(id))) fail('TASK_UNAVAILABLE', 404);
    const actorKey = `grant:${grant.id}`;
    return transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`task-issue:${grant.id}:${input.idempotencyKey}`]);
        const previous = await previousOperation(db, grant.owner_context_id, actorKey, 'public_task_issue', input.idempotencyKey, hash);
        if (previous) return previous;
        const selected = (await db.query(`SELECT t.* FROM signing_tasks t JOIN signing_participations p
            ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
            WHERE t.owner_context_id=$1 AND t.id=ANY($2::uuid[]) AND p.person_id=$3 AND t.document_id=ANY($4::uuid[]) ORDER BY t.id`,
        [grant.owner_context_id, taskIds, grant.person_id, grant.items.map(item => item.document_id)])).rows;
        if (selected.length !== taskIds.length) fail('TASK_UNAVAILABLE', 404);
        expect(selected.every(task => task.document_id === selected[0].document_id), 'INVALID_SELECTION');
        // Same lock order as signature acceptance: package/revision, tasks, grant.
        const revision = (await db.query(`SELECT r.*,p.active_revision_id FROM signing_package_revisions r
            JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
            WHERE r.owner_context_id=$1 AND r.id=$2 FOR UPDATE OF p,r`, [grant.owner_context_id, selected[0].revision_id])).rows[0];
        if (!revision || revision.active_revision_id !== revision.id || !['active','attention'].includes(revision.workflow_state)) fail('REVISION_INACTIVE', 409);
        const tasks = (await db.query('SELECT * FROM signing_tasks WHERE owner_context_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
            [grant.owner_context_id, taskIds])).rows;
        if (tasks.some(task => task.state !== 'ready')) fail('TASK_UNAVAILABLE', 409);
        const lockedGrant = await db.query(`SELECT id FROM signing_public_grants WHERE owner_context_id=$1 AND id=$2
            AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`, [grant.owner_context_id, grant.id]);
        if (!lockedGrant.rowCount) fail('LINK_UNAVAILABLE', 404);
        await db.query('SELECT id FROM signing_delivery_profiles WHERE owner_context_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',
            [grant.owner_context_id, [...new Set(grant.items.map(item => item.delivery_profile_id))]]);
        const liveGrant = await loadPublicGrant(db, token);
        if (tasks.some(task => !liveGrant.items.some(item => item.document_id === task.document_id))) fail('LINK_UNAVAILABLE', 404);
        const issues = tasks.map(task => ({ id: randomUUID(), task_id: task.id }));
        await db.query(`INSERT INTO signing_task_issues(id,owner_context_id,task_id,kind,reason,actor_key)
            SELECT id,$1,task_id,$2,$3,$4 FROM jsonb_to_recordset($5::jsonb) AS x(id uuid,task_id uuid)`,
        [grant.owner_context_id, input.kind, reason, actorKey, JSON.stringify(issues)]);
        await db.query('UPDATE signing_tasks SET state=$3,version=version+1 WHERE owner_context_id=$1 AND id=ANY($2::uuid[])',
            [grant.owner_context_id, taskIds, taskState(input.kind)]);
        await db.query("UPDATE signing_package_revisions SET issue_attention_base=COALESCE(issue_attention_base,workflow_state),workflow_state='attention',version=version+1 WHERE owner_context_id=$1 AND id=$2", [grant.owner_context_id, revision.id]);
        // Free text stays only in its scoped issue record, not operational logs or alerts.
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'task_issue_reported',$4)`,
            [grant.owner_context_id, revision.package_id, actorKey, { kind: input.kind, taskIds, issueIds: issues.map(issue => issue.id) }]);
        return rememberOperation(db, grant.owner_context_id, actorKey, 'public_task_issue', input.idempotencyKey, hash,
            { packageId: revision.package_id, documentId: tasks[0].document_id, state: taskState(input.kind), issueIds: issues.map(issue => issue.id) });
    });
}

async function resolveTaskIssue(pool, scope, packageId, issueId, input) {
    if (!scope.manage) fail('FORBIDDEN', 403);
    expect(UUID.test(packageId) && UUID.test(issueId) && UUID.test(input.idempotencyKey || ''), 'INVALID_TASK_ISSUE');
    const resolution = reasonText(input.resolution, true), actorKey = `user:${scope.userId}`;
    const hash = digest({ packageId, issueId, resolution });
    return transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`resolve-issue:${scope.contextId}:${actorKey}:${input.idempotencyKey}`]);
        const pkg = (await db.query(`SELECT p.active_revision_id,r.workflow_state,r.deadline FROM signing_packages p
            JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
            WHERE ${packageScopeSql('p')} AND p.id=$5 FOR UPDATE OF p,r`, [...scopeParams(scope), packageId])).rows[0];
        if (!pkg) fail('NOT_FOUND', 404);
        const previous = await previousOperation(db, scope.contextId, actorKey, 'resolve_task_issue', input.idempotencyKey, hash);
        if (previous) return previous;
        if (!['active','attention'].includes(pkg.workflow_state)) fail('REVISION_INACTIVE', 409);
        if (pkg.deadline && new Date(pkg.deadline) <= new Date()) fail('DEADLINE_EXPIRED', 409);
        const issue = (await db.query(`SELECT i.*,t.state AS task_state,t.stage FROM signing_task_issues i
            JOIN signing_tasks t ON t.owner_context_id=i.owner_context_id AND t.id=i.task_id
            WHERE i.owner_context_id=$1 AND i.id=$2 AND t.revision_id=$3 FOR UPDATE OF t,i`, [scope.contextId, issueId, pkg.active_revision_id])).rows[0];
        if (!issue) fail('NOT_FOUND', 404);
        if (issue.state !== 'open' || issue.task_state !== taskState(issue.kind)) fail('ISSUE_ALREADY_RESOLVED', 409);
        const current = (await db.query(`SELECT min(stage) AS stage FROM signing_tasks WHERE owner_context_id=$1 AND revision_id=$2
            AND required AND state NOT IN ('accepted','cancelled')`, [scope.contextId, pkg.active_revision_id])).rows[0].stage;
        if (current === null || issue.stage !== current) fail('TASK_STAGE_PASSED', 409);
        await db.query(`UPDATE signing_task_issues SET state='resolved',resolution=$3,resolved_by=$4,resolved_at=clock_timestamp()
            WHERE owner_context_id=$1 AND id=$2`, [scope.contextId, issueId, resolution, scope.userId]);
        await db.query("UPDATE signing_tasks SET state='ready',version=version+1 WHERE owner_context_id=$1 AND id=$2", [scope.contextId, issue.task_id]);
        // Restore only the status this issue displaced. Pre-existing attention is
        // preserved, and independent delivery/authority issues retain their counts.
        await db.query(`UPDATE signing_package_revisions r SET workflow_state=COALESCE(issue_attention_base,workflow_state),
                issue_attention_base=NULL,version=version+1 WHERE r.owner_context_id=$1 AND r.id=$2
                AND NOT EXISTS(SELECT 1 FROM signing_task_issues i JOIN signing_tasks t ON t.owner_context_id=i.owner_context_id AND t.id=i.task_id
                    WHERE i.owner_context_id=r.owner_context_id AND t.revision_id=r.id AND i.state='open')`, [scope.contextId,pkg.active_revision_id]);
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'task_issue_resolved',$4)`,
            [scope.contextId, packageId, actorKey, { issueId, taskId: issue.task_id }]);
        return rememberOperation(db, scope.contextId, actorKey, 'resolve_task_issue', input.idempotencyKey, hash,
            { issueId, taskId: issue.task_id, state: 'ready' });
    });
}
module.exports = { reportTaskIssue, resolveTaskIssue };

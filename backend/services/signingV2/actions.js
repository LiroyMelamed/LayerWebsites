const { randomUUID } = require('node:crypto');
const { digest } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');
const { packageScopeSql, scopeParams } = require('./access');
const { transaction } = require('./transaction');
const { enqueue, job } = require('./jobs');

const { completedDocuments, documentManifest, copiesReady } = require('./completedCopy');
const PURPOSES = new Set(['reminder', 'resend', 'completed_copy']);
const CHANNELS = new Set(['email', 'sms']);
// Applies across idempotency keys, so a second click or a second tab that
// generated a new key still cannot message the same person again immediately.
const COOLDOWN_SECONDS = 10 * 60;

function maskEndpoint(channel, value) {
    if (!value) return null;
    if (channel === 'email') {
        const [local, domain] = String(value).split('@');
        return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(4, local.length - 2)))}@${domain}`;
    }
    const digits = String(value).replace(/\D/g, '');
    return `•••• ${digits.slice(-3)}`;
}

function validate(input) {
    expect(UUID.test(input.packageId) && UUID.test(input.personId), 'INVALID_ACTION');
    expect(PURPOSES.has(input.purpose), 'INVALID_ACTION');
    expect(input.channel === undefined || input.channel === null || CHANNELS.has(input.channel), 'INVALID_ACTION');
}

async function loadTarget(db, scope, { packageId, personId, purpose }, lock = false) {
    const pkg = await db.query(`SELECT p.id,p.external_key,p.case_id,p.active_revision_id,r.workflow_state,r.revision_hash,r.deadline,
            r.deadline IS NULL OR r.deadline > clock_timestamp() AS before_deadline
        FROM signing_packages p JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE ${packageScopeSql('p')} AND p.id=$5 ${lock ? 'FOR UPDATE OF p' : ''}`, [...scopeParams(scope), packageId]);
    // Not visible and not existing are the same answer.
    if (!pkg.rowCount) fail('NOT_FOUND', 404);
    const target = pkg.rows[0];
    const detail = (await db.query(`SELECT
        COALESCE((SELECT jsonb_agg(jsonb_build_object('roleKey',p.role_key,'occurrence',p.occurrence,'capacity',p.capacity,
            'name',p.identity_snapshot->>'name','partyName',p.identity_snapshot->>'partyName') ORDER BY p.role_key,p.occurrence)
            FROM signing_participations p WHERE p.owner_context_id=$1 AND p.revision_id=$2 AND p.person_id=$3),'[]') AS participations,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('taskId',t.id,'documentName',d.name,'stage',t.stage,'state',t.state,'required',t.required)
            ORDER BY t.stage,d.document_key,t.id)
            FROM signing_tasks t JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
            JOIN signing_documents d ON d.owner_context_id=t.owner_context_id AND d.id=t.document_id
            WHERE t.owner_context_id=$1 AND t.revision_id=$2 AND p.person_id=$3),'[]') AS tasks,
        (SELECT to_jsonb(dp) FROM signing_delivery_profiles dp WHERE dp.owner_context_id=$1 AND dp.revision_id=$2 AND dp.person_id=$3) AS profile,
        (SELECT g.id FROM signing_public_grants g JOIN signing_grant_items i ON i.owner_context_id=g.owner_context_id AND i.grant_id=g.id
            WHERE g.owner_context_id=$1 AND i.revision_id=$2 AND g.person_id=$3 AND g.purpose='sign'
            AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp() ORDER BY g.created_at DESC LIMIT 1) AS grant_id,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('purpose',d.purpose,'channel',d.channel,'state',d.state,'createdAt',d.created_at,
            'attemptedAt',d.attempted_at,'providerAcceptedAt',d.provider_accepted_at) ORDER BY d.created_at DESC,d.id)
            FROM signing_deliveries d JOIN signing_delivery_profiles dp ON dp.owner_context_id=d.owner_context_id AND dp.id=d.profile_id
            WHERE dp.owner_context_id=$1 AND dp.revision_id=$2 AND dp.person_id=$3),'[]') AS deliveries,
        (SELECT c.casename FROM cases c WHERE c.caseid=$4
            AND ($5::boolean OR EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$6))) AS case_name`,
    [scope.contextId, target.active_revision_id, personId, scope.caseView ? target.case_id : null, Boolean(scope.caseAll), scope.userId])).rows[0];
    if (!detail.participations.length || !detail.profile) fail('NOT_FOUND', 404);
    const documents = purpose === 'completed_copy'
        ? await completedDocuments(db, scope.contextId, target.active_revision_id, personId) : [];
    return { ...target, ...detail, documents };
}

function evaluate(target, input) {
    const completedCopy = input.purpose === 'completed_copy';
    const channels = target.profile.policy_snapshot.channels || [];
    const channel = input.channel || channels.find(value => CHANNELS.has(value));
    const endpoint = channel === 'email' ? target.profile.endpoints_snapshot.email : channel === 'sms' ? target.profile.endpoints_snapshot.phone : null;
    const ready = target.tasks.filter(task => task.state === 'ready');
    const openRequired = target.tasks.filter(task => task.required && !['accepted', 'cancelled'].includes(task.state));
    const relevant = target.deliveries.filter(item => (item.purpose === 'completed_copy') === completedCopy);
    const messages = relevant.filter(item => item.channel === channel);
    const lastInvitation = target.deliveries.find(item => item.purpose === 'invitation') || null;
    const lastFollowUp = relevant.find(item => item.purpose !== 'invitation') || null;
    const recent = messages.find(item => item.purpose !== 'invitation' && !['failed', 'cancelled', 'skipped_completed'].includes(item.state));
    const cooldownUntil = recent ? new Date(new Date(recent.createdAt).getTime() + COOLDOWN_SECONDS * 1000) : null;
    let reason = null;
    if (completedCopy && (target.workflow_state !== 'complete' || !copiesReady(target.documents))) reason = 'COMPLETED_COPY_NOT_READY';
    else if (!completedCopy && !['active', 'attention'].includes(target.workflow_state)) reason = 'REVISION_INACTIVE';
    else if (!completedCopy && !target.before_deadline) reason = 'DEADLINE_EXPIRED';
    else if (!completedCopy && !openRequired.length && !ready.length) reason = 'ALREADY_COMPLETED';
    else if (!completedCopy && !ready.length) reason = target.tasks.some(task => ['declined','clarification'].includes(task.state))
        ? 'TASK_REQUIRES_ATTENTION' : 'WAITING_FOR_PREVIOUS_STAGE';
    else if (!channel || !channels.includes(channel) || !endpoint) reason = 'CHANNEL_UNAVAILABLE';
    else if (!completedCopy && !target.grant_id) reason = 'LINK_UNAVAILABLE';
    else if (messages.some(item => ['dispatching', 'uncertain'].includes(item.state))) reason = 'PREVIOUS_OUTCOME_UNCERTAIN';
    else if (messages.some(item => item.state === 'pending')) reason = 'MESSAGE_ALREADY_QUEUED';
    else if (cooldownUntil && cooldownUntil > new Date()) reason = 'COOLDOWN_ACTIVE';
    const preview = {
        packageId: target.id, revisionId: target.active_revision_id, personId: input.personId, purpose: input.purpose,
        package: { name: target.external_key, caseName: target.case_name || null },
        recipient: { name: target.participations[0].name, participations: target.participations },
        tasks: (completedCopy ? [] : ready).map(task => ({ taskId: task.taskId, documentName: task.documentName, stage: task.stage })),
        documents: target.documents.map(({ documentId, documentName }) => ({ documentId, documentName })),
        destination: channel ? { channel, masked: maskEndpoint(channel, endpoint) } : null,
        lastInvitation, lastFollowUp,
        eligible: reason === null, reason, cooldownUntil: reason === 'COOLDOWN_ACTIVE' ? cooldownUntil.toISOString() : null,
    };
    preview.previewHash = digest({ revisionId: preview.revisionId, revisionHash: target.revision_hash, personId: input.personId,
        purpose: input.purpose, channel: channel || null, taskIds: preview.tasks.map(task => task.taskId),
        documents: completedCopy ? documentManifest(target.documents) : [],
        profileVersion: target.profile.version, grantId: completedCopy ? null : target.grant_id, endpoint: endpoint ? digest({ endpoint }) : null });
    return { preview, channel, endpoint };
}

async function previewParticipantAction(db, scope, input) {
    validate(input);
    return evaluate(await loadTarget(db, scope, input), input).preview;
}

function operationResult(row, reused) {
    return { operationId: row.id, state: row.state, reused, ...row.result };
}

async function executeParticipantAction(pool, scope, input) {
    validate(input);
    expect(UUID.test(input.idempotencyKey) && /^[a-f0-9]{64}$/.test(input.previewHash || ''), 'INVALID_ACTION');
    const kind = `participant_${input.purpose}`;
    const actorKey = `user:${scope.userId}`;
    const requestHash = digest({ packageId: input.packageId, personId: input.personId, purpose: input.purpose,
        channel: input.channel || null, previewHash: input.previewHash });
    return transaction(pool, async db => {
        // One decision at a time per person and package, across tabs and keys.
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`signing-v2-action:${scope.contextId}:${input.packageId}:${input.personId}`]);
        const previous = await db.query(`SELECT * FROM signing_operations WHERE owner_context_id=$1 AND actor_key=$2 AND kind=$3 AND idempotency_key=$4`,
            [scope.contextId, actorKey, kind, input.idempotencyKey]);
        if (previous.rowCount) {
            if (previous.rows[0].request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 409);
            return operationResult(previous.rows[0], true);
        }
        const target = await loadTarget(db, scope, input, true);
        const { preview, channel, endpoint } = evaluate(target, input);
        const operationId = randomUUID();
        if (preview.reason === 'ALREADY_COMPLETED') {
            // The person finished while the dialog was open: record the decision, send nothing.
            const row = (await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result,completed_at)
                VALUES($1,$2,$3,$4,$5,$6,'complete',$7,clock_timestamp()) RETURNING *`, [operationId, scope.contextId, actorKey, kind,
                input.idempotencyKey, requestHash, { items: [{ personId: input.personId, state: 'skipped_completed' }] }])).rows[0];
            await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'action_skipped',$4)`,
                [scope.contextId, target.id, actorKey, { operationId, purpose: input.purpose, personId: input.personId, reason: 'ALREADY_COMPLETED' }]);
            return operationResult(row, false);
        }
        if (!preview.eligible) fail(preview.reason, 409);
        if (preview.previewHash !== input.previewHash) fail('PREVIEW_CHANGED', 412);
        const deliveryId = randomUUID();
        await db.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,grant_id,event_key,purpose,channel,target_snapshot)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [deliveryId, scope.contextId, target.profile.id, target.profile.version, input.purpose === 'completed_copy' ? null : target.grant_id,
            `${input.purpose}:${target.active_revision_id}:${input.personId}:${operationId}`, input.purpose, channel,
            { locale: target.profile.policy_snapshot.locale, endpoint,
                ...(input.purpose === 'completed_copy' ? { documents: documentManifest(target.documents) } : {}) }]);
        await enqueue(db, scope.contextId, [job('dispatch_delivery', deliveryId, target.revision_hash)]);
        const row = (await db.query(`INSERT INTO signing_operations(id,owner_context_id,actor_key,kind,idempotency_key,request_hash,state,result)
            VALUES($1,$2,$3,$4,$5,$6,'running',$7) RETURNING *`, [operationId, scope.contextId, actorKey, kind, input.idempotencyKey, requestHash,
            { items: [{ personId: input.personId, deliveryId, state: 'queued' }] }])).rows[0];
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,$3,'action_queued',$4)`,
            [scope.contextId, target.id, actorKey, { operationId, purpose: input.purpose, personId: input.personId, channel,
                taskIds: preview.tasks.map(task => task.taskId), documentIds: preview.documents.map(document => document.documentId) }]);
        return operationResult(row, false);
    });
}

// Item states come from the delivery rows, never from the HTTP acceptance.
async function operationStatus(db, scope, operationId) {
    expect(UUID.test(operationId), 'INVALID_ACTION');
    const found = await db.query(`SELECT * FROM signing_operations WHERE owner_context_id=$1 AND id=$2 AND actor_key=$3`,
        [scope.contextId, operationId, `user:${scope.userId}`]);
    if (!found.rowCount) fail('NOT_FOUND', 404);
    const operation = found.rows[0];
    const ids = (operation.result.items || []).map(item => item.deliveryId).filter(Boolean);
    const deliveries = new Map((await db.query(`SELECT id,state,error_code,attempted_at,provider_accepted_at FROM signing_deliveries
        WHERE owner_context_id=$1 AND id=ANY($2::uuid[])`, [scope.contextId, ids])).rows.map(row => [row.id, row]));
    const items = (operation.result.items || []).map(item => {
        const delivery = deliveries.get(item.deliveryId);
        if (!delivery) return item;
        const state = delivery.state === 'pending' || delivery.state === 'dispatching' ? 'queued' : delivery.state;
        return { ...item, state, errorCode: delivery.error_code, providerAcceptedAt: delivery.provider_accepted_at };
    });
    const open = items.some(item => item.state === 'queued');
    return { operationId, kind: operation.kind, createdAt: operation.created_at, state: open ? 'running' : operation.state === 'running' ? 'complete' : operation.state, items };
}

module.exports = { previewParticipantAction, executeParticipantAction, operationStatus, maskEndpoint, COOLDOWN_SECONDS };

const { expect, fail } = require('../../lib/signingV2/errors');
const { UUID } = require('../../lib/signingV2/compiler');
const { scopeParams } = require('./access');
const { projectionCte, projectionMetadata } = require('./management');

// Classify one package per canonical person/represented party/capacity before
// aggregating. Returning at a later stage cannot turn a partial signature into
// a completed package, and extra fields/documents cannot multiply packages.
async function participantSummary(db, scope, submissionId) {
    expect(UUID.test(submissionId), 'INVALID_SUBMISSION');
    const result = await db.query(`WITH ${projectionCte(scope, 5)}, participant_packages AS (
        SELECT p.id AS package_id,pp.person_id,pp.represented_party_id AS party_id,pp.capacity,
            min(pp.identity_snapshot->>'name') AS name,min(pp.identity_snapshot->>'partyName') AS party_name,
            count(DISTINCT pp.id) AS participation_count,count(DISTINCT t.document_id) AS document_count,
            count(*) AS task_count,count(*) FILTER (WHERE t.required AND t.state<>'cancelled') AS required_task_count,
            count(*) FILTER (WHERE t.state='accepted') AS accepted_task_count,
            count(*) FILTER (WHERE t.state='ready') AS ready_task_count,
            count(*) FILTER (WHERE t.state='blocked') AS waiting_task_count,
            count(*) FILTER (WHERE t.state IN ('declined','clarification','expired')) AS attention_task_count,
            count(*) FILTER (WHERE t.state='cancelled') AS not_required_task_count,
            CASE WHEN p.issue_count>0 OR p.workflow_state IN ('attention','expired','replacement_pending') THEN 'attention'
                WHEN bool_or(t.state='ready') THEN 'ready'
                WHEN bool_or(t.state='blocked') THEN 'waiting'
                ELSE 'complete' END AS participant_state
        FROM projected p JOIN signing_participations pp ON pp.owner_context_id=p.owner_context_id AND pp.revision_id=p.active_revision_id
        JOIN signing_tasks t ON t.owner_context_id=pp.owner_context_id AND t.revision_id=pp.revision_id AND t.participation_id=pp.id
        WHERE p.workflow_state NOT IN ('cancelled','superseded')
        GROUP BY p.id,p.issue_count,p.workflow_state,pp.person_id,pp.represented_party_id,pp.capacity
        HAVING count(*) FILTER (WHERE t.state<>'cancelled')>0
    ), grouped AS (
        SELECT person_id,party_id,capacity,min(name) AS name,min(party_name) AS party_name,count(*) AS package_count,
            count(*) FILTER (WHERE participant_state='attention') AS attention_packages,
            count(*) FILTER (WHERE participant_state='ready') AS ready_packages,
            count(*) FILTER (WHERE participant_state='waiting') AS waiting_packages,
            count(*) FILTER (WHERE participant_state='complete') AS complete_packages,
            sum(document_count) AS document_count,sum(participation_count) AS participation_count,
            sum(task_count) AS task_count,sum(required_task_count) AS required_task_count,
            sum(accepted_task_count) AS accepted_task_count,sum(ready_task_count) AS ready_task_count,
            sum(waiting_task_count) AS waiting_task_count,sum(attention_task_count) AS attention_task_count,
            sum(not_required_task_count) AS not_required_task_count
        FROM participant_packages GROUP BY person_id,party_id,capacity
    ) SELECT statement_timestamp() AS projection_as_of,EXISTS(SELECT 1 FROM authorized) AS group_exists,
        COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY name,party_name,capacity,person_id,party_id) FROM grouped g),'[]') AS rows`,
    [...scopeParams(scope), submissionId]);
    if (!result.rows[0].group_exists) fail('NOT_FOUND', 404);
    const fields = { person_id: 'personId', party_id: 'partyId', capacity: 'capacity', name: 'name', party_name: 'partyName' };
    const counters = { package_count: 'packageCount', attention_packages: 'attentionPackages', ready_packages: 'readyPackages',
        waiting_packages: 'waitingPackages', complete_packages: 'completePackages', document_count: 'documentCount',
        participation_count: 'participationCount', task_count: 'taskCount', required_task_count: 'requiredTaskCount',
        accepted_task_count: 'acceptedTaskCount', ready_task_count: 'readyTaskCount', waiting_task_count: 'waitingTaskCount',
        attention_task_count: 'attentionTaskCount', not_required_task_count: 'notRequiredTaskCount' };
    const rows = result.rows[0].rows.map(row => Object.fromEntries([
        ...Object.entries(fields).map(([column, field]) => [field, row[column]]),
        ...Object.entries(counters).map(([column, field]) => [field, Number(row[column])]),
    ]));
    const metadata = projectionMetadata(scope, result.rows[0].projection_as_of);
    return { rows, ...metadata, scope: { ...metadata.scope, submissionId }, summaryScope: 'all_authorized_active_children' };
}

module.exports = { participantSummary };

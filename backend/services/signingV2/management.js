const { expect, fail } = require('../../lib/signingV2/errors');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { packageScopeSql, scopeParams } = require('./access');

const PAGE_SIZE = 25;
function filters(input = {}) {
    const state = input.state || 'pending';
    expect(['pending', 'attention', 'complete', 'cancelled', 'all'].includes(state), 'INVALID_FILTER');
    const query = String(input.query || '').trim().slice(0, 100);
    const limit = input.limit === undefined ? PAGE_SIZE : Number(input.limit);
    expect(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_FILTER');
    let cursor = null;
    if (input.cursor) {
        expect(typeof input.cursor === 'string' && input.cursor.length < 300, 'INVALID_CURSOR');
        try { cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); }
        catch { fail('INVALID_CURSOR'); }
        expect(UUID.test(cursor.id) && typeof cursor.createdAt === 'string' && Number.isFinite(Date.parse(cursor.createdAt)), 'INVALID_CURSOR');
    }
    return { state, query, limit, cursor, pattern: `%${query.replace(/[%_\\]/g, '\\$&')}%` };
}

// Every aggregate starts from authorized packages. Joining actions and deliveries
// directly would multiply counts; each axis is aggregated separately first.
function projectionCte(scope) {
    const caseVisible = scope.caseView ? (scope.caseAll ? 'TRUE' : 'EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$3)') : 'FALSE';
    return `authorized AS (
        SELECT p.*,r.workflow_state,r.revision_hash,r.deadline,r.snapshot->>'locale' AS locale,
            COALESCE(p.submission_id,p.id) AS group_id,
            COALESCE(s.name,p.external_key) AS group_name,
            COALESCE(s.committed_at,p.created_at) AS group_created_at,
            s.template_version_id,t.name AS template_name,c.casename,c.companyname
        FROM signing_packages p
        JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        LEFT JOIN signing_submissions s ON s.owner_context_id=p.owner_context_id AND s.id=p.submission_id
        LEFT JOIN signing_template_versions v ON v.owner_context_id=s.owner_context_id AND v.id=s.template_version_id
        LEFT JOIN signing_templates t ON t.owner_context_id=v.owner_context_id AND t.id=v.template_id
        LEFT JOIN cases c ON c.caseid=p.case_id AND (${caseVisible}) AND
            (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM
            (SELECT law_firm_tenant_id::text FROM signing_owner_contexts WHERE id=p.owner_context_id)
        WHERE ${packageScopeSql('p')}
    ), task_counts AS (
        SELECT t.revision_id,count(*) FILTER (WHERE t.required) AS required_count,
            count(*) FILTER (WHERE t.required AND t.state='accepted') AS accepted_count,
            count(*) FILTER (WHERE t.state='ready') AS ready_count,
            count(*) FILTER (WHERE t.state IN ('declined','clarification','expired')) AS attention_count,
            min(t.stage) FILTER (WHERE t.state='ready' OR (t.required AND t.state IN ('declined','clarification','expired'))) AS current_stage
        FROM signing_tasks t JOIN authorized a ON a.owner_context_id=t.owner_context_id AND a.active_revision_id=t.revision_id
        GROUP BY t.revision_id
    ), document_counts AS (
        SELECT d.revision_id,count(*) AS document_count,
            count(*) FILTER (WHERE d.state IN ('ready','finalizing','final') AND d.prepared_artifact_id IS NOT NULL) AS prepared_count,
            count(*) FILTER (WHERE d.state='final' AND d.final_artifact_id IS NOT NULL) AS final_count,
            count(*) FILTER (WHERE d.state='failed') AS failed_count
        FROM signing_documents d JOIN authorized a ON a.owner_context_id=d.owner_context_id AND a.active_revision_id=d.revision_id
        GROUP BY d.revision_id
    ), delivery_rows AS (
        -- Only the latest attempt per person, channel and message kind decides attention:
        -- a successful resend clears an earlier failure instead of leaving it flagged forever.
        SELECT p.revision_id,d.state,d.attempted_at,
            row_number() OVER (PARTITION BY d.profile_id,d.channel,
                CASE WHEN d.purpose IN ('invitation','reminder','resend') THEN 'invite' ELSE d.purpose END
                ORDER BY d.created_at DESC,d.id DESC) AS recency
        FROM signing_delivery_profiles p JOIN authorized a ON a.owner_context_id=p.owner_context_id AND a.active_revision_id=p.revision_id
        JOIN signing_deliveries d ON d.owner_context_id=p.owner_context_id AND d.profile_id=p.id
    ), delivery_counts AS (
        SELECT revision_id,count(*) FILTER (WHERE state IN ('provider_accepted','delivered')) AS accepted_messages,
            count(*) FILTER (WHERE state='delivered') AS delivered_messages,
            count(*) FILTER (WHERE recency=1 AND state IN ('failed','uncertain')) AS delivery_issues,
            count(*) FILTER (WHERE state='pending') AS pending_messages,
            max(attempted_at) AS last_message_at
        FROM delivery_rows GROUP BY revision_id
    ), person_search AS (
        SELECT p.revision_id,string_agg(p.identity_snapshot->>'name',' ') AS person_names,
            string_agg(p.identity_snapshot->>'partyName',' ') AS party_names
        FROM signing_participations p JOIN authorized a ON a.owner_context_id=p.owner_context_id AND a.active_revision_id=p.revision_id
        GROUP BY p.revision_id
    ), projected AS (
        SELECT a.*,COALESCE(tc.required_count,0) AS required_count,COALESCE(tc.accepted_count,0) AS accepted_count,
            COALESCE(tc.ready_count,0) AS ready_count,tc.current_stage,
            COALESCE(dc.document_count,0) AS document_count,COALESCE(dc.prepared_count,0) AS prepared_count,COALESCE(dc.final_count,0) AS final_count,
            COALESCE(mc.accepted_messages,0) AS accepted_messages,COALESCE(mc.delivered_messages,0) AS delivered_messages,
            COALESCE(mc.pending_messages,0) AS pending_messages,mc.last_message_at,
            (COALESCE(tc.attention_count,0)+COALESCE(dc.failed_count,0)+COALESCE(mc.delivery_issues,0)) AS issue_count,
            ps.person_names,ps.party_names
        FROM authorized a LEFT JOIN task_counts tc ON tc.revision_id=a.active_revision_id
        LEFT JOIN document_counts dc ON dc.revision_id=a.active_revision_id
        LEFT JOIN delivery_counts mc ON mc.revision_id=a.active_revision_id
        LEFT JOIN person_search ps ON ps.revision_id=a.active_revision_id
    )`;
}

function queryMatchesSql(alias = 'p', parameter = 5) {
    return `($${parameter}='%%' OR ${alias}.external_key ILIKE $${parameter} OR ${alias}.group_name ILIKE $${parameter}
        OR ${alias}.template_name ILIKE $${parameter} OR ${alias}.person_names ILIKE $${parameter}
        OR ${alias}.party_names ILIKE $${parameter} OR ${alias}.casename ILIKE $${parameter}
        OR ${alias}.transaction_ref ILIKE $${parameter})`;
}

function stateMatchesSql(alias, parameter) {
    return `($${parameter}='all' OR ($${parameter}='complete' AND ${alias}.workflow_state='complete')
        OR ($${parameter}='cancelled' AND ${alias}.workflow_state='cancelled')
        OR ($${parameter}='pending' AND ${alias}.workflow_state NOT IN ('complete','cancelled','superseded'))
        OR ($${parameter}='attention' AND ${alias}.workflow_state NOT IN ('complete','cancelled','superseded')
            AND (${alias}.issue_count>0 OR ${alias}.workflow_state IN ('attention','expired'))))`;
}

function encodeCursor(row) {
    return Buffer.from(JSON.stringify({ id: row.id, createdAt: row.created_cursor })).toString('base64url');
}

async function listSubmissions(db, scope, input) {
    const filter = filters(input);
    const selectedId = input?.submissionId || null;
    expect(selectedId === null || UUID.test(selectedId), 'INVALID_SUBMISSION');
    const result = await db.query(`WITH ${projectionCte(scope)}, matching_groups AS (
        SELECT DISTINCT group_id FROM projected p WHERE ${queryMatchesSql()} AND ${stateMatchesSql('p', 6)}
            AND ($10::uuid IS NULL OR p.group_id=$10)
    ), grouped AS (
        SELECT p.group_id AS id,(array_agg(p.group_name))[1] AS name,min(p.group_created_at) AS created_at,
            bool_or(p.submission_id IS NOT NULL) AS is_batch,count(*) AS package_count,
            count(*) FILTER (WHERE p.workflow_state='complete') AS complete_count,
            count(*) FILTER (WHERE p.workflow_state='cancelled') AS cancelled_count,
            count(*) FILTER (WHERE p.workflow_state='authorized_preparing') AS preparing_count,
            count(*) FILTER (WHERE p.issue_count>0 OR p.workflow_state IN ('attention','expired')) AS attention_count,
            COALESCE(sum(p.required_count) FILTER (WHERE p.workflow_state NOT IN ('cancelled','superseded')),0) AS required_count,
            COALESCE(sum(p.accepted_count) FILTER (WHERE p.workflow_state NOT IN ('cancelled','superseded')),0) AS accepted_count,
            sum(p.document_count) AS document_count,sum(p.prepared_count) AS prepared_count,sum(p.final_count) AS final_count,
            sum(p.accepted_messages) AS accepted_messages,sum(p.delivered_messages) AS delivered_messages,
            max(p.last_message_at) AS last_message_at,
            bool_or(${queryMatchesSql()}) AS matches_search
        FROM projected p JOIN matching_groups m ON m.group_id=p.group_id GROUP BY p.group_id
    ), page AS (
        SELECT g.*,g.created_at::text AS created_cursor FROM grouped g
        WHERE ($7::timestamptz IS NULL OR (g.created_at,g.id)<($7::timestamptz,$8::uuid))
        ORDER BY g.created_at DESC,g.id DESC LIMIT $9
    ) SELECT (SELECT count(*) FROM grouped) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]') AS rows`,
    [...scopeParams(scope), filter.pattern, filter.state, filter.cursor?.createdAt || null, filter.cursor?.id || null, filter.limit + 1, selectedId]);
    const rows = result.rows[0].rows;
    const hasMore = rows.length > filter.limit;
    if (hasMore) rows.pop();
    return { rows, total: Number(result.rows[0].total), nextCursor: hasMore ? encodeCursor(rows.at(-1)) : null,
        summaryScope: 'all_authorized_children', state: filter.state, capabilities: { send: Boolean(scope.send) } };
}

async function listPackages(db, scope, groupId, input) {
    expect(groupId === null || UUID.test(groupId), 'INVALID_SUBMISSION');
    const filter = filters(input);
    const result = await db.query(`WITH ${projectionCte(scope)}, matches AS (
        SELECT p.id,p.external_key AS name,p.created_at,p.created_at::text AS created_cursor,p.active_revision_id AS revision_id,
            p.case_id,p.casename,p.workflow_state,p.required_count,p.accepted_count,p.ready_count,p.current_stage,
            p.document_count,p.prepared_count,p.final_count,p.accepted_messages,p.delivered_messages,p.pending_messages,p.last_message_at,p.issue_count,
            CASE WHEN p.person_names ILIKE $5 AND $5<>'%%' THEN 'person'
                 WHEN p.party_names ILIKE $5 AND $5<>'%%' THEN 'party' ELSE 'package' END AS match_reason
        FROM projected p WHERE ($7::uuid IS NULL OR p.group_id=$7) AND ${queryMatchesSql()} AND ${stateMatchesSql('p', 6)}
    ), page AS (
        SELECT * FROM matches WHERE ($8::timestamptz IS NULL OR (created_at,id)<($8::timestamptz,$9::uuid))
        ORDER BY created_at DESC,id DESC LIMIT $10
    ) SELECT (SELECT count(*) FROM matches) AS total,
        ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM authorized WHERE group_id=$7)) AS group_exists,
        COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]') AS rows`,
    [...scopeParams(scope), filter.pattern, filter.state, groupId, filter.cursor?.createdAt || null, filter.cursor?.id || null, filter.limit + 1]);
    if (!result.rows[0].group_exists) fail('NOT_FOUND', 404);
    const rows = result.rows[0].rows, hasMore = rows.length > filter.limit;
    if (hasMore) rows.pop();
    return { rows, total: Number(result.rows[0].total), nextCursor: hasMore ? encodeCursor(rows.at(-1)) : null,
        summaryScope: 'matching_children', capabilities: { send: Boolean(scope.send) } };
}

function documentSpots(bindings, participants) {
    const people = new Map((participants || []).map((person, index) => [`${person.roleKey}:${person.occurrence}`, { ...person, index }]));
    return (Array.isArray(bindings) ? bindings : []).filter(field => field && field.active !== false && field.type && field.type !== 'data').map(field => {
        const matches = (participants || []).filter(person => person.roleKey === field.roleKey);
        const person = people.get(`${field.roleKey}:${field.occurrence}`) || (matches.length === 1 ? { ...matches[0], index: participants.indexOf(matches[0]) } : null);
        return {
            id: field.id, pageNum: field.pageNum, x: field.x, y: field.y, width: field.width, height: field.height,
            type: field.type, required: Boolean(field.required), label: field.label || null,
            signerName: person?.name || null, signerIndex: person?.index ?? 0,
        };
    });
}

async function authorizedPackage(db, scope, packageId) {
    expect(UUID.test(packageId), 'INVALID_SUBMISSION');
    const header = await db.query(`WITH ${projectionCte(scope)} SELECT * FROM projected WHERE id=$5`, [...scopeParams(scope), packageId]);
    if (!header.rowCount) fail('NOT_FOUND', 404);
    return header.rows[0];
}

async function readReadyArtifact(db, contextId, artifactId, storage) {
    const artifact = (await db.query(`SELECT object_key,bytes,content_sha256,kind FROM signing_artifacts
        WHERE owner_context_id=$1 AND id=$2 AND state='ready'`, [contextId, artifactId])).rows[0];
    if (!artifact) fail('ARTIFACT_NOT_READY', 409);
    const bytes = await storage.read(artifact.object_key, Number(artifact.bytes));
    expect(bytesHash(bytes) === artifact.content_sha256, 'ARTIFACT_HASH_MISMATCH');
    return { bytes, kind: artifact.kind };
}

// Office viewers may see every completed stage of the active revision. Keep the
// polling version and the downloaded artifact on the same selection rule.
const currentDocumentArtifact = `COALESCE(d.final_artifact_id,
    (SELECT t.stage_artifact_id FROM signing_tasks t
     WHERE t.owner_context_id=d.owner_context_id AND t.revision_id=d.revision_id
       AND t.document_id=d.id AND t.stage_artifact_id IS NOT NULL
     ORDER BY t.stage DESC,t.id LIMIT 1),d.prepared_artifact_id,d.source_artifact_id)`;

async function packageDetails(db, scope, packageId) {
    const pkg = await authorizedPackage(db, scope, packageId);
    const result = await db.query(`SELECT
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'state',d.state,'informational',d.informational,
            'prepared',d.prepared_artifact_id IS NOT NULL,'final',d.final_artifact_id IS NOT NULL,
            'artifactVersion',${currentDocumentArtifact},'bindings',d.field_bindings) ORDER BY d.document_key)
            FROM signing_documents d WHERE d.owner_context_id=$1 AND d.revision_id=$2),'[]') AS documents,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'personId',p.person_id,'name',p.identity_snapshot->>'name',
            'partyName',p.identity_snapshot->>'partyName','roleKey',p.role_key,'capacity',p.capacity,'occurrence',p.occurrence,
            'tasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'documentId',t.document_id,'stage',t.stage,'state',t.state,
                'required',t.required,'acceptedAt',a.accepted_at) ORDER BY t.stage,td.document_key)
                FROM signing_tasks t JOIN signing_documents td ON td.owner_context_id=t.owner_context_id AND td.id=t.document_id
                LEFT JOIN signing_actions a ON a.owner_context_id=t.owner_context_id AND a.task_id=t.id
                WHERE t.owner_context_id=p.owner_context_id AND t.participation_id=p.id),'[]')) ORDER BY p.role_key,p.occurrence)
            FROM signing_participations p WHERE p.owner_context_id=$1 AND p.revision_id=$2),'[]') AS participants,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'personId',p.person_id,'purpose',d.purpose,'channel',d.channel,
            'state',d.state,'attemptedAt',d.attempted_at,'providerAcceptedAt',d.provider_accepted_at,'deliveredAt',d.delivered_at,'errorCode',d.error_code)
            ORDER BY d.created_at DESC,d.id)
            FROM signing_deliveries d JOIN signing_delivery_profiles p ON p.owner_context_id=d.owner_context_id AND p.id=d.profile_id
            WHERE p.owner_context_id=$1 AND p.revision_id=$2),'[]') AS deliveries`, [scope.contextId, pkg.active_revision_id]);
    const body = result.rows[0];
    body.documents = body.documents.map(document => {
        const spots = documentSpots(document.bindings, body.participants);
        const { bindings, ...rest } = document;
        return { ...rest, spots };
    });
    const issues = (await db.query(`SELECT i.id,i.task_id AS "taskId",i.kind,i.reason,i.state,i.created_at AS "createdAt",
            i.resolution,i.resolved_at AS "resolvedAt",p.person_id AS "personId",p.identity_snapshot->>'name' AS "personName",d.name AS "documentName",
            (i.state='open' AND r.workflow_state IN ('active','attention') AND (r.deadline IS NULL OR r.deadline>clock_timestamp()) AND t.stage=(SELECT min(t2.stage) FROM signing_tasks t2
                WHERE t2.owner_context_id=t.owner_context_id AND t2.revision_id=t.revision_id AND t2.required AND t2.state NOT IN ('accepted','cancelled'))) AS "canResume"
        FROM signing_task_issues i JOIN signing_tasks t ON t.owner_context_id=i.owner_context_id AND t.id=i.task_id
        JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
        JOIN signing_documents d ON d.owner_context_id=t.owner_context_id AND d.id=t.document_id
        JOIN signing_package_revisions r ON r.owner_context_id=t.owner_context_id AND r.id=t.revision_id
        WHERE i.owner_context_id=$1 AND t.revision_id=$2 ORDER BY i.created_at DESC,i.id`, [scope.contextId,pkg.active_revision_id])).rows;
    return { package: pkg, ...body, issues, capabilities: { send: scope.send === true, manage: scope.manage === true, contactCorrect: scope.contactCorrect === true, linkRenew: scope.linkRenew === true } };
}

async function packageDocumentFile(db, scope, packageId, documentId, storage) {
    const pkg = await authorizedPackage(db, scope, packageId);
    if (!UUID.test(String(documentId))) fail('NOT_FOUND', 404);
    const document = (await db.query(`SELECT d.name,d.final_artifact_id,${currentDocumentArtifact} AS artifact_id
        FROM signing_documents d WHERE d.owner_context_id=$1 AND d.revision_id=$2 AND d.id=$3`,
    [scope.contextId, pkg.active_revision_id, documentId])).rows[0];
    if (!document) fail('NOT_FOUND', 404);
    const artifactId = document.artifact_id;
    if (!artifactId) fail('ARTIFACT_NOT_READY', 409);
    const file = await readReadyArtifact(db, scope.contextId, artifactId, storage);
    return { bytes: file.bytes, name: document.name, final: Boolean(document.final_artifact_id) };
}

async function packageEvidenceFile(db, scope, packageId, storage) {
    const pkg = await authorizedPackage(db, scope, packageId);
    if (pkg.workflow_state !== 'complete') fail('NOT_FOUND', 404);
    const artifact = (await db.query(`SELECT id FROM signing_artifacts
        WHERE owner_context_id=$1 AND kind='evidence' AND state='ready' AND inputs_hash=$2`,
    [scope.contextId, digest({ revisionId: pkg.active_revision_id, revisionHash: pkg.revision_hash, kind: 'evidence' })])).rows[0];
    if (!artifact) fail('ARTIFACT_NOT_READY', 409);
    return readReadyArtifact(db, scope.contextId, artifact.id, storage);
}

module.exports = {
    listSubmissions, listPackages, packageDetails, packageDocumentFile, packageEvidenceFile,
    filters, projectionCte, queryMatchesSql, stateMatchesSql, documentSpots,
};

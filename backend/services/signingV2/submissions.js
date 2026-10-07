const { randomUUID } = require('node:crypto');
const { validateDefinition, compilePackage, admission, UUID } = require('../../lib/signingV2/compiler');
const { digest, canonical } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const limits = require('../../lib/signingV2/limits');
const { transaction } = require('./transaction');
const { assertCases, scopeParams, packageScopeSql } = require('./access');
const { personScopeSql } = require('./people');
const { job, enqueue } = require('./jobs');

function validateInput(input) {
    expect(UUID.test(input.idempotencyKey) && UUID.test(input.templateVersionId), 'INVALID_SUBMISSION');
    expect(typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 300, 'INVALID_SUBMISSION');
    expect(Array.isArray(input.packages) && input.packages.length > 0 && input.packages.length <= limits.packages, 'CAPACITY_BUDGET_EXCEEDED');
    const keys = new Set();
    for (const item of input.packages) {
        expect(typeof item.externalKey === 'string' && item.externalKey.length > 0 && item.externalKey.length <= 200 && !keys.has(item.externalKey), 'DUPLICATE_PACKAGE_KEY');
        keys.add(item.externalKey);
        expect(item.caseId == null || (Number.isSafeInteger(item.caseId) && item.caseId > 0), 'INVALID_SUBMISSION');
    }
    expect(Buffer.byteLength(canonical(input)) <= limits.snapshotBytes, 'CAPACITY_BUDGET_EXCEEDED');
}

async function loadDirectory(db, scope, definition, packages) {
    const people = new Set(), parties = new Set(), authorities = new Set();
    for (const item of packages) for (const assignments of Object.values(item.roles || {})) {
        expect(Array.isArray(assignments), 'INVALID_ROLE_BINDING');
        for (const assignment of assignments) {
            expect(assignment && UUID.test(assignment.personId) && UUID.test(assignment.partyId), 'INVALID_ROLE_BINDING');
            people.add(assignment.personId); parties.add(assignment.partyId);
            if (assignment.authorityId) {
                expect(UUID.test(assignment.authorityId), 'INVALID_ROLE_BINDING');
                authorities.add(assignment.authorityId);
            }
        }
    }
    // Four set-based lookups for the entire batch. Locks preserve the approved
    // snapshot until commit; source bytes never enter this transaction.
    const queries = [
        ['people', 'signing_people', [...people]],
        ['parties', 'signing_parties', [...parties]],
        ['authorities', 'signing_authorities', [...authorities]],
        ['sources', 'signing_artifacts', [...new Set(definition.documents.map(doc => doc.sourceArtifactId))]],
    ];
    const directory = {};
    for (const [key, table, ids] of queries) {
        let result;
        if (key === 'people') {
            result = await db.query(`SELECT person.* FROM signing_people person WHERE ${personScopeSql()}
                AND person.id=ANY($5::uuid[]) ORDER BY person.id FOR SHARE OF person`, [...scopeParams(scope), ids]);
        } else if (key === 'parties') {
            result = await db.query(`SELECT party.* FROM signing_parties party WHERE party.owner_context_id=$1
                AND party.id=ANY($5::uuid[]) AND ($2::boolean OR party.created_by=$3
                    OR party.person_id=ANY($6::uuid[]) OR EXISTS (
                        SELECT 1 FROM signing_participations participation
                        JOIN signing_package_revisions revision ON revision.owner_context_id=participation.owner_context_id AND revision.id=participation.revision_id
                        JOIN signing_packages p ON p.owner_context_id=revision.owner_context_id AND p.id=revision.package_id
                        WHERE participation.owner_context_id=party.owner_context_id AND participation.represented_party_id=party.id AND ${packageScopeSql('p')}))
                ORDER BY party.id FOR SHARE OF party`, [...scopeParams(scope), ids, [...directory.people.keys()]]);
        } else {
            result = await db.query(`SELECT * FROM ${table} WHERE owner_context_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`, [scope.contextId, ids]);
        }
        if (result.rowCount !== ids.length) fail('PARTICIPANT_NOT_AVAILABLE', 404);
        directory[key] = new Map(result.rows.map(row => [row.id, row]));
    }
    return directory;
}

function previewHash(template, packages, compiled) {
    return digest({ templateVersionId: template.id, definitionHash: template.definition_hash, packages,
        revisionHashes: compiled.map(item => item.hash) });
}

function resultFor(submission, reused) {
    return {
        submissionId: submission.id, state: submission.state, reused,
        durable: true, committedAt: submission.committed_at,
        packageCount: submission.package_count, documentCount: submission.document_count,
        receiptKind: 'durable_creation',
    };
}

async function createSubmission(pool, scope, input, { reserveCapacity } = {}) {
    validateInput(input);
    // This adapter is mandatory: technical budgets must never bypass the office's
    // commercial quota. The HTTP integration supplies the transactional adapter.
    expect(typeof reserveCapacity === 'function', 'CAPACITY_ADAPTER_REQUIRED');
    const requestHash = digest(input);
    return transaction(pool, async db => {
        // Serialize only retries of this exact request, not every office batch.
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`signing-v2:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
        const previous = await db.query(`SELECT * FROM signing_submissions
            WHERE owner_context_id=$1 AND owner_userid=$2 AND idempotency_key=$3`, [scope.contextId, scope.userId, input.idempotencyKey]);
        if (previous.rowCount) {
            if (previous.rows[0].request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 409);
            return resultFor(previous.rows[0], true);
        }
        const templates = await db.query(`SELECT v.* FROM signing_template_versions v
            JOIN signing_templates t ON t.owner_context_id=v.owner_context_id AND t.id=v.template_id
            WHERE v.owner_context_id=$1 AND v.id=$2 AND v.state='published' AND NOT t.archived
              AND ($3::boolean OR t.owner_userid=$4) FOR SHARE OF v,t`, [scope.contextId, input.templateVersionId, scope.all, scope.userId]);
        if (!templates.rowCount) fail('NOT_FOUND', 404);
        const template = templates.rows[0];
        const definition = validateDefinition(template.definition);
        expect(digest(definition) === template.definition_hash, 'TEMPLATE_CHANGED');
        // These policies use the prepared-package approval route; a bulk fast path
        // cannot silently waive their review requirement.
        expect(!definition.policy.internalApproval && !definition.policy.requiredAllPdfReview, 'APPROVAL_REQUIRED');
        await assertCases(db, scope, [...new Set(input.packages.map(item => item.caseId).filter(Boolean))]);
        const directory = await loadDirectory(db, scope, definition, input.packages);
        const compiled = input.packages.map(item => compilePackage(definition, item, directory));
        if (input.previewHash !== previewHash(template, input.packages, compiled)) fail('PREVIEW_CHANGED', 412);
        const capacity = admission(compiled);
        const submissionId = randomUUID();
        await reserveCapacity(db, scope, capacity, submissionId);
        const submission = (await db.query(`INSERT INTO signing_submissions
            (id,owner_context_id,owner_userid,template_version_id,name,idempotency_key,request_hash,package_count,document_count)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [submissionId, scope.contextId, scope.userId, template.id, input.name.trim(), input.idempotencyKey, requestHash, capacity.packages, capacity.documents])).rows[0];
        const rows = buildRows(input.packages, compiled);
        await persistRows(db, scope, submissionId, rows);
        await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details)
            SELECT $1,id,$2,'package_authorized',jsonb_build_object('submissionId',$3::text,'revisionHash',revision_hash)
            FROM jsonb_to_recordset($4::jsonb) AS p(id uuid,revision_hash text)`,
        [scope.contextId, `user:${scope.userId}`, submissionId, JSON.stringify(rows.packages)]);
        // transaction() returns only AFTER the commit completes, including every
        // document, task, delivery intent, job and dependency.
        return resultFor(submission, false);
    });
}

function buildRows(inputs, compiled) {
    const rows = { packages: [], revisions: [], participations: [], documents: [], tasks: [], profiles: [], deliveries: [], jobs: [], dependencies: [] };
    compiled.forEach(({ snapshot, hash, hashVersion }, index) => {
        const input = inputs[index], packageId = randomUUID(), revisionId = randomUUID();
        rows.packages.push({ id: packageId, external_key: input.externalKey, case_id: input.caseId || null,
            transaction_ref: input.transactionRef || null, active_revision_id: revisionId, revision_hash: hash });
        rows.revisions.push({ id: revisionId, package_id: packageId, snapshot, revision_hash: hash, hash_version: hashVersion, deadline: snapshot.deadline });
        const participants = new Map(), documents = new Map();
        snapshot.participants.forEach(participant => {
            const id = randomUUID(); participants.set(`${participant.roleKey}:${participant.occurrence}`, id);
            rows.participations.push({ id, revision_id: revisionId, person_id: participant.personId, represented_party_id: participant.partyId,
                role_key: participant.roleKey, occurrence: participant.occurrence, capacity: participant.capacity,
                authority_id: participant.authorityId, authority_version: participant.authorityVersion, identity_snapshot: participant.identity });
        });
        const validate = job('validate_package', revisionId, hash), activate = job('activate_package', revisionId, hash);
        rows.jobs.push(validate, activate);
        rows.dependencies.push({ job_id: activate.id, depends_on_id: validate.id });
        snapshot.documents.forEach(document => {
            const id = randomUUID(); documents.set(document.key, id);
            rows.documents.push({ id, revision_id: revisionId, document_key: document.key, name: document.name,
                source_artifact_id: document.sourceArtifactId, informational: document.informational,
                inclusion_reason: document.inclusionReason, field_bindings: document.fields });
            const prepare = job('prepare_document', id, digest({ revision: hash, document: document.key }));
            rows.jobs.push(prepare); rows.dependencies.push({ job_id: validate.id, depends_on_id: prepare.id });
        });
        snapshot.tasks.forEach(task => rows.tasks.push({ id: randomUUID(), revision_id: revisionId,
            document_id: documents.get(task.documentKey), participation_id: participants.get(`${task.roleKey}:${task.occurrence}`),
            stage: task.stage, required: task.required, field_ids: task.fieldIds }));
        snapshot.delivery.forEach(profile => {
            const id = randomUUID();
            rows.profiles.push({ id, revision_id: revisionId, person_id: profile.personId,
                endpoints_snapshot: { email: profile.email, phone: profile.phone },
                policy_snapshot: { locale: profile.locale, channels: profile.channels, ...snapshot.policy } });
            // Intent exists durably even for a later stage. Dispatch rechecks the
            // current person's tasks and cannot send until that stage is ready.
            for (const channel of profile.channels) {
                const deliveryId = randomUUID();
                rows.deliveries.push({ id: deliveryId, profile_id: id, channel, event_key: `invite:${revisionId}:${profile.personId}`,
                    target_snapshot: { locale: profile.locale, endpoint: channel === 'email' ? profile.email : channel === 'sms' ? profile.phone : null } });
                const dispatch = job('dispatch_delivery', deliveryId, hash);
                rows.jobs.push(dispatch); rows.dependencies.push({ job_id: dispatch.id, depends_on_id: activate.id });
            }
        });
    });
    return rows;
}

async function persistRows(db, scope, submissionId, rows) {
    const contextId = scope.contextId;
    await db.query(`INSERT INTO signing_packages(id,owner_context_id,submission_id,external_key,owner_userid,case_id,transaction_ref,active_revision_id)
        SELECT id,$1,$2,external_key,$3,case_id,transaction_ref,active_revision_id FROM jsonb_to_recordset($4::jsonb)
        AS p(id uuid,external_key text,case_id integer,transaction_ref text,active_revision_id uuid)`, [contextId, submissionId, scope.userId, JSON.stringify(rows.packages)]);
    await db.query(`INSERT INTO signing_package_revisions(id,owner_context_id,package_id,revision_no,workflow_state,snapshot,revision_hash,hash_version,deadline)
        SELECT id,$1,package_id,1,'authorized_preparing',snapshot,revision_hash,hash_version,deadline FROM jsonb_to_recordset($2::jsonb)
        AS r(id uuid,package_id uuid,snapshot jsonb,revision_hash text,hash_version text,deadline timestamptz)`, [contextId, JSON.stringify(rows.revisions)]);
    await db.query(`INSERT INTO signing_participations(id,owner_context_id,revision_id,person_id,represented_party_id,role_key,occurrence,capacity,authority_id,authority_version,identity_snapshot)
        SELECT id,$1,revision_id,person_id,represented_party_id,role_key,occurrence,capacity,authority_id,authority_version,identity_snapshot FROM jsonb_to_recordset($2::jsonb)
        AS p(id uuid,revision_id uuid,person_id uuid,represented_party_id uuid,role_key text,occurrence integer,capacity text,authority_id uuid,authority_version integer,identity_snapshot jsonb)`, [contextId, JSON.stringify(rows.participations)]);
    await db.query(`INSERT INTO signing_documents(id,owner_context_id,revision_id,document_key,name,source_artifact_id,informational,inclusion_reason,field_bindings)
        SELECT id,$1,revision_id,document_key,name,source_artifact_id,informational,inclusion_reason,field_bindings FROM jsonb_to_recordset($2::jsonb)
        AS d(id uuid,revision_id uuid,document_key text,name text,source_artifact_id uuid,informational boolean,inclusion_reason jsonb,field_bindings jsonb)`, [contextId, JSON.stringify(rows.documents)]);
    await db.query(`INSERT INTO signing_tasks(id,owner_context_id,revision_id,document_id,participation_id,stage,required,field_ids)
        SELECT id,$1,revision_id,document_id,participation_id,stage,required,field_ids FROM jsonb_to_recordset($2::jsonb)
        AS t(id uuid,revision_id uuid,document_id uuid,participation_id uuid,stage integer,required boolean,field_ids jsonb)`, [contextId, JSON.stringify(rows.tasks)]);
    await db.query(`INSERT INTO signing_delivery_profiles(id,owner_context_id,revision_id,person_id,endpoints_snapshot,policy_snapshot)
        SELECT id,$1,revision_id,person_id,endpoints_snapshot,policy_snapshot FROM jsonb_to_recordset($2::jsonb)
        AS p(id uuid,revision_id uuid,person_id uuid,endpoints_snapshot jsonb,policy_snapshot jsonb)`, [contextId, JSON.stringify(rows.profiles)]);
    await db.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,event_key,purpose,channel,target_snapshot)
        SELECT id,$1,profile_id,1,event_key,'invitation',channel,target_snapshot FROM jsonb_to_recordset($2::jsonb)
        AS d(id uuid,profile_id uuid,event_key text,channel text,target_snapshot jsonb)`, [contextId, JSON.stringify(rows.deliveries)]);
    await enqueue(db, contextId, rows.jobs, rows.dependencies);
}

module.exports = { createSubmission, loadDirectory, previewHash, buildRows };

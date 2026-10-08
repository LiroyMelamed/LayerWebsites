const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest, canonical } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');
const { loadVersion, createFromRowsInTransaction } = require('./creation');
const { resultFor } = require('./submissions');
const { assertCases, assertClients } = require('./access');
const { caseId } = require('./caseContext');
const { clientId } = require('./clientContext');

function validatePayload(payload) {
    expect(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_DRAFT');
    expect(Buffer.byteLength(canonical(payload)) <= 1024 * 1024, 'DRAFT_TOO_LARGE');
    const input = payload.request;
    expect(input && typeof input === 'object' && UUID.test(input.templateVersionId), 'INVALID_DRAFT');
    expect(!Object.hasOwn(input, 'idempotencyKey') && !Object.hasOwn(input, 'previewHash'), 'INVALID_DRAFT');
    expect(typeof input.name === 'string' && input.name.length <= 300, 'INVALID_DRAFT');
    expect(Array.isArray(input.rows) && input.rows.length <= 200, 'INVALID_DRAFT');
    // Invalid/incomplete contacts are legitimate drafts. They are fully checked at
    // preview and submit, while scope and resource limits are checked on every save.
    return { templateVersionId: input.templateVersionId, caseId: input.caseId == null ? null : caseId(input.caseId),
        clientId: input.clientId == null ? null : clientId(input.clientId) };
}

function description(row) {
    return { id: row.id, version: row.edit_version, state: row.state, updatedAt: row.updated_at,
        expiresAt: row.expires_at, payload: row.payload };
}

async function owned(db, scope, id, lock = false) {
    expect(UUID.test(id), 'INVALID_DRAFT');
    const row = (await db.query(`SELECT * FROM signing_creation_drafts WHERE id=$1 AND owner_context_id=$2 AND owner_userid=$3
        AND (state='submitted' OR expires_at > clock_timestamp()) ${lock ? 'FOR UPDATE' : ''}`,
    [id, scope.contextId, scope.userId])).rows[0];
    // Private draft data is never expanded by the office-wide package-view flag.
    if (!row) fail('NOT_FOUND', 404);
    await assertCases(db, scope, row.case_id ? [row.case_id] : []);
    await assertClients(db, scope, row.payload?.request?.clientId == null ? [] : [clientId(row.payload.request.clientId)], lock);
    return row;
}

async function receipt(db, scope, row) {
    const value = (await db.query('SELECT * FROM signing_submissions WHERE owner_context_id=$1 AND owner_userid=$2 AND id=$3',
        [scope.contextId, scope.userId, row.submission_id])).rows[0];
    expect(value, 'NOT_FOUND');
    return resultFor(value, true);
}

async function getDraft(pool, scope, id) {
    const row = await owned(pool, scope, id);
    return { ...description(row), ...(row.state === 'submitted' ? { result: await receipt(pool, scope, row) } : {}) };
}

async function listDrafts(pool, scope) {
    // No recipient names/contacts in the recovery list. Opening rechecks case
    // access; a revoked case cannot disclose its saved form to a former assignee.
    return { rows: (await pool.query(`SELECT id,edit_version AS version,state,updated_at AS "updatedAt"
        FROM signing_creation_drafts WHERE owner_context_id=$1 AND owner_userid=$2 AND expires_at > clock_timestamp()
        ORDER BY updated_at DESC,id LIMIT 30`, [scope.contextId, scope.userId])).rows };
}

async function saveDraft(pool, scope, id, { expectedVersion, payload }) {
    expect(UUID.test(id) && Number.isSafeInteger(expectedVersion) && expectedVersion >= 0, 'INVALID_DRAFT');
    const context = validatePayload(payload), hash = digest(payload);
    await loadVersion(pool, scope, context.templateVersionId);
    await assertCases(pool, scope, context.caseId ? [context.caseId] : []);
    return transaction(pool, async db => {
        await assertClients(db, scope, context.clientId ? [context.clientId] : [], true);
        if (expectedVersion === 0) {
            const inserted = await db.query(`INSERT INTO signing_creation_drafts
                (id,owner_context_id,owner_userid,template_version_id,case_id,payload,payload_hash,submission_key)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING *`,
            [id, scope.contextId, scope.userId, context.templateVersionId, context.caseId, payload, hash, randomUUID()]);
            if (inserted.rowCount) return description(inserted.rows[0]);
        }
        const row = await owned(db, scope, id, true);
        if (row.state !== 'editing') fail('DRAFT_ALREADY_SUBMITTED', 409);
        // A lost save response can be retried without changing its revision. A
        // different edit from a stale tab never overwrites the current draft.
        if (row.payload_hash === hash) return description(row);
        if (row.edit_version !== expectedVersion) fail('DRAFT_CHANGED', 412);
        const updated = await db.query(`UPDATE signing_creation_drafts SET template_version_id=$1,case_id=$2,payload=$3,payload_hash=$4,
            edit_version=edit_version+1,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 days' WHERE id=$5 RETURNING *`,
        [context.templateVersionId, context.caseId, payload, hash, id]);
        return description(updated.rows[0]);
    });
}

async function submitDraft(pool, scope, id, { expectedVersion, previewHash }, options) {
    expect(Number.isSafeInteger(expectedVersion) && expectedVersion > 0 && /^[a-f0-9]{64}$/.test(previewHash || ''), 'INVALID_DRAFT');
    return transaction(pool, async db => {
        const row = await owned(db, scope, id, true);
        if (row.state === 'submitted') return { ...description(row), result: await receipt(db, scope, row) };
        if (row.edit_version !== expectedVersion) fail('DRAFT_CHANGED', 412);
        const result = await createFromRowsInTransaction(db, scope,
            { ...row.payload.request, idempotencyKey: row.submission_key, previewHash }, options);
        const updated = (await db.query(`UPDATE signing_creation_drafts SET state='submitted',submission_id=$1,
            edit_version=edit_version+1,updated_at=clock_timestamp() WHERE id=$2 RETURNING *`, [result.submissionId, id])).rows[0];
        // The draft receipt and all packages/jobs commit together. A process loss
        // before commit rolls everything back; after commit GET returns this run.
        return { ...description(updated), result };
    });
}

module.exports = { getDraft, listDrafts, saveDraft, submitDraft };

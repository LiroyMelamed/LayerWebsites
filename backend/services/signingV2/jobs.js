const { digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');

const KINDS = new Set(['prepare_document', 'validate_package', 'activate_package', 'render_stage',
    'finalize_document', 'render_evidence', 'dispatch_delivery', 'reconcile_delivery']);

async function enqueue(db, contextId, jobs, dependencies = []) {
    if (!jobs.length) return;
    for (const job of jobs) expect(KINDS.has(job.kind), 'INVALID_JOB');
    await db.query(`INSERT INTO signing_jobs (id,owner_context_id,kind,subject_id,dedupe_key,input_hash)
        SELECT id,$1,kind,subject_id,dedupe_key,input_hash FROM jsonb_to_recordset($2::jsonb)
        AS j(id uuid,kind text,subject_id uuid,dedupe_key text,input_hash text)
        ON CONFLICT(owner_context_id,dedupe_key) DO NOTHING`, [contextId, JSON.stringify(jobs)]);
    if (dependencies.length) await db.query(`INSERT INTO signing_job_dependencies(owner_context_id,job_id,depends_on_id)
        SELECT $1,job_id,depends_on_id FROM jsonb_to_recordset($2::jsonb) AS d(job_id uuid,depends_on_id uuid)
        ON CONFLICT DO NOTHING`, [contextId, JSON.stringify(dependencies)]);
}

function job(kind, subjectId, inputHash) {
    expect(KINDS.has(kind), 'INVALID_JOB');
    const hash = digest({ kind, subjectId, inputHash });
    // Stable IDs also keep dependency edges correct when an enqueue is replayed.
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return { id, kind, subject_id: subjectId, input_hash: inputHash, dedupe_key: `${kind}:${subjectId}:${inputHash}` };
}

// Expired render work is retryable. A dispatch worker may have reached the provider:
// that work is deliberately quarantined instead of sending another message.
async function recoverExpired(db) {
    return db.query(`UPDATE signing_jobs SET
        state=CASE WHEN kind='dispatch_delivery' THEN 'uncertain'
                   WHEN attempts >= max_attempts THEN 'needs_attention' ELSE 'retry' END,
        error_code=CASE WHEN kind='dispatch_delivery' THEN 'PROVIDER_OUTCOME_UNKNOWN' ELSE 'WORKER_LEASE_EXPIRED' END,
        leased_by=NULL,lease_until=NULL,available_at=clock_timestamp(),fencing_token=fencing_token+1
        WHERE state='running' AND lease_until < clock_timestamp()
        RETURNING id,owner_context_id,kind,subject_id,state`);
}

// Cancellation never takes a job lock while holding the package lock. Retire
// its PDF/activation work here, including abandoned in-flight leases, so a
// deliberate cancellation does not become an operational failure/retry alert.
// Deliveries are excluded: a bundled delivery can still serve other packages,
// and an attempted network send must retain its truthful outcome.
async function cancelObsolete(db, contextIds = null) {
    return db.query(`WITH obsolete AS (
        SELECT j.id FROM signing_jobs j
        LEFT JOIN signing_documents d ON d.owner_context_id=j.owner_context_id AND d.id=j.subject_id
            AND j.kind IN ('prepare_document','finalize_document')
        JOIN signing_package_revisions r ON r.owner_context_id=j.owner_context_id
            AND r.id=CASE WHEN j.kind IN ('prepare_document','finalize_document') THEN d.revision_id ELSE j.subject_id END
        WHERE j.kind IN ('prepare_document','validate_package','activate_package','render_stage','finalize_document','render_evidence')
            AND j.state IN ('pending','retry','running','needs_attention')
            AND r.workflow_state IN ('cancelled','superseded','replacement_pending')
            AND ($1::uuid[] IS NULL OR j.owner_context_id=ANY($1::uuid[]))
    ) UPDATE signing_jobs j SET state='cancelled',error_code='REVISION_INACTIVE',completed_at=clock_timestamp(),
        leased_by=NULL,lease_until=NULL,fencing_token=fencing_token+1
        FROM obsolete o WHERE j.id=o.id AND j.state IN ('pending','retry','running','needs_attention') RETURNING j.id`,[contextIds]);
}

async function claim(db, { workerId, kinds, limit = 1, leaseSeconds = 60, contextIds = null }) {
    expect(typeof workerId === 'string' && workerId.length <= 100 && workerId.length > 0, 'INVALID_JOB');
    expect(Array.isArray(kinds) && kinds.length > 0 && kinds.every(kind => KINDS.has(kind)), 'INVALID_JOB');
    expect(Number.isInteger(limit) && limit >= 1 && limit <= 8, 'INVALID_JOB');
    expect(Number.isInteger(leaseSeconds) && leaseSeconds >= 5 && leaseSeconds <= 300, 'INVALID_JOB');
    const result = await db.query(`WITH eligible AS (
        SELECT j.id,j.owner_context_id,j.created_at,
            row_number() OVER (PARTITION BY j.owner_context_id ORDER BY j.available_at,j.created_at,j.id) AS office_order
        FROM signing_jobs j
        WHERE j.kind=ANY($1::text[]) AND j.state IN ('pending','retry') AND j.available_at <= clock_timestamp()
          AND ($5::uuid[] IS NULL OR j.owner_context_id=ANY($5::uuid[]))
          AND j.attempts < j.max_attempts
          AND (j.kind<>'activate_package' OR NOT EXISTS (
            SELECT 1 FROM signing_package_revisions r WHERE r.owner_context_id=j.owner_context_id AND r.id=j.subject_id
            AND ((r.snapshot->'policy'->>'internalApproval')::boolean IS TRUE OR (r.snapshot->'policy'->>'requiredAllPdfReview')::boolean IS TRUE)
            AND NOT EXISTS (SELECT 1 FROM signing_approvals a WHERE a.owner_context_id=r.owner_context_id AND a.revision_id=r.id
                AND a.revision_hash=r.revision_hash AND a.preview_hash=r.preview_hash)))
          AND NOT EXISTS (SELECT 1 FROM signing_job_dependencies d
            JOIN signing_jobs p ON p.owner_context_id=d.owner_context_id AND p.id=d.depends_on_id
            WHERE d.owner_context_id=j.owner_context_id AND d.job_id=j.id AND p.state <> 'complete' AND NOT (j.kind='dispatch_delivery' AND p.state='cancelled'))
    ), picked AS (
        SELECT j.id FROM signing_jobs j JOIN eligible e ON e.id=j.id
        WHERE j.state IN ('pending','retry') AND j.available_at <= clock_timestamp() AND j.attempts < j.max_attempts
        ORDER BY e.office_order,e.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT $2
    ) UPDATE signing_jobs j SET state='running',attempts=attempts+1,
        leased_by=$3,lease_until=clock_timestamp()+make_interval(secs=>$4),fencing_token=fencing_token+1
        FROM picked p WHERE j.id=p.id RETURNING j.*`, [kinds, limit, workerId, leaseSeconds, contextIds]);
    return result.rows;
}

async function heartbeat(db, lease, seconds = 60) {
    expect(Number.isInteger(seconds) && seconds >= 5 && seconds <= 300, 'INVALID_JOB');
    const result = await db.query(`UPDATE signing_jobs SET lease_until=clock_timestamp()+make_interval(secs=>$5)
        WHERE owner_context_id=$1 AND id=$2 AND state='running' AND fencing_token=$3 AND leased_by=$4
          AND lease_until > clock_timestamp() RETURNING id`,
    [lease.owner_context_id, lease.id, lease.fencing_token, lease.leased_by, seconds]);
    return result.rowCount === 1;
}

// All artifact/state writes must be in this transaction. Checking a lease before an
// upload is not enough: only the current fencing token may publish its result.
async function complete(pool, lease, applyResult) {
    return transaction(pool, async db => {
        const locked = await db.query(`SELECT id FROM signing_jobs WHERE owner_context_id=$1 AND id=$2
            AND state='running' AND fencing_token=$3 AND leased_by=$4 AND lease_until > clock_timestamp() FOR UPDATE`,
        [lease.owner_context_id, lease.id, lease.fencing_token, lease.leased_by]);
        if (!locked.rowCount) fail('WORKER_LEASE_LOST', 409);
        const result = await applyResult(db);
        const finished = await db.query(`UPDATE signing_jobs SET state='complete',completed_at=clock_timestamp(),
            leased_by=NULL,lease_until=NULL,error_code=NULL WHERE id=$1 AND lease_until > clock_timestamp() RETURNING id`, [lease.id]);
        if (!finished.rowCount) fail('WORKER_LEASE_LOST', 409);
        return result;
    });
}

async function failed(db, lease, { code, uncertain = false, retryable = true }) {
    expect(typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(code), 'INVALID_JOB');
    // Provider dispatch is never retried here. Known non-dispatch failures can be
    // resolved explicitly by the delivery service before invoking this function.
    if (lease.kind === 'dispatch_delivery') { uncertain = true; retryable = false; }
    const result = await db.query(`UPDATE signing_jobs SET
        state=CASE WHEN $5 THEN 'uncertain' WHEN $6 AND attempts < max_attempts THEN 'retry' ELSE 'needs_attention' END,
        available_at=clock_timestamp()+make_interval(secs=>LEAST(300,POWER(2,attempts)::integer)+floor(random()*3)::integer),
        error_code=$7,leased_by=NULL,lease_until=NULL
        WHERE owner_context_id=$1 AND id=$2 AND state='running' AND fencing_token=$3 AND leased_by=$4
          AND lease_until > clock_timestamp() RETURNING id,state`,
    [lease.owner_context_id, lease.id, lease.fencing_token, lease.leased_by, uncertain, retryable, code]);
    if (!result.rowCount) fail('WORKER_LEASE_LOST', 409);
    return result.rows[0];
}

module.exports = { enqueue, job, recoverExpired, cancelObsolete, claim, heartbeat, complete, failed };

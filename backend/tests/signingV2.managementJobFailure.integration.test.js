const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { listSubmissions, listPackages, packageDetails } = require('../services/signingV2/management');

test('management projects current authorized operational job failures without leaking historical work',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 30000 }, async t => {
    const pool = require('../config/db');
    t.after(() => pool.end());
    const f = await databaseFixture(pool, { packageCount: 2, documentCount: 2 });
    const receipt = await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    const packages = (await pool.query('SELECT * FROM signing_packages WHERE owner_context_id=$1 ORDER BY external_key', [f.contextId])).rows;
    const first = packages[0], hidden = packages[1];
    const doc = (await pool.query('SELECT * FROM signing_documents WHERE owner_context_id=$1 AND revision_id=$2 ORDER BY document_key LIMIT 1', [f.contextId, first.active_revision_id])).rows[0];
    const insertJob = async (kind, subjectId, state = 'needs_attention', contextId = f.contextId) => {
        const id = randomUUID();
        await pool.query(`INSERT INTO signing_jobs(id,owner_context_id,kind,subject_id,dedupe_key,input_hash,state,error_code)
            VALUES($1,$2,$3,$4,$5,$6,$7,'RENDER_FAILED')`, [id, contextId, kind, subjectId, `new-management-failure:${id}`, 'a'.repeat(64), state]);
        return id;
    };
    const assertProjection = async (expected, actor = f.scope) => {
        let queries = 0;
        const db = { query: (...args) => { queries += 1; return pool.query(...args); } };
        const runs = await listSubmissions(db, actor, { state: 'all', submissionId: receipt.submissionId });
        assert.equal(queries, 1, 'job attention belongs to the existing bounded run projection');
        assert.equal(Number(runs.rows[0].attention_count), expected > 0 ? 1 : 0);
        const page = await listPackages(db, actor, receipt.submissionId, { state: 'all' });
        assert.equal(queries, 2, 'package projection adds no per-package query');
        assert.equal(Number(page.rows.find(row => row.id === first.id).issue_count), expected);
        assert.equal(Number((await packageDetails(pool, actor, first.id)).package.issue_count), expected);
        const attention = await listPackages(pool, actor, receipt.submissionId, { state: 'attention' });
        assert.equal(attention.rows.some(row => row.id === first.id), expected > 0);
        const attentionRuns = await listSubmissions(pool, actor, { state: 'attention', submissionId: receipt.submissionId });
        assert.equal(attentionRuns.total, expected > 0 ? 1 : 0);
    };

    const check = (name, run) => t.test(name, { skip: Boolean(process.env.QA_MANAGEMENT_JOB_CASE && !name.includes(process.env.QA_MANAGEMENT_JOB_CASE)) }, run);

    await check('failed active preparation and uncertain revision jobs appear in run package and detail attention', async () => {
        const ids = [];
        for (const kind of ['prepare_document', 'finalize_document', 'validate_package', 'activate_package', 'render_stage', 'render_evidence']) {
            ids.push(await insertJob(kind, ['prepare_document', 'finalize_document'].includes(kind) ? doc.id : first.active_revision_id,
                kind === 'render_stage' ? 'uncertain' : 'needs_attention'));
        }
        await assertProjection(6);
        await pool.query("UPDATE signing_jobs SET state='complete',error_code=NULL,completed_at=clock_timestamp() WHERE id=ANY($1::uuid[])", [ids]);
    });

    await check('cleared or retrying failure stops requiring attention without a document state workaround', async () => {
        const id = await insertJob('prepare_document', doc.id);
        await assertProjection(1);
        await pool.query("UPDATE signing_jobs SET state='retry' WHERE id=$1", [id]);
        await assertProjection(0);
        await pool.query("UPDATE signing_jobs SET state='complete',error_code=NULL,completed_at=clock_timestamp() WHERE id=$1", [id]);
        await assertProjection(0);
        const state = (await pool.query('SELECT state FROM signing_documents WHERE id=$1', [doc.id])).rows[0].state;
        assert.notEqual(state, 'failed', 'failure attention comes from the job, preserving document semantics');
    });

    await check('foreign owner and superseded revision document or revision jobs do not enter current projection', async () => {
        const oldRevision = randomUUID(), oldDocument = randomUUID(), foreignOwner = randomUUID();
        await pool.query(`INSERT INTO signing_package_revisions(id,owner_context_id,package_id,revision_no,workflow_state,snapshot,revision_hash,preview_hash,deadline)
            SELECT $1,owner_context_id,package_id,2,'superseded',snapshot,revision_hash,preview_hash,deadline
            FROM signing_package_revisions WHERE owner_context_id=$2 AND id=$3`, [oldRevision, f.contextId, first.active_revision_id]);
        await pool.query(`INSERT INTO signing_documents(id,owner_context_id,revision_id,document_key,name,source_artifact_id,informational,inclusion_reason,field_bindings)
            SELECT $1,owner_context_id,$2,document_key,name,source_artifact_id,informational,inclusion_reason,field_bindings
            FROM signing_documents WHERE id=$3`, [oldDocument, oldRevision, doc.id]);
        await pool.query("INSERT INTO signing_owner_contexts(id,deployment_key,scope_key) VALUES($1,$2,'dedicated')", [foreignOwner, `foreign-management-${foreignOwner}.invalid`]);
        await insertJob('prepare_document', oldDocument);
        await insertJob('render_evidence', oldRevision, 'uncertain');
        await insertJob('prepare_document', doc.id, 'needs_attention', foreignOwner);
        await insertJob('validate_package', first.active_revision_id, 'uncertain', foreignOwner);
        await assertProjection(0);
    });

    await check('unassigned package failures and delivery worker uncertainty remain outside this job axis', async () => {
        const userId = (await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic job projection viewer',$1,'Staff','synthetic-only') RETURNING userid", [`${randomUUID()}@example.invalid`])).rows[0].userid;
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)', [f.contextId, first.id, userId]);
        const restricted = { ...f.scope, all: false, userId, assignedCases: false, caseView: false, caseAll: false };
        await insertJob('render_stage', hidden.active_revision_id);
        await insertJob('dispatch_delivery', first.active_revision_id, 'uncertain');
        await insertJob('reconcile_delivery', first.active_revision_id, 'needs_attention');
        await assertProjection(0, restricted);
        const visible = await listPackages(pool, restricted, receipt.submissionId, { state: 'all' });
        assert.equal(visible.total, 1);
        await assert.rejects(packageDetails(pool, restricted, hidden.id), error => error.errorCode === 'NOT_FOUND');
        const all = await listPackages(pool, f.scope, receipt.submissionId, { state: 'attention' });
        assert.equal(all.rows.length, 1); assert.equal(all.rows[0].id, hidden.id);
        assert.equal(Number(all.rows[0].issue_count), 1);
    });
});

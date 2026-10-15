const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { advanceMany } = require('../services/signingV2/publicSigning');
const { transaction } = require('../services/signingV2/transaction');

test('a frozen 200-package selection queues600 final PDFs and200 evidence jobs in4 statements, safely replayable',
    { skip: process.env.LEGAL_DB_QA !== 'true' }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const f = await databaseFixture(pool, { packageCount: 200, documentCount: 3 });
    const created = await createSubmission(pool, f.scope, f.input, { reserveCapacity: async () => {} });
    const revisions = (await pool.query(`SELECT r.* FROM signing_package_revisions r JOIN signing_packages p
        ON p.active_revision_id=r.id WHERE p.submission_id=$1`, [created.submissionId])).rows;
    await pool.query(`UPDATE signing_tasks SET state='accepted' WHERE owner_context_id=$1`, [f.contextId]);
    let statements = 0;
    const progress = await transaction(pool, db => advanceMany({ query: (...args) => { statements += 1; return db.query(...args); } }, f.contextId, revisions));
    assert.equal(progress.length, 200); assert.ok(progress.every(item => item.state === 'finalizing'));
    assert.equal(statements, 4, 'queries are bounded for the entire selection, not repeated for every package');
    const counts = async () => (await pool.query(`SELECT kind,count(*)::integer AS count FROM signing_jobs WHERE owner_context_id=$1
        AND kind IN ('finalize_document','render_evidence') GROUP BY kind ORDER BY kind`, [f.contextId])).rows;
    assert.deepEqual(await counts(), [{ kind: 'finalize_document', count: 600 }, { kind: 'render_evidence', count: 200 }]);
    await transaction(pool, db => advanceMany(db, f.contextId, revisions));
    assert.deepEqual(await counts(), [{ kind: 'finalize_document', count: 600 }, { kind: 'render_evidence', count: 200 }]);
    assert.equal((await pool.query(`SELECT count(*)::integer AS n FROM signing_job_dependencies d JOIN signing_jobs j ON j.id=d.job_id
        WHERE d.owner_context_id=$1 AND j.kind='render_evidence'`, [f.contextId])).rows[0].n, 600);
    t.diagnostic('This proves durable progression/query count only; it is not real PDF readiness or representative performance evidence.');
});

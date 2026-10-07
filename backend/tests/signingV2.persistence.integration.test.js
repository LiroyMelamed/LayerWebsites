const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const jobs = require('../services/signingV2/jobs');
const { transaction } = require('../services/signingV2/transaction');

test('v2 set-based persistence, isolation, retry and durable worker fences', { skip: process.env.LEGAL_DB_QA !== 'true' }, async t => {
    assert.equal(process.env.DB_HOST, '127.0.0.1'); assert.equal(process.env.DB_PORT, '55442');
    const pool = require('../config/db');
    t.after(() => pool.end());
    const reserveCapacity = async (_db, _scope, capacity) => assert.ok(capacity.documents > 0);
    const f = await databaseFixture(pool, { packageCount: 200, documentCount: 3 });
    let created;
    await t.test('all 200 packages, 600 docs/tasks and 1200 jobs are durable at response; no sends or source reads', async () => {
        let queries = 0;
        const measuredPool = { connect: async () => {
            const client = await pool.connect();
            return { release: () => client.release(), query: (...args) => { queries += 1; return client.query(...args); } };
        } };
        const started = performance.now();
        created = await createSubmission(measuredPool, f.scope, f.input, { reserveCapacity });
        const elapsedMs = performance.now() - started;
        assert.equal(created.packageCount, 200); assert.equal(created.documentCount, 600);
        assert.equal(created.durable, true); assert.equal(created.receiptKind, 'durable_creation');
        assert.ok(!Object.hasOwn(created, 'providerAccepted'));
        const counts = (await pool.query(`SELECT
            (SELECT count(*) FROM signing_packages WHERE owner_context_id=$1) AS packages,
            (SELECT count(*) FROM signing_documents WHERE owner_context_id=$1) AS documents,
            (SELECT count(*) FROM signing_tasks WHERE owner_context_id=$1) AS tasks,
            (SELECT count(*) FROM signing_jobs WHERE owner_context_id=$1) AS jobs,
            (SELECT count(*) FROM signing_public_grants WHERE owner_context_id=$1) AS grants,
            (SELECT count(*) FROM signing_people WHERE owner_context_id=$1) AS people`, [f.contextId])).rows[0];
        assert.deepEqual(counts, { packages: '200', documents: '600', tasks: '600', jobs: '1200', grants: '0', people: '200' });
        assert.ok(queries <= 30, `set-based creation used ${queries} database roundtrips`);
        t.diagnostic(JSON.stringify({ workload: '200x3', elapsedMs, queries, representativeInfrastructure: false, sampleCount: 1 }));
    });
    await t.test('lost response retry returns same submission, conflicting payload rejects, new connection sees all children', async () => {
        const repeated = await Promise.all([createSubmission(pool, f.scope, f.input, { reserveCapacity }), createSubmission(pool, f.scope, f.input, { reserveCapacity })]);
        assert.ok(repeated.every(result => result.reused && result.submissionId === created.submissionId));
        await assert.rejects(createSubmission(pool, f.scope, { ...f.input, name: 'changed' }, { reserveCapacity }), { errorCode: 'IDEMPOTENCY_CONFLICT' });
        const client = await pool.connect();
        try { assert.equal((await client.query('SELECT count(*) FROM signing_packages WHERE submission_id=$1', [created.submissionId])).rows[0].count, '200'); }
        finally { client.release(); }
    });
    await t.test('quota failure rolls back everything and immutable versions reject edits', async () => {
        const idempotencyKey = randomUUID();
        await assert.rejects(createSubmission(pool, f.scope, { ...f.input, idempotencyKey }, { reserveCapacity: async () => { throw Error('synthetic quota blocked'); } }), /synthetic quota blocked/);
        assert.equal((await pool.query('SELECT count(*) FROM signing_submissions WHERE idempotency_key=$1', [idempotencyKey])).rows[0].count, '0');
        await assert.rejects(pool.query("UPDATE signing_template_versions SET definition='{}' WHERE id=$1", [f.versionId]), { code: '23514' });
        await assert.rejects(pool.query("UPDATE signing_package_revisions SET snapshot='{}' WHERE owner_context_id=$1", [f.contextId]), { code: '23514' });
    });
    await t.test('foreign office data cannot join a revision even through direct SQL', async () => {
        const other = await databaseFixture(pool);
        const personId = other.input.packages[0].roles.employee[0].personId;
        await assert.rejects(pool.query(`UPDATE signing_participations SET person_id=$1 WHERE owner_context_id=$2`, [personId, f.contextId]), { code: '23503' });
        await assert.rejects(createSubmission(pool, other.scope, f.input, { reserveCapacity }), { errorCode: 'NOT_FOUND' });
    });
    await t.test('concurrent claims never duplicate a lease; expired worker cannot commit an artifact', async () => {
        const leases = await Promise.all([1, 2].map(index => jobs.claim(pool, { contextIds: [f.contextId], workerId: `qa-${index}`, kinds: ['prepare_document'], limit: 2, leaseSeconds: 5 })));
        assert.equal(new Set(leases.flat().map(lease => lease.id)).size, 4);
        const lease = leases[0][0];
        await pool.query("UPDATE signing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [lease.id]);
        await jobs.recoverExpired(pool);
        let applied = false;
        await assert.rejects(jobs.complete(pool, lease, async () => { applied = true; }), { errorCode: 'WORKER_LEASE_LOST' });
        assert.equal(applied, false);
        assert.equal(await jobs.heartbeat(pool, lease), false);
        const next = (await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'qa-recovered', kinds: ['prepare_document'], limit: 1 }))[0];
        await jobs.complete(pool, next, async () => {});
        assert.equal((await pool.query('SELECT state FROM signing_jobs WHERE id=$1', [next.id])).rows[0].state, 'complete');
    });
    await t.test('dependencies block activation; interrupted provider dispatch is uncertain, never blindly retried', async () => {
        assert.equal((await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'qa-activate', kinds: ['activate_package'], limit: 8 })).length, 0);
        const dispatch = jobs.job('dispatch_delivery', randomUUID(), 'e'.repeat(64));
        await transaction(pool, db => jobs.enqueue(db, f.contextId, [dispatch]));
        const lease = (await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'qa-dispatch', kinds: ['dispatch_delivery'] }))[0];
        assert.equal(lease.id, dispatch.id);
        await pool.query("UPDATE signing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [lease.id]);
        await jobs.recoverExpired(pool);
        assert.equal((await pool.query('SELECT state FROM signing_jobs WHERE id=$1', [lease.id])).rows[0].state, 'uncertain');
        assert.equal((await jobs.claim(pool, { contextIds: [f.contextId], workerId: 'qa-dispatch-retry', kinds: ['dispatch_delivery'] })).length, 0);
    });
});

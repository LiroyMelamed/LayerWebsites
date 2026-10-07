const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { createSubmission } = require('../services/signingV2/submissions');
const { listSubmissions, listPackages, packageDetails } = require('../services/signingV2/management');

test('pending management groups sends, sums obligations and never exposes inaccessible counts/search results', { skip: process.env.LEGAL_DB_QA !== 'true' }, async t => {
    assert.equal(process.env.DB_PORT, '55442');
    const pool = require('../config/db'); t.after(() => pool.end());
    const f = await databaseFixture(pool, { packageCount: 2, documentCount: 9 });
    const options = { reserveCapacity: async () => {} };
    const first = await createSubmission(pool, f.scope, f.input, options);
    const second = await createSubmission(pool, f.scope, { ...f.input, idempotencyKey: randomUUID(), name: 'Second send, same template' }, options);
    const packages = (await pool.query('SELECT * FROM signing_packages WHERE submission_id=$1 ORDER BY external_key', [first.submissionId])).rows;
    await t.test('same-template sends are distinct and pagination is stable', async () => {
        const page1 = await listSubmissions(pool, f.scope, { state: 'all', limit: 1 });
        assert.equal(page1.total, 2); assert.equal(page1.rows.length, 1); assert.ok(page1.nextCursor);
        const page2 = await listSubmissions(pool, f.scope, { state: 'all', limit: 1, cursor: page1.nextCursor });
        assert.equal(page2.total, 2); assert.notEqual(page1.rows[0].id, page2.rows[0].id); assert.equal(page2.nextCursor, null);
        assert.deepEqual(new Set([page1.rows[0].id, page2.rows[0].id]), new Set([first.submissionId, second.submissionId]));
    });
    await t.test('1/1 plus 1/9 is 2/10, not averaged percentages, and completion is not inferred from signatures alone', async () => {
        for (let index = 0; index < packages.length; index += 1) {
            const tasks = (await pool.query('SELECT id FROM signing_tasks WHERE revision_id=$1 ORDER BY id', [packages[index].active_revision_id])).rows;
            if (index === 0) await pool.query('UPDATE signing_tasks SET required=false WHERE revision_id=$1 AND id<>$2', [packages[index].active_revision_id, tasks[0].id]);
            await pool.query("UPDATE signing_tasks SET state='accepted' WHERE id=$1", [tasks[0].id]);
        }
        const batch = (await listSubmissions(pool, f.scope, { state: 'pending' })).rows.find(row => row.id === first.submissionId);
        assert.equal(batch.accepted_count, 2); assert.equal(batch.required_count, 10); assert.equal(batch.complete_count, 0);
        assert.equal(batch.document_count, 18); assert.equal(batch.accepted_messages, 0);
        const detail = await packageDetails(pool, f.scope, packages[0].id);
        assert.equal(detail.documents.length, 9); assert.equal(detail.participants.length, 1);
        assert.equal(detail.participants[0].tasks.length, 9); assert.equal(detail.deliveries[0].state, 'pending');
    });
    await t.test('a person search finds the send but its summary still includes all authorized children', async () => {
        const rows = await listSubmissions(pool, f.scope, { query: 'Synthetic employee 0' });
        assert.equal(rows.total, 2);
        assert.ok(rows.rows.every(row => row.package_count === 2));
        const children = await listPackages(pool, f.scope, first.submissionId, { query: 'Synthetic employee 0' });
        assert.equal(children.total, 1); assert.equal(children.rows[0].match_reason, 'person');
        assert.equal(rows.summaryScope, 'all_authorized_children'); assert.equal(children.summaryScope, 'matching_children');
    });
    await t.test('restricted summaries/search/detail are scoped before aggregation and do not expose hidden existence', async () => {
        const restrictedUser = (await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic restricted',$1,'Staff','synthetic') RETURNING userid", [`${randomUUID()}@example.invalid`])).rows[0].userid;
        const restricted = { ...f.scope, all: false, userId: restrictedUser, caseView: false, caseAll: false };
        assert.equal((await listSubmissions(pool, restricted, { state: 'all' })).total, 0);
        await assert.rejects(listPackages(pool, restricted, first.submissionId, {}), { errorCode: 'NOT_FOUND' });
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)', [f.contextId, packages[0].id, restrictedUser]);
        const scoped = await listSubmissions(pool, restricted, { state: 'all' });
        assert.equal(scoped.total, 1); assert.equal(scoped.rows[0].package_count, 1);
        assert.equal(scoped.rows[0].accepted_count, 1); assert.equal(scoped.rows[0].required_count, 1);
        assert.equal((await listSubmissions(pool, restricted, { state: 'all', query: 'Synthetic employee 1' })).total, 0);
        await assert.rejects(packageDetails(pool, restricted, packages[1].id), { errorCode: 'NOT_FOUND' });
        assert.equal((await packageDetails(pool, restricted, packages[0].id)).documents.length, 9);
    });
    await t.test('cancelled packages are explicit and removed from the active denominator without erasing history', async () => {
        await pool.query("UPDATE signing_package_revisions SET workflow_state='cancelled' WHERE id=$1", [packages[0].active_revision_id]);
        const batch = (await listSubmissions(pool, f.scope, { state: 'pending' })).rows.find(row => row.id === first.submissionId);
        assert.equal(batch.cancelled_count, 1); assert.equal(batch.required_count, 9); assert.equal(batch.accepted_count, 1);
        assert.equal((await listPackages(pool, f.scope, first.submissionId, { state: 'cancelled' })).total, 1);
    });
});

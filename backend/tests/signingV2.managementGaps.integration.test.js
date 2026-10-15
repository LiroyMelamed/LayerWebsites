const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deliveryHarness } = require('./helpers/signingV2Delivery');
const { freezeSelection } = require('../services/signingV2/selections');
const { previewBulkAction } = require('../services/signingV2/bulkReview');
const { executeBulkAction } = require('../services/signingV2/bulkActions');
const { listSubmissions, listPackages, packageDetails } = require('../services/signingV2/management');

test('management projects exact bulk members and classifies complete runs within current scope',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const h = await deliveryHarness(pool, { endpoints: Array(5).fill('management@example.invalid'), documentCount: 1,
        configure: ({ definition, packages }) => {
            const role = packages[0].roles.employee, personId = role[0].personId;
            packages.forEach(item => { item.roles = { employee: role }; item.delivery = { [personId]: { locale: 'en', channels: ['email'], email: 'management@example.invalid' } }; });
            return definition;
        } }); t.after(h.close);
    const receipt = await h.submit(); await h.activate(); await h.drain('dispatch_delivery');
    const scope = { ...h.f.scope, send: true, packageRemind: true, deliveryResend: true };
    const { byKey } = await h.targets(receipt.submissionId);
    const pkg = i => byKey[`employee-${i}`];
    const prepare = async (indices, purpose = 'reminder') => {
        const selection = await freezeSelection(pool, scope, { mode: 'explicit', packageIds: indices.map(i => pkg(i).id), idempotencyKey: randomUUID() });
        const review = await previewBulkAction(pool, scope, { selectionId: selection.selectionId, purpose, idempotencyKey: randomUUID() });
        return executeBulkAction(pool, scope, { reviewId: review.reviewId, previewHash: review.previewHash, idempotencyKey: randomUUID() });
    };
    const all = () => listPackages(pool, scope, receipt.submissionId, { state: 'all' });
    const groups = (state, actor = scope) => listSubmissions(pool, actor, { state, submissionId: receipt.submissionId });
    const check = (name, run) => t.test(name, { skip: Boolean(process.env.QA_MANAGEMENT_GAP_CASE && !name.includes(process.env.QA_MANAGEMENT_GAP_CASE)) }, run);

    await check('every exact bulk member shows pending then failed history and attention without duplicate anchor rows', async () => {
        const operation = await prepare([0, 1, 2]); assert.equal(operation.counts.messages, 1);
        const deliveryId = operation.items[0].deliveryId;
        for (const i of [0, 1, 2]) {
            const detail = await packageDetails(pool, scope, pkg(i).id);
            assert.equal(detail.deliveries.filter(item => item.id === deliveryId).length, 1);
            assert.equal(detail.deliveries.find(item => item.id === deliveryId).state, 'pending');
            assert.equal(Number(detail.package.pending_messages), 1);
        }
        const send = h.provider.send;
        h.provider.send = async () => { throw Object.assign(new Error('synthetic rejection'), { definitive: true, code: 'INVALID_DESTINATION' }); };
        try { await h.drain('dispatch_delivery'); } finally { h.provider.send = send; }
        const page = await all();
        for (const i of [0, 1, 2]) {
            const row = page.rows.find(item => item.id === pkg(i).id); assert.equal(Number(row.issue_count), 1); assert.equal(Number(row.pending_messages), 0);
            const detail = await packageDetails(pool, scope, pkg(i).id), delivery = detail.deliveries.find(item => item.id === deliveryId);
            assert.equal(delivery.state, 'failed'); assert.equal(delivery.errorCode, 'INVALID_DESTINATION');
        }
        assert.equal(Number((await groups('attention')).rows[0].attention_count), 3);
        const userId = (await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic non-anchor viewer',$1,'Staff','synthetic') RETURNING userid", [`${randomUUID()}@example.invalid`])).rows[0].userid;
        const anchor = (await pool.query('SELECT profile_id FROM signing_deliveries WHERE id=$1', [deliveryId])).rows[0].profile_id;
        const member = (await pool.query('SELECT package_id FROM signing_delivery_items WHERE delivery_id=$1 AND profile_id<>$2 LIMIT 1', [deliveryId, anchor])).rows[0].package_id;
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)', [scope.contextId, member, userId]);
        const restricted = { ...scope, all: false, userId, caseView: false, caseAll: false };
        const visible = await groups('attention', restricted); assert.equal(visible.rows[0].package_count, 1); assert.equal(visible.rows[0].attention_count, 1);
        assert.equal((await packageDetails(pool, restricted, member)).deliveries.find(item => item.id === deliveryId).state, 'failed');
    });

    await check('successful bulk resend clears each members previous failure and counts one physical message in the run', async () => {
        // Seed the new failure branch independently so this case can rerun alone.
        const failed = await prepare([0, 1, 2]);
        await pool.query("UPDATE signing_deliveries SET state='failed',error_code='INVALID_DESTINATION' WHERE id=$1", [failed.items[0].deliveryId]);
        const resend = await prepare([0, 1, 2], 'resend'); await h.drain('dispatch_delivery');
        for (const i of [0, 1, 2]) {
            const detail = await packageDetails(pool, scope, pkg(i).id);
            assert.equal(Number(detail.package.issue_count), 0);
            assert.equal(detail.deliveries.find(item => item.id === resend.items[0].deliveryId).state, 'provider_accepted');
        }
        const row = (await groups('all')).rows[0]; assert.equal(Number(row.accepted_messages), 2, 'one original shared invitation plus one bulk resend');
        assert.equal(Number(row.attention_count), 0);
    });

    await check('excluded member preserves its own cancellation and cannot inherit another members provider acceptance', async () => {
        const operation = await prepare([3, 4]), deliveryId = operation.items[0].deliveryId;
        const anchorProfile = (await pool.query('SELECT profile_id FROM signing_deliveries WHERE id=$1', [deliveryId])).rows[0].profile_id;
        const excluded = (await pool.query('SELECT * FROM signing_delivery_items WHERE delivery_id=$1 AND profile_id<>$2', [deliveryId, anchorProfile])).rows[0];
        const acceptedBefore = Number((await packageDetails(pool, scope, excluded.package_id)).package.accepted_messages);
        await pool.query('UPDATE signing_delivery_profiles SET version=version+1 WHERE id=$1', [excluded.profile_id]);
        await h.drain('dispatch_delivery');
        const detail = await packageDetails(pool, scope, excluded.package_id), row = detail.deliveries.find(item => item.id === deliveryId);
        assert.equal(row.state, 'cancelled'); assert.equal(row.errorCode, 'CONTACT_CHANGED');
        assert.equal(row.attemptedAt, null); assert.equal(row.providerAcceptedAt, null); assert.equal(row.deliveredAt, null);
        assert.equal(Number(detail.package.accepted_messages), acceptedBefore); assert.equal(Number(detail.package.pending_messages), 0);
        const included = operation.items.find(item => item.packageId !== excluded.package_id);
        assert.equal((await packageDetails(pool, scope, included.packageId)).deliveries.find(item => item.id === deliveryId).state, 'provider_accepted');
    });

    await check('mismatched profile revision and package membership does not create history or provider counts', async () => {
        const profiles = (await pool.query('SELECT dp.* FROM signing_delivery_profiles dp WHERE dp.revision_id=ANY($1::uuid[]) ORDER BY dp.revision_id', [[pkg(3).revision_id, pkg(4).revision_id]])).rows;
        const before = await all(), id = randomUUID();
        await pool.query(`INSERT INTO signing_deliveries(id,owner_context_id,profile_id,profile_version,event_key,purpose,channel,target_snapshot,state,provider_accepted_at)
            VALUES($1,$2,$3,$4,$5,'reminder','email',$6,'provider_accepted',clock_timestamp())`,
        [id, scope.contextId, profiles[0].id, profiles[0].version, `malformed:${id}`, { bulk: true }]);
        const otherPackage = profiles[1].revision_id === pkg(3).revision_id ? pkg(4).id : pkg(3).id;
        await pool.query(`INSERT INTO signing_delivery_items(owner_context_id,delivery_id,package_id,revision_id,person_id,profile_id,profile_version,binding)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [scope.contextId, id, otherPackage, profiles[1].revision_id, profiles[1].person_id, profiles[1].id, profiles[1].version, {}]);
        const after = await all();
        for (const i of [3, 4]) {
            assert.equal(after.rows.find(item => item.id === pkg(i).id).accepted_messages, before.rows.find(item => item.id === pkg(i).id).accepted_messages);
            assert.equal((await packageDetails(pool, scope, pkg(i).id)).deliveries.some(item => item.id === id), false);
        }
    });

    await check('completed and cancelled run filters classify all authorized children including mixed active and terminal states', async () => {
        await pool.query("UPDATE signing_package_revisions SET workflow_state=CASE WHEN id=$1 THEN 'complete' WHEN id=$2 THEN 'cancelled' ELSE 'active' END WHERE owner_context_id=$3", [pkg(0).revision_id, pkg(1).revision_id, scope.contextId]);
        assert.equal((await groups('complete')).total, 0); assert.equal((await groups('cancelled')).total, 0); assert.equal((await groups('pending')).total, 1);
        await pool.query("UPDATE signing_package_revisions SET workflow_state='complete' WHERE owner_context_id=$1 AND workflow_state='active'", [scope.contextId]);
        const complete = await groups('complete'); assert.equal(complete.total, 1); assert.equal(Number(complete.rows[0].active_package_count), 4); assert.equal(Number(complete.rows[0].cancelled_count), 1);
        assert.equal((await groups('cancelled')).total, 0); assert.equal((await groups('pending')).total, 0);
        const userId = (await pool.query("INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic cancelled viewer',$1,'Staff','synthetic') RETURNING userid", [`${randomUUID()}@example.invalid`])).rows[0].userid;
        await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) VALUES($1,$2,$3)', [scope.contextId, pkg(1).id, userId]);
        const restricted = { ...scope, all: false, userId, caseView: false, caseAll: false };
        assert.equal((await groups('complete', restricted)).total, 0);
        const cancelled = await groups('cancelled', restricted); assert.equal(cancelled.total, 1); assert.equal(cancelled.rows[0].package_count, 1);
        await pool.query("UPDATE signing_package_revisions SET workflow_state='cancelled' WHERE owner_context_id=$1", [scope.contextId]);
        assert.equal((await groups('complete')).total, 0); assert.equal((await groups('cancelled')).total, 1);
    });

    await check('live projection metadata is emitted in the existing SQL statement and changes with current scope', async () => {
        const before = new Date((await pool.query('SELECT statement_timestamp() AS now')).rows[0].now).getTime();
        let queryCount = 0; const db = { query: (...args) => { queryCount += 1; return pool.query(...args); } };
        const first = await listSubmissions(db, scope, { state: 'all' }); assert.equal(queryCount, 1);
        const second = await listPackages(db, scope, receipt.submissionId, { state: 'all' }); assert.equal(queryCount, 2);
        const detail = await packageDetails(pool, scope, pkg(0).id);
        const after = new Date((await pool.query('SELECT statement_timestamp() AS now')).rows[0].now).getTime();
        for (const data of [first, second, detail]) {
            assert.equal(data.projectionVersion, 2); assert.equal(data.freshness, 'current'); assert.equal(data.scope.kind, 'authorized_packages');
            assert.match(data.scope.fingerprint, /^[a-f0-9]{64}$/); assert.ok(Number.isFinite(Date.parse(data.asOf)));
            assert.ok(Date.parse(data.asOf) >= before && Date.parse(data.asOf) <= after,
                `asOf ${data.asOf} is bounded by database milliseconds ${before}..${after}`);
        }
        assert.equal(first.scope.fingerprint, second.scope.fingerprint); assert.equal(first.scope.fingerprint, detail.scope.fingerprint);
        const hidden = await listSubmissions(pool, { ...scope, all: false, userId: -1 }, { state: 'all' });
        assert.equal(hidden.total, 0); assert.notEqual(hidden.scope.fingerprint, first.scope.fingerprint); assert.equal(hidden.freshness, 'current');
    });
});

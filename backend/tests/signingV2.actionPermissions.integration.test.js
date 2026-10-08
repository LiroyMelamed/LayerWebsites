const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { deliveryHarness } = require('./helpers/signingV2Delivery');
const { actorScope } = require('../services/signingV2/access');
const { normalizeRolePermissions, getCatalogForApi } = require('../lib/firmRolePermissions');
const actions = require('../services/signingV2/actions');
const { freezeSelection } = require('../services/signingV2/selections');
const { previewBulkAction } = require('../services/signingV2/bulkReview');
const { executeBulkAction, bulkOperationStatus } = require('../services/signingV2/bulkActions');
const { currentRevisionScope } = require('../services/signingV2/followupScope');

test('explicit reminder/resend permissions govern targeted and bulk admission and live dispatch',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const h = await deliveryHarness(pool, { endpoints: Array(11).fill('permissions@example.invalid'), documentCount: 1 });
    t.after(h.close);
    const receipt = await h.submit(); await h.activate(); await h.drain('dispatch_delivery');
    const { byKey, people } = await h.targets(receipt.submissionId);
    const owner = { ...h.f.scope, send: true, packageRemind: true, deliveryResend: true, linkRenew: true };
    const base = ['view', 'manage', 'upload'];
    const permissions = list => ({ version: 7, areas: { signing: { visible: true, actions: list, dataScope: 'assigned_only' } } });
    const roleId = (await pool.query('INSERT INTO firm_staff_roles(name,permissions) VALUES($1,$2) RETURNING id',
        [`Synthetic action permissions ${randomUUID()}`, permissions(base)])).rows[0].id;
    const userId = (await pool.query("INSERT INTO users(name,email,role,passwordhash,firm_staff_role_id) VALUES('Synthetic permission staff',$1,'Staff','synthetic',$2) RETURNING userid",
        [`${randomUUID()}@example.invalid`, roleId])).rows[0].userid;
    const pkg = i => byKey[`employee-${i}`];
    const target = (i, purpose = 'reminder', extra = {}) => ({ packageId: pkg(i).id, personId: people[`employee-${i}`], purpose, ...extra });
    await pool.query('INSERT INTO signing_package_assignments(owner_context_id,package_id,user_id) SELECT $1,id,$2 FROM signing_packages WHERE owner_context_id=$1 AND id<>$3',
        [owner.contextId, userId, pkg(10).id]);
    const update = async list => pool.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1', [roleId, permissions(list)]);
    const staff = list => actorScope(pool, { user: { UserId: userId }, firmPermissionContextValidated: true,
        firmPermissionMode: 'role', firmStaffRoleId: roleId, firmTenantId: null, firmPermissions: normalizeRolePermissions(permissions(list)) }, 'upload');
    process.env.SIGNING_V2_ENABLED = 'true';
    process.env.SIGNING_DEPLOYMENT_KEY = (await pool.query('SELECT deployment_key FROM signing_owner_contexts WHERE id=$1', [owner.contextId])).rows[0].deployment_key;
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; });
    const app = express(); app.use(express.json()); app.use('/api/signing-v2', require('../routes/signingV2Routes'));
    app.use((error, req, res, next) => res.status(error.httpStatus || 500).json({ code: error.errorCode }));
    const auth = `Bearer ${jwt.sign({ userid: userId, role: 'Staff' }, process.env.JWT_SECRET)}`;
    const path = i => `/api/signing-v2/packages/${pkg(i).id}/participants/${people[`employee-${i}`]}`;
    const freeze = (scope, i) => freezeSelection(pool, scope, { mode: 'explicit', packageIds: [pkg(i).id], idempotencyKey: randomUUID() });
    const bulkPreview = async (scope, i, purpose) => {
        const selection = await freeze(scope, i);
        return previewBulkAction(pool, scope, { selectionId: selection.selectionId, purpose, idempotencyKey: randomUUID() });
    };
    const bulkExecute = (scope, review) => executeBulkAction(pool, scope, { reviewId: review.reviewId, previewHash: review.previewHash, idempotencyKey: randomUUID() });
    const queuedCount = async () => Number((await pool.query("SELECT count(*) AS n FROM signing_deliveries WHERE owner_context_id=$1 AND purpose<>'invitation'", [owner.contextId])).rows[0].n);
    const check = (name, run) => t.test(name, { skip: Boolean(process.env.QA_ACTION_PERMISSION_CASE && !name.includes(process.env.QA_ACTION_PERMISSION_CASE)) }, run);

    await check('catalog migration never grants new capabilities to an existing custom role', async () => {
        const catalog = getCatalogForApi(); assert.equal(catalog.version, 7);
        assert.ok(['package_remind', 'delivery_resend', 'package_revision_create'].every(action => catalog.areas.find(area => area.id === 'signing').actions.includes(action)));
        const old = normalizeRolePermissions({ version: 6, areas: permissions(base).areas });
        assert.deepEqual(old.areas.signing.actions, base);
        const scoped = await staff(base); assert.equal(scoped.send, true); assert.equal(scoped.all, false);
        assert.equal(scoped.packageRemind, false); assert.equal(scoped.deliveryResend, false); assert.equal(scoped.packageRevise, false);
        assert.equal(await currentRevisionScope(pool, owner.contextId, userId), null);
        const explicit = await staff([...base, 'package_remind', 'delivery_resend', 'package_revision_create']);
        assert.equal(explicit.packageRemind, true); assert.equal(explicit.deliveryResend, true); assert.equal(explicit.packageRevise, true); assert.equal(explicit.all, false);
        await update([...base, 'package_revision_create']);
        assert.equal((await currentRevisionScope(pool, owner.contextId, userId)).packageRevise, true);
        await update(['view', 'upload', 'package_revision_create']);
        assert.equal(await currentRevisionScope(pool, owner.contextId, userId), null);
        const noManage = await staff(['view', 'upload', 'package_revision_create']); assert.equal(noManage.packageRevise, false);
        const legacy = await actorScope(pool, { user: { UserId: owner.userId }, firmPermissionContextValidated: true, firmPermissionMode: 'legacy', firmTenantId: null }, 'upload');
        assert.equal(legacy.packageRemind, true); assert.equal(legacy.deliveryResend, true); assert.equal(legacy.packageRevise, true);
        assert.equal((await currentRevisionScope(pool, owner.contextId, owner.userId)).packageRevise, true);
    });

    await check('HTTP and service previews/queue reject upload-only roles and preserve purpose and package scope', async () => {
        await update(base); const scope = await staff(base), before = await queuedCount();
        for (const purpose of ['reminder', 'resend']) {
            const input = target(0, purpose), preview = await actions.previewParticipantAction(pool, owner, input);
            assert.equal((await request(app).post(path(0) + '/action-preview').set('Authorization', auth).send(input)).status, 403);
            assert.equal((await request(app).post(path(0) + '/actions').set('Authorization', auth).set('Idempotency-Key', randomUUID()).send({ ...input, previewHash: preview.previewHash })).status, 403);
            await assert.rejects(actions.executeParticipantAction(pool, scope, { ...input, previewHash: preview.previewHash, idempotencyKey: randomUUID() }), { errorCode: 'FORBIDDEN' });
            const selection = await freeze(scope, 0);
            await assert.rejects(previewBulkAction(pool, scope, { selectionId: selection.selectionId, purpose, idempotencyKey: randomUUID() }), { errorCode: 'FORBIDDEN' });
            assert.equal((await request(app).post(`/api/signing-v2/selections/${selection.selectionId}/preview`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).send({ purpose })).status, 403);
        }
        await update([...base, 'package_remind']); const remind = await staff([...base, 'package_remind']);
        assert.equal((await actions.previewParticipantAction(pool, remind, target(0))).eligible, true);
        await assert.rejects(actions.previewParticipantAction(pool, remind, target(0, 'resend')), { errorCode: 'FORBIDDEN' });
        await assert.rejects(actions.previewParticipantAction(pool, remind, target(10)), { errorCode: 'NOT_FOUND' });
        await assert.rejects(freeze(remind, 10), { errorCode: 'NOT_FOUND' });
        await update(['view', 'package_remind', 'delivery_resend']);
        assert.equal((await request(app).post(path(0) + '/action-preview').set('Authorization', auth).send(target(0))).status, 403);
        assert.equal(await queuedCount(), before);
    });

    await check('saved bulk reviews cannot be submitted through HTTP or service after the explicit permission is removed', async () => {
        const list = [...base, 'package_remind']; await update(list); const scope = await staff(list);
        const review = await bulkPreview(scope, 0, 'reminder'), before = await queuedCount();
        await update(base); const revoked = await staff(base);
        await assert.rejects(bulkExecute(revoked, review), { errorCode: 'FORBIDDEN' });
        const response = await request(app).post('/api/signing-v2/bulk-actions').set('Authorization', auth).set('Idempotency-Key', randomUUID())
            .send({ reviewId: review.reviewId, previewHash: review.previewHash });
        assert.equal(response.status, 403, JSON.stringify(response.body)); assert.equal(await queuedCount(), before);
    });

    for (const [i, bulk, purpose, permission, other] of [
        [1, false, 'reminder', 'package_remind', 'delivery_resend'], [2, false, 'resend', 'delivery_resend', 'package_remind'],
        [3, true, 'reminder', 'package_remind', 'delivery_resend'], [4, true, 'resend', 'delivery_resend', 'package_remind'],
    ]) await check(`${bulk ? 'bulk' : 'targeted'} ${purpose} requires its live permission even while the other purpose remains allowed`, async () => {
        await update([...base, permission, other]); const scope = await staff([...base, permission, other]);
        let op;
        if (bulk) op = await bulkExecute(scope, await bulkPreview(scope, i, purpose));
        else {
            const input = target(i, purpose), preview = await actions.previewParticipantAction(pool, scope, input);
            op = await actions.executeParticipantAction(pool, scope, { ...input, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
        }
        const calls = h.provider.calls.length; await update([...base, other]); await h.drain('dispatch_delivery');
        assert.equal(h.provider.calls.length, calls);
        const status = bulk ? await bulkOperationStatus(pool, scope, op.operationId) : await actions.operationStatus(pool, scope, op.operationId);
        assert.equal(status.items[0].state, 'cancelled'); assert.equal(status.items[0].errorCode, 'SENDER_ACCESS_CHANGED');
    });

    for (const [i, bulk] of [[5, false], [6, true]]) await check(`${bulk ? 'bulk' : 'targeted'} queue rechecks permission revoked while waiting for the package fence`, async () => {
        const list = [...base, 'package_remind']; await update(list); const scope = await staff(list);
        const input = target(i), reviewed = bulk ? await bulkPreview(scope, i, 'reminder') : await actions.previewParticipantAction(pool, scope, input);
        const before = await queuedCount(), locker = await pool.connect(); let pending;
        try {
            await locker.query('BEGIN'); await locker.query('SELECT id FROM signing_packages WHERE id=$1 FOR UPDATE', [pkg(i).id]);
            pending = (bulk ? bulkExecute(scope, reviewed) : actions.executeParticipantAction(pool, scope, { ...input, previewHash: reviewed.previewHash, idempotencyKey: randomUUID() }))
                .then(value => ({ value }), error => ({ error }));
            const pattern = bulk ? 'SELECT p.id FROM signing_packages p WHERE p.owner_context_id%FOR UPDATE%' : '%FOR UPDATE OF p';
            let blocked = false;
            for (let attempt = 0; attempt < 100; attempt += 1) {
                blocked = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE $1", [pattern])).rowCount > 0;
                if (blocked) break; await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(blocked, true, 'queue reached the existing package fence');
            await locker.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1', [roleId, permissions(base)]);
            await locker.query('COMMIT'); const result = await pending;
            assert.equal(result.error?.errorCode, 'FORBIDDEN'); assert.equal(await queuedCount(), before);
        } finally { await locker.query('ROLLBACK'); locker.release(); if (pending) await pending; }
    });

    await check('explicit renewal retains the resend and link-renew permissions at preview and worker dispatch', async () => {
        const input = target(7, 'resend', { renewLink: true, channel: 'email' });
        await update([...base, 'access_link_renew']); const renewOnly = await staff([...base, 'access_link_renew']);
        await assert.rejects(actions.previewParticipantAction(pool, renewOnly, input), { errorCode: 'FORBIDDEN' });
        await update([...base, 'delivery_resend']); const resendOnly = await staff([...base, 'delivery_resend']);
        await assert.rejects(actions.previewParticipantAction(pool, resendOnly, input), { errorCode: 'FORBIDDEN' });
        const list = [...base, 'delivery_resend', 'access_link_renew']; await update(list); const both = await staff(list);
        const preview = await actions.previewParticipantAction(pool, both, input);
        const op = await actions.executeParticipantAction(pool, both, { ...input, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
        const calls = h.provider.calls.length; await update([...base, 'access_link_renew']); await h.drain('dispatch_delivery');
        assert.equal(h.provider.calls.length, calls); assert.equal((await actions.operationStatus(pool, both, op.operationId)).items[0].errorCode, 'SENDER_ACCESS_CHANGED');
    });

    await check('each permitted purpose can reach the fake provider without the other purpose capability', async () => {
        for (const [i, bulk, purpose, permission] of [[8, false, 'reminder', 'package_remind'], [9, true, 'resend', 'delivery_resend']]) {
            await update([...base, permission]); const scope = await staff([...base, permission]); let op;
            if (bulk) op = await bulkExecute(scope, await bulkPreview(scope, i, purpose));
            else {
                const input = target(i, purpose), preview = await actions.previewParticipantAction(pool, scope, input);
                op = await actions.executeParticipantAction(pool, scope, { ...input, previewHash: preview.previewHash, idempotencyKey: randomUUID() });
            }
            const calls = h.provider.calls.length; await h.drain('dispatch_delivery'); assert.equal(h.provider.calls.length, calls + 1);
            assert.equal(h.provider.calls.at(-1).purpose, purpose);
            const status = bulk ? await bulkOperationStatus(pool, scope, op.operationId) : await actions.operationStatus(pool, scope, op.operationId);
            assert.equal(status.items[0].state, 'provider_accepted');
        }
    });
});

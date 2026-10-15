const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { deliveryHarness } = require('./helpers/signingV2Delivery');
const actions = require('../services/signingV2/actions');
const management = require('../services/signingV2/management');

test('targeted reminders and resends reach only the chosen person, are idempotent and never change signing progress',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const endpoints = ['ok-0@example.invalid', 'reject-1@example.invalid', 'timeout-2@example.invalid', 'ok-3@example.invalid'];
    const h = await deliveryHarness(pool, { endpoints }); t.after(h.close);
    const { f, provider, drain } = h;

    const receipt = await h.submit();
    assert.equal(await drain('dispatch_delivery'), 0, 'no invitation can leave before preparation and activation');
    await h.activate();
    assert.equal(await drain('dispatch_delivery'), 4);
    const { packages, byKey, people } = await h.targets(receipt.submissionId);
    const states = (await pool.query(`SELECT target_snapshot->>'endpoint' AS endpoint,state,error_code FROM signing_deliveries
        WHERE owner_context_id=$1 AND purpose='invitation' ORDER BY 1`, [f.contextId])).rows;
    assert.deepEqual(states.map(row => [row.endpoint, row.state]), [
        ['ok-0@example.invalid', 'provider_accepted'], ['ok-3@example.invalid', 'provider_accepted'],
        ['reject-1@example.invalid', 'failed'], ['timeout-2@example.invalid', 'uncertain']]);
    assert.equal(new Set(provider.calls.map(call => call.url)).size, 4, 'each person gets a distinct link');
    const summary = (await management.listSubmissions(pool, f.scope, { state: 'pending' })).rows[0];
    assert.equal(summary.attention_count, 2, 'failed and uncertain delivery both need attention');
    const progressBefore = packages.map(item => [item.name, item.accepted_count, item.required_count]);

    const target = { packageId: byKey['employee-0'].id, personId: people['employee-0'], purpose: 'reminder' };
    const preview = await actions.previewParticipantAction(pool, f.scope, target);
    assert.equal(preview.eligible, true);
    assert.equal(preview.tasks.length, 2);
    assert.deepEqual(preview.destination, { channel: 'email', masked: 'ok••@example.invalid' });
    assert.equal(preview.lastInvitation.state, 'provider_accepted');
    assert.ok(!JSON.stringify(preview).includes('ok-0@example.invalid'), 'preview masks the destination');
    const key = randomUUID();
    const [first, second] = await Promise.all([1, 2].map(() =>
        actions.executeParticipantAction(pool, f.scope, { ...target, previewHash: preview.previewHash, idempotencyKey: key })));
    assert.equal(first.operationId, second.operationId, 'double click with one key is one operation');
    assert.equal([first, second].filter(result => result.reused).length, 1);
    await assert.rejects(actions.executeParticipantAction(pool, f.scope, { ...target, previewHash: preview.previewHash, idempotencyKey: randomUUID() }),
        { errorCode: 'MESSAGE_ALREADY_QUEUED' }, 'a fresh key cannot queue a second message');
    assert.equal((await actions.operationStatus(pool, f.scope, first.operationId)).items[0].state, 'queued');
    const callsBefore = provider.calls.length;
    assert.equal(await drain('dispatch_delivery'), 1);
    assert.equal(provider.calls.length, callsBefore + 1);
    assert.deepEqual(provider.calls.slice(callsBefore).map(call => [call.endpoint, call.purpose]), [['ok-0@example.invalid', 'reminder']]);
    const status = await actions.operationStatus(pool, f.scope, first.operationId);
    assert.equal(status.state, 'complete'); assert.equal(status.items[0].state, 'provider_accepted');
    const again = await actions.previewParticipantAction(pool, f.scope, target);
    assert.equal(again.reason, 'COOLDOWN_ACTIVE'); assert.ok(Date.parse(again.cooldownUntil) > Date.now());

    const uncertain = await actions.previewParticipantAction(pool, f.scope,
        { packageId: byKey['employee-2'].id, personId: people['employee-2'], purpose: 'resend' });
    assert.equal(uncertain.reason, 'PREVIOUS_OUTCOME_UNCERTAIN', 'an unknown outcome needs reconciliation, not another send');

    const failedTarget = { packageId: byKey['employee-1'].id, personId: people['employee-1'], purpose: 'resend' };
    const resend = await actions.previewParticipantAction(pool, f.scope, failedTarget);
    assert.equal(resend.eligible, true, 'a definitive failure can be resent');
    assert.deepEqual((await management.listPackages(pool, f.scope, receipt.submissionId, { state: 'attention' })).rows.map(row => row.name).sort(),
        ['employee-1', 'employee-2']);
    provider.recover('reject-1@example.invalid');
    const resent = await actions.executeParticipantAction(pool, f.scope, { ...failedTarget, previewHash: resend.previewHash, idempotencyKey: randomUUID() });
    await drain('dispatch_delivery');
    assert.equal((await actions.operationStatus(pool, f.scope, resent.operationId)).items[0].state, 'provider_accepted');
    assert.deepEqual((await management.listPackages(pool, f.scope, receipt.submissionId, { state: 'attention' })).rows.map(row => row.name), ['employee-2'],
        'a successful resend clears the earlier failure; the unknown outcome still needs attention');
    assert.equal((await management.listSubmissions(pool, f.scope, { state: 'pending' })).rows[0].attention_count, 1);
    await pool.query(`UPDATE signing_tasks t SET state='accepted' FROM signing_participations p
        WHERE p.owner_context_id=t.owner_context_id AND p.id=t.participation_id AND t.owner_context_id=$1 AND p.person_id=$2`, [f.contextId, people['employee-1']]);
    const skipped = await actions.executeParticipantAction(pool, f.scope, { ...failedTarget, previewHash: resend.previewHash, idempotencyKey: randomUUID() });
    assert.deepEqual(skipped.items.map(item => item.state), ['skipped_completed'], 'signed while the dialog was open');

    const late = { packageId: byKey['employee-3'].id, personId: people['employee-3'], purpose: 'reminder' };
    const latePreview = await actions.previewParticipantAction(pool, f.scope, late);
    const queued = await actions.executeParticipantAction(pool, f.scope, { ...late, previewHash: latePreview.previewHash, idempotencyKey: randomUUID() });
    await pool.query(`UPDATE signing_tasks t SET state='accepted' FROM signing_participations p
        WHERE p.owner_context_id=t.owner_context_id AND p.id=t.participation_id AND t.owner_context_id=$1 AND p.person_id=$2`, [f.contextId, people['employee-3']]);
    const beforeLate = provider.calls.length;
    await drain('dispatch_delivery');
    assert.equal(provider.calls.length, beforeLate, 'dispatch rechecks and skips someone who signed after queueing');
    assert.equal((await actions.operationStatus(pool, f.scope, queued.operationId)).items[0].state, 'skipped_completed');

    const after = (await management.listPackages(pool, f.scope, receipt.submissionId, { state: 'all', limit: 10 })).rows;
    for (const [name, accepted, required] of progressBefore) {
        const row = after.find(item => item.name === name);
        assert.equal(row.required_count, required, 'resend never changes the denominator');
        if (!['employee-1', 'employee-3'].includes(name)) assert.equal(row.accepted_count, accepted, 'resend never changes signatures');
    }

    const outsider = (await pool.query(`INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic outsider',$1,'Lawyer','synthetic-only') RETURNING userid`,
        [`${randomUUID()}@example.invalid`])).rows[0].userid;
    await assert.rejects(actions.previewParticipantAction(pool, { ...f.scope, userId: outsider, all: false }, target), { errorCode: 'NOT_FOUND' });
    await assert.rejects(actions.operationStatus(pool, { ...f.scope, userId: outsider, all: false }, first.operationId), { errorCode: 'NOT_FOUND' });

    const stored = JSON.stringify((await pool.query(`SELECT
        (SELECT jsonb_agg(details) FROM signing_events_v2 WHERE owner_context_id=$1) AS events,
        (SELECT jsonb_agg(result) FROM signing_operations WHERE owner_context_id=$1) AS operations,
        (SELECT jsonb_agg(to_jsonb(d)) FROM signing_deliveries d WHERE owner_context_id=$1) AS deliveries`, [f.contextId])).rows[0]);
    for (const call of provider.calls) assert.ok(!stored.includes(call.url.split('/s/')[1]), 'no access token in events, operations or deliveries');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { SAFETY_POLICY, reserveSafety, markDispatchSafety, pauseSafety, resumeSafety, publicSafety, normalizeFailure } = require('../services/integrations/whatsappSafety');

const BASE = Date.parse('2026-10-24T08:00:00.000Z');
const iso = ms => new Date(ms).toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
const reserve = (state, kind, now, phone) => reserveSafety(state, { kind, now, phone });

test('initial immutable operational policy enforces exact mutation and group interval boundaries without mutating input', () => {
    assert.ok(Object.isFrozen(SAFETY_POLICY));
    assert.equal(SAFETY_POLICY.stage, 'INITIAL');
    const initial = {};
    const group = reserve(initial, 'group', new Date(BASE));
    assert.equal(group.allowed, true);
    assert.deepEqual(initial, {});
    assert.deepEqual([group.reason, group.retryAt], [null, null]);
    const before = clone(group.state);
    const earlyInvite = reserve(group.state, 'invite', BASE + SAFETY_POLICY.mutationIntervalMs - 1, '+972501234567');
    assert.equal(earlyInvite.allowed, false);
    assert.equal(earlyInvite.reason, 'MUTATION_INTERVAL');
    assert.equal(earlyInvite.retryAt, iso(BASE + SAFETY_POLICY.mutationIntervalMs));
    assert.deepEqual(group.state, before);
    const invite = reserve(group.state, 'invite', BASE + SAFETY_POLICY.mutationIntervalMs, '+972501234567');
    assert.equal(invite.allowed, true);
    const earlyGroup = reserve(invite.state, 'group', BASE + SAFETY_POLICY.groupIntervalMs - 1);
    assert.equal(earlyGroup.reason, 'GROUP_INTERVAL');
    assert.equal(earlyGroup.retryAt, iso(BASE + SAFETY_POLICY.groupIntervalMs));
    assert.equal(reserve(invite.state, 'group', BASE + SAFETY_POLICY.groupIntervalMs).allowed, true);
});

test('ten groups consume the rolling budget; exactly 24 hours releases only the oldest reservation', () => {
    let state = {};
    for (let i = 0; i < SAFETY_POLICY.maxGroupsPerWindow; i++) {
        const result = reserve(state, 'group', BASE + i * SAFETY_POLICY.groupIntervalMs);
        assert.equal(result.allowed, true);
        state = clone(result.state);
    }
    const beforeExpiry = reserve(state, 'group', BASE + SAFETY_POLICY.rollingWindowMs - 1);
    assert.equal(beforeExpiry.reason, 'GROUP_BUDGET');
    assert.equal(beforeExpiry.retryAt, iso(BASE + SAFETY_POLICY.rollingWindowMs));
    const boundary = reserve(beforeExpiry.state, 'group', BASE + SAFETY_POLICY.rollingWindowMs);
    assert.equal(boundary.allowed, true);
    assert.equal(boundary.state.groups.length, SAFETY_POLICY.maxGroupsPerWindow);
    assert.equal(boundary.state.groups[0], iso(BASE + SAFETY_POLICY.groupIntervalMs));
});

test('fifty invitations consume their rolling budget and history remains bounded after expiry', () => {
    let state = {};
    for (let i = 0; i < SAFETY_POLICY.maxInvitesPerWindow; i++) {
        const result = reserve(state, 'invite', BASE + i * SAFETY_POLICY.mutationIntervalMs, `+1415555${String(i).padStart(4, '0')}`);
        assert.equal(result.allowed, true);
        state = result.state;
    }
    const full = reserve(state, 'invite', BASE + SAFETY_POLICY.rollingWindowMs - 1, '+14155559999');
    assert.equal(full.reason, 'INVITE_BUDGET');
    assert.equal(full.retryAt, iso(BASE + SAFETY_POLICY.rollingWindowMs));
    const boundary = reserve(full.state, 'invite', BASE + SAFETY_POLICY.rollingWindowMs, '+14155559999');
    assert.equal(boundary.allowed, true);
    assert.equal(boundary.state.invites.length, SAFETY_POLICY.maxInvitesPerWindow);
});

test('normalized recipients share an exact one-hour cooldown and public state contains no recipient data', () => {
    const first = reserve({}, 'invite', BASE, '050-123-4567');
    const hash = createHash('sha256').update('+972501234567').digest('hex');
    assert.equal(first.state.invites[0].recipientHash, hash);
    const early = reserve(clone(first.state), 'invite', BASE + SAFETY_POLICY.recipientInviteCooldownMs - 1, '+972 (50) 123-4567');
    assert.equal(early.reason, 'RECIPIENT_COOLDOWN');
    assert.equal(early.retryAt, iso(BASE + SAFETY_POLICY.recipientInviteCooldownMs));
    assert.equal(reserve(early.state, 'invite', BASE + SAFETY_POLICY.recipientInviteCooldownMs, '00972501234567').allowed, true);
    const visible = publicSafety(first.state, BASE);
    assert.deepEqual(visible.counts, { groups: 0, invites: 1 });
    assert.equal(visible.nextInviteAt, iso(BASE + SAFETY_POLICY.mutationIntervalMs));
    for (const secret of [hash, '0501234567', '+972501234567', 'recipientHash']) assert.equal(JSON.stringify(visible).includes(secret), false);
    assert.deepEqual(Object.keys(visible).sort(), ['counts', 'nextGroupAt', 'nextInviteAt', 'paused', 'pausedAt', 'policy', 'reason'].sort());
});

test('pause and resume preserve reservations across serialization, including an already exhausted budget', () => {
    let state = {};
    for (let i = 0; i < SAFETY_POLICY.maxGroupsPerWindow; i++) state = reserve(state, 'group', BASE + i * SAFETY_POLICY.groupIntervalMs).state;
    const now = BASE + SAFETY_POLICY.maxGroupsPerWindow * SAFETY_POLICY.groupIntervalMs;
    const before = clone(state);
    const paused = pauseSafety({ ...state, token: 'synthetic-private-token', error: { message: 'private provider payload' } }, 'MANUAL_PAUSE', now);
    assert.equal(paused.paused, true);
    assert.equal(paused.pausedAt, iso(now));
    assert.deepEqual(paused.groups, before.groups);
    assert.deepEqual(paused.invites, before.invites);
    assert.equal(JSON.stringify(paused).includes('private'), false);
    assert.equal(reserve(paused, 'group', now + SAFETY_POLICY.rollingWindowMs).reason, 'MANUAL_PAUSE');
    const resumed = resumeSafety(clone(paused), now);
    const { paused: _paused, reason: _reason, pausedAt: _pausedAt, ...history } = resumed;
    const { paused: _oldPaused, reason: _oldReason, pausedAt: _oldPausedAt, ...oldHistory } = paused;
    assert.deepEqual(history, oldHistory);
    assert.equal(reserve(resumed, 'group', now).reason, 'GROUP_BUDGET');
    assert.equal(publicSafety(resumed, BASE + SAFETY_POLICY.rollingWindowMs).counts.groups, 9);
    assert.deepEqual(state, before);
});

test('malformed persisted state fails closed permanently and strips untrusted metadata', () => {
    const valid = reserve({}, 'group', BASE).state;
    const malformed = [null, [], new Date(BASE), 'not-json', { token: 'private-token' },
        { ...valid, version: 2 }, { ...valid, groups: ['invalid-time'] },
        { ...valid, invites: [{ at: iso(BASE), recipientHash: '+972501234567', token: 'private-token' }] },
        { ...valid, groups: Array(11).fill(iso(BASE)) },
        { ...valid, lastObservedAt: '2026-10-24' }, { ...valid, paused: true, reason: 'raw provider text', pausedAt: iso(BASE) }];
    for (const raw of malformed) {
        const result = reserve(raw, 'group', BASE + SAFETY_POLICY.groupIntervalMs);
        assert.equal(result.allowed, false);
        assert.equal(result.reason, 'INVALID_SAFETY_STATE');
        assert.equal(result.retryAt, null);
        const resumed = resumeSafety(clone(result.state), BASE + 2 * SAFETY_POLICY.rollingWindowMs);
        assert.equal(resumed.paused, true);
        assert.equal(resumed.reason, 'INVALID_SAFETY_STATE');
        assert.equal(reserve(resumed, 'group', BASE + 2 * SAFETY_POLICY.rollingWindowMs).allowed, false);
        const serialized = JSON.stringify(result.state);
        for (const secret of ['private-token', '+972501234567', 'raw provider text']) assert.equal(serialized.includes(secret), false);
        assert.ok(result.state.groups.length <= SAFETY_POLICY.maxGroupsPerWindow);
        assert.ok(result.state.invites.length <= SAFETY_POLICY.maxInvitesPerWindow);
    }
    assert.equal(reserve(valid, 'group', new Date('invalid')).reason, 'INVALID_SAFETY_STATE');
});

test('future timestamps and clock rollback cannot release reservations early', () => {
    const future = BASE + SAFETY_POLICY.recipientInviteCooldownMs;
    const reserved = reserve({}, 'group', future);
    const rollback = reserve(clone(reserved.state), 'group', BASE);
    assert.equal(rollback.allowed, false);
    assert.equal(rollback.retryAt, iso(future + SAFETY_POLICY.groupIntervalMs));
    assert.deepEqual(rollback.state.groups, reserved.state.groups);
    assert.equal(reserve(rollback.state, 'group', future + SAFETY_POLICY.groupIntervalMs - 1).allowed, false);
    assert.equal(reserve(rollback.state, 'group', future + SAFETY_POLICY.groupIntervalMs).allowed, true);
    const paused = pauseSafety({}, 'MANUAL_PAUSE', future);
    const resumed = resumeSafety(clone(paused), BASE);
    const beforeClockCatchesUp = reserve(resumed, 'invite', BASE, '+972501234567');
    assert.equal(beforeClockCatchesUp.reason, 'CLOCK_ROLLBACK');
    assert.equal(beforeClockCatchesUp.retryAt, iso(future));
    assert.equal(reserve(beforeClockCatchesUp.state, 'invite', future, '+972501234567').allowed, true);
});

test('invalid operation cannot reserve, and unknown pause input becomes only a safe fixed reason', () => {
    assert.equal(reserve({}, 'message', BASE).reason, 'INVALID_SAFETY_OPERATION');
    const invalidPhone = reserve({}, 'invite', BASE, 'not-a-phone-token');
    assert.equal(invalidPhone.allowed, false);
    assert.equal(invalidPhone.state.invites.length, 0);
    const paused = pauseSafety({}, 'raw token and provider message', BASE);
    assert.equal(paused.reason, 'RESULT_UNKNOWN');
    assert.equal(JSON.stringify(paused).includes('raw token'), false);
    assert.deepEqual(pauseSafety(paused, 'PROVIDER_AUTH', BASE + 1), paused);
});

test('provider failures use typed reasons, status and numeric codes while preserving uncertain outcomes', () => {
    for (const code of [4, 17, 32, 613, 130429, 131048, 131056]) assert.deepEqual(normalizeFailure({ providerCode: code }), { reason: 'PROVIDER_RATE_LIMIT', uncertain: false });
    assert.deepEqual(normalizeFailure({ providerStatus: 429 }), { reason: 'PROVIDER_RATE_LIMIT', uncertain: false });
    assert.deepEqual(normalizeFailure({ providerCode: '190' }), { reason: 'PROVIDER_AUTH', uncertain: false });
    assert.deepEqual(normalizeFailure({ response: { status: 401 } }), { reason: 'PROVIDER_AUTH', uncertain: false });
    assert.deepEqual(normalizeFailure({ providerStatus: 403 }), { reason: 'PROVIDER_REJECTED', uncertain: false });
    assert.deepEqual(normalizeFailure({ providerCode: 999999, providerStatus: 400 }), { reason: 'PROVIDER_REJECTED', uncertain: false });
    assert.deepEqual(normalizeFailure({ connected: false }), { reason: 'PROVIDER_DISCONNECTED', uncertain: false });
    assert.deepEqual(normalizeFailure({ safetyReason: 'PROVIDER_AUTH', uncertain: true }), { reason: 'PROVIDER_AUTH', uncertain: true });
    assert.deepEqual(normalizeFailure({ providerCode: 130429, providerStatus: 503 }), { reason: 'PROVIDER_RATE_LIMIT', uncertain: true });
    assert.deepEqual(normalizeFailure({ providerStatus: 503 }), { reason: 'RESULT_UNKNOWN', uncertain: true });
    assert.deepEqual(normalizeFailure(Object.assign(new Error('rate limit auth disconnected token-private'), { uncertain: false })), { reason: 'RESULT_UNKNOWN', uncertain: true });
    assert.deepEqual(normalizeFailure({ safetyReason: 'untrusted-provider-text', message: 'private', token: 'private', code: 'ECONNRESET' }), { reason: 'RESULT_UNKNOWN', uncertain: true });
    assert.deepEqual(normalizeFailure(null), { reason: 'RESULT_UNKNOWN', uncertain: true });
});

test('actual dispatch extends the counted reservation without refunding history or allowing a burst', () => {
    const group = reserve({}, 'group', BASE);
    const invitation = reserve(group.state, 'invite', BASE + SAFETY_POLICY.mutationIntervalMs, '+972501234567');
    const before = clone(invitation.state), dispatchedAt = BASE + SAFETY_POLICY.recipientInviteCooldownMs;
    const dispatched = markDispatchSafety(invitation.state, { kind: 'invite', phone: '0501234567',
        reservedAt: invitation.state.lastMutationAt, now: dispatchedAt });
    assert.equal(dispatched.allowed, true);
    assert.deepEqual(dispatched.state.groups, before.groups);
    assert.equal(dispatched.state.invites.length, before.invites.length);
    assert.equal(dispatched.state.invites[0].recipientHash, before.invites[0].recipientHash);
    assert.equal(dispatched.state.invites[0].at, iso(dispatchedAt));
    assert.equal(dispatched.state.lastMutationAt, iso(dispatchedAt));
    assert.equal(dispatched.state.lastObservedAt, iso(dispatchedAt));
    assert.equal(reserve(dispatched.state, 'group', dispatchedAt + SAFETY_POLICY.mutationIntervalMs - 1).reason, 'MUTATION_INTERVAL');
    assert.equal(reserve(dispatched.state, 'invite', dispatchedAt + SAFETY_POLICY.recipientInviteCooldownMs - 1, '+972501234567').reason, 'RECIPIENT_COOLDOWN');
    assert.deepEqual(invitation.state, before);
    const movedGroup = markDispatchSafety(group.state, { kind: 'group', reservedAt: iso(BASE), now: dispatchedAt });
    assert.equal(movedGroup.state.groups.length, 1);
    assert.equal(movedGroup.state.groups[0], iso(dispatchedAt));
    assert.equal(reserve(movedGroup.state, 'group', dispatchedAt + SAFETY_POLICY.groupIntervalMs - 1).reason, 'GROUP_INTERVAL');
});

test('actual dispatch rejects mismatched reservations and cannot move a reservation backwards', () => {
    const reserved = reserve({}, 'invite', BASE, '+972501234567');
    const mismatch = markDispatchSafety(reserved.state, { kind: 'invite', phone: '+972521234567', reservedAt: iso(BASE), now: BASE + 1000 });
    assert.equal(mismatch.allowed, false);
    assert.equal(mismatch.reason, 'INVALID_SAFETY_STATE');
    assert.deepEqual(mismatch.state.invites, reserved.state.invites);
    const rollback = markDispatchSafety(reserved.state, { kind: 'invite', phone: '+972501234567', reservedAt: iso(BASE), now: BASE - 1 });
    assert.equal(rollback.allowed, false);
    assert.equal(rollback.reason, 'CLOCK_ROLLBACK');
    assert.equal(rollback.retryAt, iso(BASE));
    assert.deepEqual(rollback.state, reserved.state);
    assert.equal(markDispatchSafety(reserved.state, { kind: 'group', reservedAt: iso(BASE), now: BASE + 1000 }).allowed, false);
});

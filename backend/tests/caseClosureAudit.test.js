const test = require('node:test');
const assert = require('node:assert/strict');
const { computeClosureAudit, resolveActorId } = require('../lib/caseClosureAudit');
const C = require('../services/managerHome/constants');

test('computeClosureAudit: closing sets actor and clears reopen fields', () => {
    const result = computeClosureAudit({
        wasClosed: false,
        nowClosed: true,
        isClosedProvided: true,
        actorId: 42,
        previous: { reopened_at: new Date('2026-01-01'), reopened_by_userid: 7 },
    });

    assert.ok(result.closedAt instanceof Date);
    assert.equal(result.closedByUserId, 42);
    assert.equal(result.reopenedAt, null);
    assert.equal(result.reopenedByUserId, null);
});

test('computeClosureAudit: reopening clears close fields and sets reopen actor', () => {
    const result = computeClosureAudit({
        wasClosed: true,
        nowClosed: false,
        isClosedProvided: true,
        actorId: 99,
        previous: {
            closed_at: new Date('2026-08-01'),
            closed_by_userid: 42,
        },
    });

    assert.equal(result.closedAt, null);
    assert.equal(result.closedByUserId, null);
    assert.ok(result.reopenedAt instanceof Date);
    assert.equal(result.reopenedByUserId, 99);
});

test('computeClosureAudit: omitted IsClosed preserves previous audit fields', () => {
    const previous = {
        closed_at: new Date('2026-08-01'),
        closed_by_userid: 42,
        reopened_at: null,
        reopened_by_userid: null,
    };
    const result = computeClosureAudit({
        wasClosed: true,
        nowClosed: true,
        isClosedProvided: false,
        actorId: 1,
        previous,
    });

    assert.equal(result.closedAt, previous.closed_at);
    assert.equal(result.closedByUserId, 42);
});

test('resolveActorId reads req.user.UserId', () => {
    assert.equal(resolveActorId({ user: { UserId: 1017 } }), 1017);
    assert.equal(resolveActorId({ user: {} }), null);
    assert.equal(resolveActorId(null), null);
});

test('NO_ACTIVITY_DAYS threshold is 90 days', () => {
    assert.equal(C.NO_ACTIVITY_DAYS, 90);
});

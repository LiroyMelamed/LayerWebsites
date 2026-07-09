const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-oauth-state-secret';

const { signOAuthState, verifyOAuthState, STATE_TTL_MS } = require('../lib/calendarOAuthState');

test('signOAuthState + verifyOAuthState round-trip', () => {
    const state = signOAuthState({ userId: 1017 });
    const decoded = verifyOAuthState(state);
    assert.equal(decoded.userId, 1017);
    assert.ok(Number.isFinite(decoded.ts));
});

test('verifyOAuthState rejects tampered payload', () => {
    const state = signOAuthState({ userId: 1017 });
    const dot = state.lastIndexOf('.');
    const payload = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: 9999, ts: JSON.parse(Buffer.from(payload, 'base64url').toString()).ts })
    ).toString('base64url');
    assert.throws(
        () => verifyOAuthState(`${tamperedPayload}.${sig}`),
        /invalid state signature/
    );
});

test('verifyOAuthState rejects tampered signature', () => {
    const state = signOAuthState({ userId: 1017 });
    const dot = state.lastIndexOf('.');
    const payload = state.slice(0, dot);
    const badSig = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('base64url');
    assert.throws(
        () => verifyOAuthState(`${payload}.${badSig}`),
        /invalid state signature/
    );
});

test('verifyOAuthState rejects unsigned legacy state', () => {
    const legacy = Buffer.from(JSON.stringify({ userId: 1017 })).toString('base64url');
    assert.throws(() => verifyOAuthState(legacy), /invalid state format/);
});

test('verifyOAuthState rejects expired state', () => {
    const secret = process.env.CALENDAR_OAUTH_STATE_SECRET || process.env.JWT_SECRET;
    const ts = Date.now() - STATE_TTL_MS - 1000;
    const payload = Buffer.from(JSON.stringify({ userId: 1017, ts })).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    assert.throws(() => verifyOAuthState(`${payload}.${sig}`), /state expired/);
});

test('verifyOAuthState rejects missing state', () => {
    assert.throws(() => verifyOAuthState(''), /missing state/);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { consume, resetStore, pruneStore, getClientIp } = require('../utils/rateLimiter');

test('rateLimiter: blocks after max within fixed window', () => {
    resetStore();

    const windowMs = 1000;
    const max = 2;
    const key = 'k1';

    const r1 = consume({ key, windowMs, max, currentTimeMs: 0 });
    const r2 = consume({ key, windowMs, max, currentTimeMs: 10 });
    const r3 = consume({ key, windowMs, max, currentTimeMs: 20 });

    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, false);
});

test('rateLimiter: resets on next window boundary', () => {
    resetStore();

    const windowMs = 1000;
    const max = 1;
    const key = 'k2';

    const r1 = consume({ key, windowMs, max, currentTimeMs: 0 });
    const r2 = consume({ key, windowMs, max, currentTimeMs: 500 });
    const r3 = consume({ key, windowMs, max, currentTimeMs: 1000 });

    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, false);
    assert.equal(r3.allowed, true);
});

test('rateLimiter: different keys do not share budgets', () => {
    resetStore();

    const windowMs = 1000;
    const max = 1;

    const a1 = consume({ key: 'a', windowMs, max, currentTimeMs: 0 });
    const b1 = consume({ key: 'b', windowMs, max, currentTimeMs: 0 });
    const a2 = consume({ key: 'a', windowMs, max, currentTimeMs: 10 });

    assert.equal(a1.allowed, true);
    assert.equal(b1.allowed, true);
    assert.equal(a2.allowed, false);
});

test('getClientIp: ignores x-forwarded-for when trustProxy=false', () => {
    const req = {
        headers: { 'x-forwarded-for': '203.0.113.10' },
        ip: '198.51.100.5',
    };

    assert.equal(getClientIp(req, { trustProxy: false }), '198.51.100.5');
});

test('getClientIp: uses validated x-forwarded-for when trustProxy=true', () => {
    const req = {
        headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
        ip: '198.51.100.5',
    };

    assert.equal(getClientIp(req, { trustProxy: true }), '203.0.113.10');
});

test('getClientIp: ignores invalid x-forwarded-for when trustProxy=true', () => {
    const req = {
        headers: { 'x-forwarded-for': 'not-an-ip, 10.0.0.1' },
        ip: '198.51.100.5',
    };

    assert.equal(getClientIp(req, { trustProxy: true }), '198.51.100.5');
});

test('pruneStore: evicts oldest entries to cap store size', () => {
    resetStore();

    const windowMs = 1000;
    const max = 1;

    for (let i = 0; i < 20; i += 1) {
        consume({ key: `k:${i}`, windowMs, max, currentTimeMs: i });
    }

    const stats = pruneStore({ maxEntries: 10, maxAgeMs: 60 * 1000, currentTimeMs: 1000 });
    assert.equal(stats.before, 20);
    assert.equal(stats.after, 10);
    assert.equal(stats.removedBySize, 10);
});

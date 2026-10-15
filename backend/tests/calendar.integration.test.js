const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure tests are not flaky due to low rate limits.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RATE_LIMIT_IP_WINDOW_MS = process.env.RATE_LIMIT_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_IP_MAX = process.env.RATE_LIMIT_IP_MAX || '100000';
process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS = process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_AUTH_IP_MAX = process.env.RATE_LIMIT_AUTH_IP_MAX || '100000';
process.env.RATE_LIMIT_USER_WINDOW_MS = process.env.RATE_LIMIT_USER_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_USER_MAX = process.env.RATE_LIMIT_USER_MAX || '100000';
process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'false';
process.env.IS_PRODUCTION = process.env.IS_PRODUCTION || 'false';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { resetStore } = require('../utils/rateLimiter');

function makeToken({ userid = 1, role = 'Admin' } = {}) {
    return jwt.sign(
        { userid, role, phoneNumber: '0500000000' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

// ── Auth guards (no DB required) ────────────────────────────────────────────

test('GET /api/calendar returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/calendar');
    assert.equal(res.status, 401);
});

test('GET /api/calendar/today returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/calendar/today');
    assert.equal(res.status, 401);
});

test('POST /api/calendar returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/calendar')
        .send({ title: 'x', start_time: new Date().toISOString(), end_time: new Date().toISOString() });
    assert.equal(res.status, 401);
});

test('GET /api/calendar/feed/token returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/calendar/feed/token');
    assert.equal(res.status, 401);
});

test('GET /api/calendar/google/status returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/calendar/google/status');
    assert.equal(res.status, 401);
});

// ── Role guards (Lawyer/Admin only — no DB required) ────────────────────────

test('GET /api/calendar returns 403 for a non-lawyer/admin role', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .get('/api/calendar')
        .set('Authorization', `Bearer ${makeToken({ userid: 99999, role: 'User' })}`);
    assert.equal(res.status, 403);
});

test('POST /api/calendar returns 403 for a non-lawyer/admin role', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${makeToken({ userid: 99999, role: 'User' })}`)
        .send({ title: 'x', start_time: new Date().toISOString(), end_time: new Date().toISOString() });
    assert.equal(res.status, 403);
});

// ── Param validation: named routes resolve before /:id ──────────────────────

test('GET /api/calendar/:id rejects a non-numeric id (does not collide with /today)', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .get('/api/calendar/not-a-number')
        .set('Authorization', `Bearer ${makeToken({ userid: 1, role: 'Admin' })}`);
    // /today is matched by its own handler; a bogus id must NOT be treated as 'today'.
    assert.notEqual(res.status, 401);
    assert.ok(res.status === 400 || res.status === 404 || res.status === 422 || res.status === 500);
});

// ── Public iCal feed: unknown token must not leak data ──────────────────────

test('GET /api/calendar/feed/:token with unknown token does not return 200 calendar data', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/calendar/feed/00000000-0000-0000-0000-000000000000');
    // Public feed must NEVER return calendar data for an unknown token.
    // Acceptable: 404 (token unknown), 503 (ical package missing), 500 (table not migrated yet).
    assert.notEqual(res.status, 200);
    assert.ok(res.status >= 400);
});

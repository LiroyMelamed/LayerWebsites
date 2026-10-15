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

function makeToken({ userid = 99999999, role = 'Lawyer' } = {}) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

test('GET /api/Cases/my returns 200 and an array for Lawyer', async () => {
    resetStore();
    const app = require('../app');

    const res = await request(app)
        .get('/api/Cases/my')
        .set('Authorization', `Bearer ${makeToken({ role: 'Lawyer' })}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
});

test('GET /api/Cases/my returns 403 for non-lawyer user', async () => {
    resetStore();
    const app = require('../app');

    const res = await request(app)
        .get('/api/Cases/my')
        .set('Authorization', `Bearer ${makeToken({ role: 'User' })}`);

    assert.equal(res.status, 403);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.errorCode, 'FORBIDDEN');
    assert.equal(res.body?.code, 'FORBIDDEN');
});

const test = require('node:test');
const assert = require('node:assert/strict');

// Keep the test fast: make the JSON limit tiny so we can exceed it with a small payload.
process.env.API_JSON_LIMIT = process.env.API_JSON_LIMIT || '1kb';
process.env.API_URLENCODED_LIMIT = process.env.API_URLENCODED_LIMIT || '1kb';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RATE_LIMIT_IP_WINDOW_MS = process.env.RATE_LIMIT_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_IP_MAX = process.env.RATE_LIMIT_IP_MAX || '100000';
process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS = process.env.RATE_LIMIT_AUTH_IP_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_AUTH_IP_MAX = process.env.RATE_LIMIT_AUTH_IP_MAX || '100000';
process.env.RATE_LIMIT_USER_WINDOW_MS = process.env.RATE_LIMIT_USER_WINDOW_MS || String(60 * 1000);
process.env.RATE_LIMIT_USER_MAX = process.env.RATE_LIMIT_USER_MAX || '100000';
process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'false';
process.env.IS_PRODUCTION = process.env.IS_PRODUCTION || 'false';

const request = require('supertest');

test('returns REQUEST_TOO_LARGE for oversized JSON', async () => {
    const app = require('../app');

    // A JSON string larger than 1kb once stringified.
    const big = 'x'.repeat(3000);

    const res = await request(app)
        .post('/api/Auth/RequestOtp')
        .send({ phoneNumber: big });

    assert.equal(res.status, 413);
    assert.equal(res.body?.code, 'REQUEST_TOO_LARGE');
    assert.equal(typeof res.body?.message, 'string');
    assert.ok(res.body.message.length > 0);
});

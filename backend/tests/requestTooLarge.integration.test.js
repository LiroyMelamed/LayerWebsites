const test = require('node:test');
const assert = require('node:assert/strict');

// Keep the test fast and deterministic: force the JSON limit tiny so we can exceed it with a small payload.
// (Do not respect existing env values; production servers often set these to 10mb+.)
process.env.API_JSON_LIMIT = '1kb';
process.env.API_URLENCODED_LIMIT = '1kb';

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
    // Ensure the app picks up the forced env limits even if another test already imported it.
    delete require.cache[require.resolve('../app')];
    const app = require('../app');

    // A JSON string larger than 1kb once stringified.
    const big = 'x'.repeat(3000);

    const res = await request(app)
        .post('/api/Auth/RequestOtp')
        .send({ phoneNumber: big });

    assert.equal(res.status, 413);
    assert.equal(res.body?.code, 'REQUEST_TOO_LARGE');
    assert.equal(res.body?.errorCode, 'REQUEST_TOO_LARGE');
});

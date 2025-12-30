const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const request = require('supertest');

const { createRateLimitMiddleware, resetStore } = require('../utils/rateLimiter');

test('rate limit middleware sets Retry-After and returns consistent JSON on 429', async () => {
    resetStore();

    const app = express();

    app.use(
        createRateLimitMiddleware({
            name: 'test',
            windowMs: String(60 * 1000),
            max: '1',
            message: 'Too many requests',
            keyFn: () => 'constant',
        })
    );

    app.get('/x', (req, res) => res.status(200).json({ ok: true }));

    const first = await request(app).get('/x');
    assert.equal(first.status, 200);

    const second = await request(app).get('/x');
    assert.equal(second.status, 429);
    assert.equal(second.body.code, 'RATE_LIMITED');
    assert.equal(typeof second.body.message, 'string');

    const retryAfter = Number(second.headers['retry-after']);
    assert.ok(Number.isFinite(retryAfter));
    assert.ok(retryAfter >= 0);
});

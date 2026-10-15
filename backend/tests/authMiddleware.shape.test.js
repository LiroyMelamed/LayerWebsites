const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const request = require('supertest');

// Make sure auth middleware uses a deterministic secret for this test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const authMiddleware = require('../middlewares/authMiddleware');
const { resetStore } = require('../utils/rateLimiter');
const errorHandler = require('../middlewares/errorHandler');

test('auth middleware returns consistent JSON on missing token', async () => {
    resetStore();

    const app = express();
    app.get('/secure', authMiddleware, (req, res) => res.status(200).json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app).get('/secure');

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'UNAUTHORIZED');
    assert.equal(res.body.code, 'UNAUTHORIZED');
    assert.equal(typeof res.body.message, 'string');
    // Hebrew sanity check (user-facing message must be in Hebrew)
    assert.match(res.body.message, /[\u0590-\u05FF]/);
});

test('auth middleware returns consistent JSON on invalid token', async () => {
    resetStore();

    const app = express();
    app.get('/secure', authMiddleware, (req, res) => res.status(200).json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app)
        .get('/secure')
        .set('Authorization', 'Bearer definitely-not-a-jwt');

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.errorCode, 'UNAUTHORIZED');
    assert.equal(res.body.code, 'UNAUTHORIZED');
    assert.equal(typeof res.body.message, 'string');
});

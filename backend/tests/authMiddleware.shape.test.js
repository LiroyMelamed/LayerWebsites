const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const request = require('supertest');

// Make sure auth middleware uses a deterministic secret for this test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const authMiddleware = require('../middlewares/authMiddleware');
const { resetStore } = require('../utils/rateLimiter');

test('auth middleware returns consistent JSON on missing token', async () => {
    resetStore();

    const app = express();
    app.get('/secure', authMiddleware, (req, res) => res.status(200).json({ ok: true }));

    const res = await request(app).get('/secure');

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
    assert.equal(typeof res.body.message, 'string');
});

test('auth middleware returns consistent JSON on invalid token', async () => {
    resetStore();

    const app = express();
    app.get('/secure', authMiddleware, (req, res) => res.status(200).json({ ok: true }));

    const res = await request(app)
        .get('/secure')
        .set('Authorization', 'Bearer definitely-not-a-jwt');

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
    assert.equal(typeof res.body.message, 'string');
});

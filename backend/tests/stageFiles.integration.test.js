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
        { userid, role, phoneNumber: '0500000000', UserId: userid, Role: role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

// --- Auth / Param validation tests (do not require DB) ---

test('GET /api/Files/stage-files/:caseId returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/Files/stage-files/1');
    assert.equal(res.status, 401);
});

test('POST /api/Files/stage-files/:caseId/:stage returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/Files/stage-files/1/1')
        .send({ fileKey: 'test', fileName: 'test.pdf' });
    assert.equal(res.status, 401);
});

test('DELETE /api/Files/stage-files/:fileId returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).delete('/api/Files/stage-files/1');
    assert.equal(res.status, 401);
});

test('GET /api/Files/stage-file-read/:fileId returns 401 without token', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app).get('/api/Files/stage-file-read/1');
    assert.equal(res.status, 401);
});

test('POST /api/Files/stage-files/:caseId/:stage returns 403 for non-admin', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/Files/stage-files/1/1')
        .set('Authorization', `Bearer ${makeToken({ userid: 99999, role: 'User' })}`)
        .send({ fileKey: 'test', fileName: 'test.pdf' });
    assert.equal(res.status, 403);
});

test('DELETE /api/Files/stage-files/:fileId returns 403 for non-admin', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .delete('/api/Files/stage-files/1')
        .set('Authorization', `Bearer ${makeToken({ userid: 99999, role: 'User' })}`)
    assert.equal(res.status, 403);
});

test('POST /api/Files/stage-files/:caseId/:stage returns 422 for non-numeric caseId', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/Files/stage-files/abc/1')
        .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`)
        .send({ fileKey: 'test', fileName: 'test.pdf' });
    assert.equal(res.status, 422);
});

test('POST /api/Files/stage-files/:caseId/:stage returns 422 for non-numeric stage', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/Files/stage-files/1/abc')
        .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`)
        .send({ fileKey: 'test', fileName: 'test.pdf' });
    assert.equal(res.status, 422);
});

test('GET /api/Files/stage-files/abc returns 422 for non-numeric caseId', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .get('/api/Files/stage-files/abc')
        .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`)
    assert.equal(res.status, 422);
});

test('POST /api/Files/stage-files/:caseId/:stage returns 400 when fileKey missing', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/Files/stage-files/1/1')
        .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`)
        .send({ fileName: 'test.pdf' }); // missing fileKey
    assert.equal(res.status, 400);
    assert.ok(res.body.message);
});

test('POST /api/Files/stage-files/:caseId/:stage returns 400 when fileName missing', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .post('/api/Files/stage-files/1/1')
        .set('Authorization', `Bearer ${makeToken({ role: 'Admin' })}`)
        .send({ fileKey: 'some/key' }); // missing fileName
    assert.equal(res.status, 400);
    assert.ok(res.body.message);
});

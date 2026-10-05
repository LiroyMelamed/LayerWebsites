const test = require('node:test');
const assert = require('node:assert/strict');
const identities = require('./helpers/identityFixture').useTestIdentities();

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

function makeToken({ userid, role = 'Admin' } = {}) {
    userid ??= role === 'User' ? identities.client : identities.admin;
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
        .set('Authorization', `Bearer ${makeToken({ userid: identities.client, role: 'User' })}`)
        .send({ fileKey: 'test', fileName: 'test.pdf' });
    assert.equal(res.status, 403);
});

test('DELETE /api/Files/stage-files/:fileId returns 403 for non-admin', async () => {
    resetStore();
    const app = require('../app');
    const res = await request(app)
        .delete('/api/Files/stage-files/1')
        .set('Authorization', `Bearer ${makeToken({ userid: identities.client, role: 'User' })}`)
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

// Database-only lifecycle: synthetic metadata; no object is uploaded or downloaded.
test('stage-file lifecycle denies unrelated clients and cleans up deleted metadata', { skip: process.env.LEGAL_DB_QA !== 'true' }, async (t) => {
    const pool = require('../config/db');
    const app = require('../app');
    const { rows } = await pool.query("INSERT INTO cases(casename,userid) VALUES('Synthetic file QA',$1) RETURNING caseid",[identities.client]);
    const caseId = rows[0].caseid;
    t.after(async () => {
        await pool.query('DELETE FROM stage_files WHERE caseid=$1',[caseId]);
        await pool.query('DELETE FROM case_users WHERE caseid=$1',[caseId]);
        await pool.query('DELETE FROM cases WHERE caseid=$1',[caseId]);
    });
    await pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)',[caseId,identities.client]);
    const admin = `Bearer ${makeToken({userid:identities.admin,role:'Admin'})}`;
    const client = `Bearer ${makeToken({userid:identities.client,role:'User'})}`;
    const outsider = `Bearer ${makeToken({userid:identities.outsider,role:'User'})}`;
    const added = await request(app).post(`/api/Files/stage-files/${caseId}/1`).set('Authorization',admin)
        .send({fileKey:`synthetic-qa/${caseId}/test.pdf`,fileName:'synthetic.pdf',fileMime:'application/pdf',fileSize:24});
    assert.equal(added.status,201);
    const fileId = added.body.id;
    const list = await request(app).get(`/api/Files/stage-files/${caseId}`).set('Authorization',client);
    assert.equal(list.status,200);
    assert.deepEqual(list.body.map(f=>f.id),[fileId]);
    for (const path of [`stage-files/${caseId}`,`stage-file-read/${fileId}`]) {
        const denied = await request(app).get(`/api/Files/${path}`).set('Authorization',outsider);
        assert.equal(denied.status,403);
        assert.equal(denied.body.readUrl,undefined);
    }
    const read = await request(app).get(`/api/Files/stage-file-read/${fileId}`).set('Authorization',client);
    assert.equal(read.status,200);
    assert.equal(read.body.fileName,'synthetic.pdf');
    assert.equal(new URL(read.body.readUrl).hostname,'127.0.0.1');
    assert.equal((await request(app).delete(`/api/Files/stage-files/${fileId}`).set('Authorization',client)).status,403);
    assert.equal((await request(app).delete(`/api/Files/stage-files/${fileId}`).set('Authorization',admin)).status,200);
    assert.equal((await request(app).get(`/api/Files/stage-file-read/${fileId}`).set('Authorization',client)).status,404);
});

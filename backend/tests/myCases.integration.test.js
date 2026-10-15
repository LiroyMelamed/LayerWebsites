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

function makeToken({ userid, role = 'Lawyer' } = {}) {
    userid ??= role === 'User' ? identities.client : identities.lawyer;
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

// Opt-in: requires an isolated database seeded with synthetic users1017/1088/1091.
test('case pagination preserves personal-list scope and dedicated-office parity', { skip: process.env.LEGAL_DB_QA !== 'true' }, async (t) => {
    const pool = require('../config/db');
    const app = require('../app');
    const caseIds = [];
    t.after(async () => {
        await pool.query('DELETE FROM case_users WHERE caseid = ANY($1::int[])', [caseIds]);
        await pool.query('DELETE FROM cases WHERE caseid = ANY($1::int[])', [caseIds]);
    });
    for (const [manager, date] of [[1088, '2099-01-02'], [1088, '2099-01-01'], [1091, '2099-01-03']]) {
        const { rows } = await pool.query(
            `INSERT INTO cases(casename,casemanagerid,userid,istagged,isclosed,createdat)
             VALUES ('Synthetic pagination QA',$1,$1,true,false,$2) RETURNING caseid`, [manager, date]);
        caseIds.push(rows[0].caseid);
        await pool.query('INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [rows[0].caseid, manager]);
    }
    for (const route of ['my', 'TaggedCases', 'TaggedCasesByName', 'GetCases', 'GetCaseByName']) {
        for (let offset = 0; offset < 2; offset++) {
            const res = await request(app).get(`/api/Cases/${route}?limit=1&offset=${offset}`)
                .set('Authorization', `Bearer ${makeToken({ userid:1088, role:'Lawyer' })}`);
            assert.equal(res.status,200,`${route}: ${JSON.stringify(res.body)}`);
            const expected = route === 'my' ? [caseIds[0],caseIds[1]] : [caseIds[2],caseIds[0],caseIds[1]];
            assert.deepEqual(res.body.map(c => c.CaseId), [expected[offset]], route);
        }
    }
    const admin = await request(app).get('/api/Cases/GetCases?limit=3&offset=0')
        .set('Authorization', `Bearer ${makeToken({ userid:1017, role:'Admin' })}`);
    assert.equal(admin.status,200);
    assert.deepEqual(admin.body.map(c => c.CaseId), [caseIds[2],caseIds[0],caseIds[1]]);
});

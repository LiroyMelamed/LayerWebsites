const test = require('node:test');
const assert = require('node:assert/strict');

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
const pool = require('../config/db');
const { resetStore } = require('../utils/rateLimiter');

function makeToken({ userid, role }) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

async function createUser({ role = 'User' } = {}) {
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [`test_${unique}`, `test_${unique}@example.com`, `050${unique.slice(-7)}`, null, role, `co_${unique}`]
    );
    return res.rows[0].userid;
}

async function createCaseType() {
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const res = await pool.query(
        `insert into casetypes (casetypename, numberofstages)
         values ($1,$2)
         returning casetypeid`,
        [`ct_${unique}`, 2]
    );
    return res.rows[0].casetypeid;
}

async function createCase({ userId, caseTypeId }) {
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const res = await pool.query(
        `insert into cases (casename, casetypeid, userid, companyname, currentstage, isclosed, istagged, createdat, updatedat)
         values ($1,$2,$3,$4,$5,$6,$7,now(),now())
         returning caseid`,
        [`case_${unique}`, caseTypeId, userId, `co_${unique}`, 1, false, false]
    );
    return res.rows[0].caseid;
}

async function cleanup({ caseId, caseTypeId, userIds }) {
    try {
        if (caseId) {
            await pool.query('delete from casedescriptions where caseid = $1', [caseId]).catch(() => {});
            await pool.query('delete from cases where caseid = $1', [caseId]).catch(() => {});
        }
        if (caseTypeId) {
            await pool.query('delete from casetypedescriptions where casetypeid = $1', [caseTypeId]).catch(() => {});
            await pool.query('delete from casetypes where casetypeid = $1', [caseTypeId]).catch(() => {});
        }
        if (Array.isArray(userIds) && userIds.length > 0) {
            // Remove dependent rows first (minimal set).
            for (const uid of userIds) {
                await pool.query('delete from userdevices where userid = $1', [uid]).catch(() => {});
                await pool.query('delete from otps where userid = $1', [uid]).catch(() => {});
                await pool.query('delete from usernotifications where userid = $1', [uid]).catch(() => {});
                await pool.query('delete from users where userid = $1', [uid]).catch(() => {});
            }
        }
    } catch {
        // best-effort cleanup
    }
}

test('case get-by-id returns 403 for wrong owner (and 200 for owner)', async () => {
    resetStore();
    const app = require('../app');

    const user1 = await createUser({ role: 'User' });
    const user2 = await createUser({ role: 'User' });
    const caseTypeId = await createCaseType();
    const caseId = await createCase({ userId: user1, caseTypeId });

    try {
        const resForbidden = await request(app)
            .get(`/api/Cases/GetCase/${caseId}`)
            .set('Authorization', `Bearer ${makeToken({ userid: user2, role: 'User' })}`);

        assert.equal(resForbidden.status, 403);

        const resOk = await request(app)
            .get(`/api/Cases/GetCase/${caseId}`)
            .set('Authorization', `Bearer ${makeToken({ userid: user1, role: 'User' })}`);

        assert.equal(resOk.status, 200);
        assert.equal(resOk.body?.CaseId, caseId);
    } finally {
        await cleanup({ caseId, caseTypeId, userIds: [user1, user2] });
    }
});

test('caseType get-by-id returns 403 for users without matching cases', async () => {
    resetStore();
    const app = require('../app');

    const user1 = await createUser({ role: 'User' });
    const user2 = await createUser({ role: 'User' });
    const caseTypeId = await createCaseType();
    const caseId = await createCase({ userId: user1, caseTypeId });

    try {
        const resForbidden = await request(app)
            .get(`/api/CaseTypes/GetCaseType/${caseTypeId}`)
            .set('Authorization', `Bearer ${makeToken({ userid: user2, role: 'User' })}`);

        assert.equal(resForbidden.status, 403);

        const resOk = await request(app)
            .get(`/api/CaseTypes/GetCaseType/${caseTypeId}`)
            .set('Authorization', `Bearer ${makeToken({ userid: user1, role: 'User' })}`);

        assert.equal(resOk.status, 200);
    } finally {
        await cleanup({ caseId, caseTypeId, userIds: [user1, user2] });
    }
});

test('customer search is admin-only (403 for non-admin)', async () => {
    resetStore();
    const app = require('../app');

    const user = await createUser({ role: 'User' });

    try {
        const res = await request(app)
            .get('/api/Customers/GetCustomerByName?userName=test')
            .set('Authorization', `Bearer ${makeToken({ userid: user, role: 'User' })}`);

        assert.equal(res.status, 403);
    } finally {
        await cleanup({ userIds: [user] });
    }
});

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

const pool = require('../config/db');
const { resetStore } = require('../utils/rateLimiter');

function makeToken({ userid, role }) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

async function createUser({ prefix, role = 'User' }) {
    const email = `${prefix}@example.com`;
    const phone = `050${String(Date.now()).slice(-7)}`;

    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [`${prefix}-user`, email, phone, null, role, `${prefix}-co`]
    );

    return res.rows[0].userid;
}

async function createCaseType({ prefix }) {
    const res = await pool.query(
        `insert into casetypes (casetypename, numberofstages)
         values ($1,$2)
         returning casetypeid`,
        [`${prefix}-casetype`, 2]
    );
    return res.rows[0].casetypeid;
}

async function createCase({ prefix, idx, userId, caseTypeId }) {
    const caseName = `${prefix}-case-${String(idx).padStart(3, '0')}`;

    const res = await pool.query(
        `insert into cases (casename, casetypeid, userid, companyname, currentstage, isclosed, istagged, createdat, updatedat)
         values ($1,$2,$3,$4,$5,$6,$7,now(),now())
         returning caseid`,
        [caseName, caseTypeId, userId, `${prefix}-co`, 1, false, false]
    );

    return res.rows[0].caseid;
}

async function cleanup({ prefix, userId, caseTypeId }) {
    // best-effort cleanup (FK-safe ordering)
    try {
        const caseIds = await pool
            .query('select caseid from cases where casename like $1', [`${prefix}%`])
            .then((r) => r.rows.map((x) => x.caseid))
            .catch(() => []);

        if (caseIds.length > 0) {
            await pool.query('delete from casedescriptions where caseid = any($1::int[])', [caseIds]).catch(() => {});
            await pool.query('delete from cases where caseid = any($1::int[])', [caseIds]).catch(() => {});
        }

        if (caseTypeId) {
            await pool.query('delete from casetypedescriptions where casetypeid = $1', [caseTypeId]).catch(() => {});
            await pool.query('delete from casetypes where casetypeid = $1', [caseTypeId]).catch(() => {});
        }

        if (userId) {
            await pool.query('delete from userdevices where userid = $1', [userId]).catch(() => {});
            await pool.query('delete from otps where userid = $1', [userId]).catch(() => {});
            await pool.query('delete from usernotifications where userid = $1', [userId]).catch(() => {});
            await pool.query('delete from users where userid = $1', [userId]).catch(() => {});
        }
    } catch {
        // ignore cleanup failures
    }
}

function getCaseIds(body) {
    assert.ok(Array.isArray(body));
    for (const row of body) {
        assert.equal(typeof row, 'object');
        assert.ok(Number.isInteger(row.CaseId));
        assert.ok(Array.isArray(row.Descriptions));
    }
    return body.map((row) => row.CaseId);
}

test('cases list pagination contract (integration)', async (t) => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-pagination-cases-${Date.now()}`;

    const userId = await createUser({ prefix, role: 'User' });
    const caseTypeId = await createCaseType({ prefix });

    const createdCaseIds = [];
    try {
        // Seed > N cases.
        for (let i = 0; i < 7; i += 1) {
            createdCaseIds.push(
                await createCase({
                    prefix,
                    idx: i,
                    userId,
                    caseTypeId,
                })
            );
        }

        const sortedCaseIds = [...createdCaseIds].sort((a, b) => a - b);
        const authHeader = `Bearer ${makeToken({ userid: userId, role: 'User' })}`;

        await t.test('default behavior unchanged (no limit/offset)', async () => {
            const res = await request(app)
                .get('/api/Cases/GetCases')
                .set('Authorization', authHeader);

            assert.equal(res.status, 200);

            const returnedIds = getCaseIds(res.body);
            const returnedSet = new Set(returnedIds);

            // Should include the cases we just seeded.
            for (const id of sortedCaseIds) {
                assert.ok(returnedSet.has(id));
            }
        });

        await t.test('limit works (stable ordering by caseId)', async () => {
            const N = 3;
            const res = await request(app)
                .get(`/api/Cases/GetCases?limit=${N}`)
                .set('Authorization', authHeader);

            assert.equal(res.status, 200);
            const returnedIds = getCaseIds(res.body);
            assert.ok(returnedIds.length <= N);
            assert.deepEqual(returnedIds, sortedCaseIds.slice(0, N));
        });

        await t.test('offset works (stable ordering by caseId)', async () => {
            const N = 2;
            const K = 2;
            const res = await request(app)
                .get(`/api/Cases/GetCases?limit=${N}&offset=${K}`)
                .set('Authorization', authHeader);

            assert.equal(res.status, 200);
            const returnedIds = getCaseIds(res.body);
            assert.ok(returnedIds.length <= N);
            assert.deepEqual(returnedIds, sortedCaseIds.slice(K, K + N));
        });

        await t.test('caps + validation (400 on invalid values and > cap)', async () => {
            const tooHigh = await request(app)
                .get('/api/Cases/GetCases?limit=999')
                .set('Authorization', authHeader);
            assert.equal(tooHigh.status, 400);
            assert.equal(typeof tooHigh.body?.message, 'string');
            assert.ok(tooHigh.body.message.length > 0);

            const negativeLimit = await request(app)
                .get('/api/Cases/GetCases?limit=-1')
                .set('Authorization', authHeader);
            assert.equal(negativeLimit.status, 400);
            assert.equal(typeof negativeLimit.body?.message, 'string');

            const negativeOffset = await request(app)
                .get('/api/Cases/GetCases?limit=2&offset=-1')
                .set('Authorization', authHeader);
            assert.equal(negativeOffset.status, 400);
            assert.equal(typeof negativeOffset.body?.message, 'string');

            const nanLimit = await request(app)
                .get('/api/Cases/GetCases?limit=abc')
                .set('Authorization', authHeader);
            assert.equal(nanLimit.status, 400);
            assert.equal(typeof nanLimit.body?.message, 'string');
        });
    } finally {
        await cleanup({ prefix, userId, caseTypeId });
    }
});

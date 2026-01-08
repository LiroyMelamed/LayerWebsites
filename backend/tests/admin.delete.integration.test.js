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

async function cleanupUser(userId) {
    if (!userId) return;
    // Best-effort cleanup. Order matters because of FKs.
    await pool.query('delete from userdevices where userid = $1', [userId]).catch(() => { });
    await pool.query('delete from otps where userid = $1', [userId]).catch(() => { });
    await pool.query('delete from usernotifications where userid = $1', [userId]).catch(() => { });
    await pool.query('delete from signingfiles where lawyerid = $1 or clientid = $1', [userId]).catch(() => { });
    await pool.query('delete from casedescriptions where caseid in (select caseid from cases where userid = $1)', [userId]).catch(() => { });
    await pool.query('delete from cases where userid = $1', [userId]).catch(() => { });
    await pool.query('delete from users where userid = $1', [userId]).catch(() => { });
}

test('delete admin cascades usernotifications (no FK violation)', async () => {
    resetStore();
    const app = require('../app');

    const actingAdminId = await createUser({ role: 'Admin' });
    const targetAdminId = await createUser({ role: 'Admin' });

    try {
        // Create a dependent row that used to block deletion.
        await pool.query(
            `insert into usernotifications (userid, title, message, createdat, isread)
             values ($1, $2, $3, now(), false)`,
            [targetAdminId, 't', 'm']
        );

        const res = await request(app)
            .delete(`/api/Admins/DeleteAdmin/${targetAdminId}`)
            .set('Authorization', `Bearer ${makeToken({ userid: actingAdminId, role: 'Admin' })}`);

        assert.equal(res.status, 200);

        const userRes = await pool.query('select 1 from users where userid = $1', [targetAdminId]);
        assert.equal(userRes.rowCount, 0);

        const notifRes = await pool.query('select 1 from usernotifications where userid = $1', [targetAdminId]);
        assert.equal(notifRes.rowCount, 0);
    } finally {
        await cleanupUser(targetAdminId);
        await cleanupUser(actingAdminId);
    }
});

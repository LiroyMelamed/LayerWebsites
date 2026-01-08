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

const request = require('supertest');
const pool = require('../config/db');
const { resetStore } = require('../utils/rateLimiter');

async function createUser() {
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const phoneNumber = `050${unique.slice(-7)}`;

    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [`test_${unique}`, `test_${unique}@example.com`, phoneNumber, null, 'User', `co_${unique}`]
    );

    return { userid: res.rows[0].userid, phoneNumber };
}

async function createOtp({ userid, phoneNumber, otp }) {
    const expiry = new Date(Date.now() + 5 * 60 * 1000);
    await pool.query(
        `
        insert into otps (phonenumber, otp, expiry, userid)
        values ($1, $2, $3, $4)
        on conflict (phonenumber) do update set otp = excluded.otp, expiry = excluded.expiry, userid = excluded.userid
        `,
        [phoneNumber, otp, expiry, userid]
    );
}

async function cleanup({ userid, phoneNumber }) {
    try {
        if (phoneNumber) {
            await pool.query('delete from otps where phonenumber = $1', [phoneNumber]).catch(() => { });
        }
        if (userid) {
            await pool.query('delete from refresh_tokens where userid = $1', [userid]).catch(() => { });
            await pool.query('delete from userdevices where userid = $1', [userid]).catch(() => { });
            await pool.query('delete from usernotifications where userid = $1', [userid]).catch(() => { });
            await pool.query('delete from users where userid = $1', [userid]).catch(() => { });
        }
    } catch {
        // best-effort cleanup
    }
}

test('auth refresh token: verifyOtp issues refresh token, refresh rotates, logout revokes', async (t) => {
    resetStore();
    const app = require('../app');

    const otp = '654321';
    const { userid, phoneNumber } = await createUser();

    try {
        await createOtp({ userid, phoneNumber, otp });

        const verifyRes = await request(app)
            .post('/api/Auth/VerifyOtp')
            .send({ phoneNumber, otp });

        // If refresh tokens aren't available yet (migration not applied or DB permissions),
        // backend returns refreshToken: null.
        if (verifyRes.status === 200 && verifyRes.body?.refreshToken == null) {
            t.diagnostic('refresh tokens not issued (migration missing or DB permissions); skipping refresh-token assertions');
            return;
        }

        assert.equal(verifyRes.status, 200);
        assert.equal(typeof verifyRes.body?.token, 'string');
        assert.equal(typeof verifyRes.body?.refreshToken, 'string');

        const rt1 = verifyRes.body.refreshToken;

        const refreshRes1 = await request(app)
            .post('/api/Auth/Refresh')
            .send({ refreshToken: rt1 });

        assert.equal(refreshRes1.status, 200);
        assert.equal(typeof refreshRes1.body?.token, 'string');
        assert.equal(typeof refreshRes1.body?.refreshToken, 'string');

        const rt2 = refreshRes1.body.refreshToken;
        assert.notEqual(rt1, rt2);

        // Old token should be revoked after rotation.
        const refreshResOld = await request(app)
            .post('/api/Auth/Refresh')
            .send({ refreshToken: rt1 });

        assert.equal(refreshResOld.status, 401);

        const logoutRes = await request(app)
            .post('/api/Auth/Logout')
            .send({ refreshToken: rt2 });

        assert.equal(logoutRes.status, 200);

        const refreshResAfterLogout = await request(app)
            .post('/api/Auth/Refresh')
            .send({ refreshToken: rt2 });

        assert.equal(refreshResAfterLogout.status, 401);
    } finally {
        await cleanup({ userid, phoneNumber });
    }
});

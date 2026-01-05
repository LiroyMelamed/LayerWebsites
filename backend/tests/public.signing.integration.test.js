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

function makeAuthToken({ userid, role }) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

async function hasColumn({ table, column }) {
    const res = await pool.query(
        `select 1
         from information_schema.columns
         where table_name = $1
           and column_name = $2
         limit 1`,
        [table, column]
    );
    return res.rows.length > 0;
}

async function createUser({ prefix, role }) {
    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [`${prefix}-${role}`, `${prefix}-${role}@example.com`, `050${String(Date.now()).slice(-7)}`, null, role, `${prefix}-co`]
    );
    return res.rows[0].userid;
}

async function createSigningFile({ prefix, lawyerId, clientId }) {
    const res = await pool.query(
        `insert into signingfiles
         (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, expiresat)
         values ($1,$2,$3,$4,$5,$5,'pending',$6,$7)
         returning signingfileid`,
        [
            null,
            lawyerId,
            clientId,
            `${prefix}-doc.pdf`,
            `${prefix}/filekey.pdf`,
            null,
            null,
        ]
    );

    return res.rows[0].signingfileid;
}

async function createSignatureSpot({ signingFileId, signerUserId }) {
    const supportsSignerUserId = await hasColumn({ table: 'signaturespots', column: 'signeruserid' });

    if (supportsSignerUserId) {
        const res = await pool.query(
            `insert into signaturespots
             (signingfileid, pagenumber, x, y, width, height, signername, isrequired, signeruserid)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             returning signaturespotid`,
            [signingFileId, 1, 50, 50, 150, 75, 'חתימה', true, signerUserId]
        );
        return res.rows[0].signaturespotid;
    }

    const res = await pool.query(
        `insert into signaturespots
         (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning signaturespotid`,
        [signingFileId, 1, 50, 50, 150, 75, 'חתימה', true]
    );
    return res.rows[0].signaturespotid;
}

async function cleanup({ signingFileId, userIds }) {
    try {
        if (signingFileId) {
            await pool.query('delete from signaturespots where signingfileid = $1', [signingFileId]).catch(() => { });
            await pool.query('delete from signingfiles where signingfileid = $1', [signingFileId]).catch(() => { });
        }

        if (Array.isArray(userIds)) {
            for (const uid of userIds) {
                await pool.query('delete from userdevices where userid = $1', [uid]).catch(() => { });
                await pool.query('delete from otps where userid = $1', [uid]).catch(() => { });
                await pool.query('delete from usernotifications where userid = $1', [uid]).catch(() => { });
                await pool.query('delete from users where userid = $1', [uid]).catch(() => { });
            }
        }
    } catch {
        // best-effort cleanup
    }
}

test('public signing token allows details + signing without auth header', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-public-signing-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSigningFile({ prefix, lawyerId, clientId });
    const signatureSpotId = await createSignatureSpot({ signingFileId, signerUserId: clientId });

    try {
        const linkRes = await request(app)
            .post(`/api/SigningFiles/${signingFileId}/public-link`)
            .send({ signerUserId: clientId })
            .set('Authorization', `Bearer ${makeAuthToken({ userid: lawyerId, role: 'Admin' })}`);

        assert.equal(linkRes.status, 200);
        assert.equal(typeof linkRes.body?.token, 'string');
        assert.ok(linkRes.body.token.length > 10);

        const token = linkRes.body.token;

        const detailsRes = await request(app)
            .get(`/api/SigningFiles/public/${encodeURIComponent(token)}`);

        assert.equal(detailsRes.status, 200);
        assert.equal(detailsRes.body?.file?.SigningFileId, signingFileId);
        assert.ok(Array.isArray(detailsRes.body?.signatureSpots));

        const signRes = await request(app)
            .post(`/api/SigningFiles/public/${encodeURIComponent(token)}/sign`)
            .send({ signatureSpotId });

        assert.equal(signRes.status, 200);
        assert.equal(signRes.body?.success, true);
    } finally {
        await cleanup({ signingFileId, userIds: [lawyerId, clientId] });
    }
});

test('public signing rejects invalid token', async () => {
    resetStore();
    const app = require('../app');

    const res = await request(app)
        .get('/api/SigningFiles/public/not-a-real-token');

    assert.equal(res.status, 401);
    assert.equal(typeof res.body?.message, 'string');
    assert.ok(res.body.message.length > 0);
});

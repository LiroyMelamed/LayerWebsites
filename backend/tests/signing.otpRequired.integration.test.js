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
const { randomUUID } = require('node:crypto');

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
        [null, lawyerId, clientId, `${prefix}-doc.pdf`, `${prefix}/filekey.pdf`, null, null]
    );

    const signingFileId = res.rows[0].signingfileid;

    // Required by court-ready signing enforcement
    await pool.query(
        `update signingfiles
         set presentedpdfsha256 = $2,
             signingpolicyversion = coalesce(signingpolicyversion, '2026-01-11'),
             requireotp = true
         where signingfileid = $1`,
        [signingFileId, 'a'.repeat(64)]
    );

    return signingFileId;
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

async function insertVerifiedOtpChallenge({ signingFileId, signerUserId, signingSessionId, presentedPdfSha256 }) {
    const challengeId = randomUUID();
    await pool.query(
        `insert into signing_otp_challenges
         (challengeid, signingfileid, signeruserid, signingsessionid, phone_e164, presentedpdfsha256,
          otp_hash, otp_salt, provider_message_id, sent_at_utc, expires_at_utc,
          attempt_count, locked_until_utc, verified_at_utc, verified,
          request_ip, request_user_agent, verify_ip, verify_user_agent)
         values
         ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now() + interval '10 minutes', 0, null, now(), true, null, null, null, null)`,
        [
            challengeId,
            signingFileId,
            signerUserId,
            signingSessionId,
            '+972500000000',
            String(presentedPdfSha256),
            'dummy_hash',
            'dummy_salt',
            null,
        ]
    );
    return challengeId;
}

async function cleanup({ signingFileId, userIds }) {
    try {
        if (signingFileId) {
            await pool.query('delete from signaturespots where signingfileid = $1', [signingFileId]).catch(() => { });
            await pool.query('delete from signing_otp_challenges where signingfileid = $1', [signingFileId]).catch(() => { });
            await pool.query('delete from signing_consents where signingfileid = $1', [signingFileId]).catch(() => { });
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

async function canSelectTable(tableName) {
    // Best-effort capability check: some dev DBs may have tables owned by a different role.
    try {
        await pool.query(`select 1 from ${tableName} limit 1`);
        return true;
    } catch (err) {
        if (String(err?.code || '') === '42501') return false; // insufficient_privilege
        throw err;
    }
}

test('OTP-required signing blocks until OTP verified (public token)', async (t) => {
    resetStore();
    const app = require('../app');

    const otpTableReadable = await canSelectTable('signing_otp_challenges');
    if (!otpTableReadable) {
        t.skip('DB user lacks privileges on signing_otp_challenges; cannot validate OTP-required flow.');
        return;
    }

    const prefix = `e2e-test-otp-required-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSigningFile({ prefix, lawyerId, clientId });
    const signatureSpotId = await createSignatureSpot({ signingFileId, signerUserId: clientId });

    try {
        const signingSessionId = randomUUID();
        const consentVersion = '2026-01-11';

        const linkRes = await request(app)
            .post(`/api/SigningFiles/${signingFileId}/public-link`)
            .send({ signerUserId: clientId })
            .set('Authorization', `Bearer ${makeAuthToken({ userid: lawyerId, role: 'Admin' })}`);

        assert.equal(linkRes.status, 200);
        const token = linkRes.body.token;
        assert.ok(typeof token === 'string' && token.length > 10);

        // Attempt signing without OTP -> blocked
        const signBlocked = await request(app)
            .post(`/api/SigningFiles/public/${encodeURIComponent(token)}/sign`)
            .set('x-signing-session-id', signingSessionId)
            .send({
                signatureSpotId,
                signingSessionId,
                consentAccepted: true,
                consentVersion,
            });

        assert.equal(signBlocked.status, 403);
            assert.equal(signBlocked.body?.errorCode, 'OTP_REQUIRED');

        // Insert a verified OTP challenge bound to (file, session, presented hash)
        await insertVerifiedOtpChallenge({
            signingFileId,
            signerUserId: clientId,
            signingSessionId,
            presentedPdfSha256: 'a'.repeat(64),
        });

        const signOk = await request(app)
            .post(`/api/SigningFiles/public/${encodeURIComponent(token)}/sign`)
            .set('x-signing-session-id', signingSessionId)
            .send({
                signatureSpotId,
                signingSessionId,
                consentAccepted: true,
                consentVersion,
            });

        assert.equal(signOk.status, 200);
        assert.equal(signOk.body?.success, true);
    } finally {
        await cleanup({ signingFileId, userIds: [lawyerId, clientId] });
    }
});

test('Signing requires explicit consent (public token)', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-consent-required-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSigningFile({ prefix, lawyerId, clientId });
    const signatureSpotId = await createSignatureSpot({ signingFileId, signerUserId: clientId });

    try {
        const signingSessionId = randomUUID();

        const linkRes = await request(app)
            .post(`/api/SigningFiles/${signingFileId}/public-link`)
            .send({ signerUserId: clientId })
            .set('Authorization', `Bearer ${makeAuthToken({ userid: lawyerId, role: 'Admin' })}`);

        assert.equal(linkRes.status, 200);
        const token = linkRes.body.token;

        const signBlocked = await request(app)
            .post(`/api/SigningFiles/public/${encodeURIComponent(token)}/sign`)
            .set('x-signing-session-id', signingSessionId)
            .send({
                signatureSpotId,
                signingSessionId,
                consentAccepted: false,
                consentVersion: '2026-01-11',
            });

        assert.equal(signBlocked.status, 403);
            assert.equal(signBlocked.body?.errorCode, 'CONSENT_REQUIRED');
    } finally {
        await cleanup({ signingFileId, userIds: [lawyerId, clientId] });
    }
});

test('OTP waiver requires explicit acknowledgement (lawyer policy update)', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-otp-waiver-ack-required-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSigningFile({ prefix, lawyerId, clientId });

    try {
        const res = await request(app)
            .patch(`/api/SigningFiles/${signingFileId}/policy`)
            .send({ requireOtp: false })
            .set('Authorization', `Bearer ${makeAuthToken({ userid: lawyerId, role: 'Admin' })}`);

        assert.equal(res.status, 422);
        assert.equal(res.body?.errorCode, 'OTP_WAIVER_ACK_REQUIRED');
    } finally {
        await cleanup({ signingFileId, userIds: [lawyerId, clientId] });
    }
});

test('OTP waived policy allows public signing without OTP (with consent)', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-otp-waived-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSigningFile({ prefix, lawyerId, clientId });
    const signatureSpotId = await createSignatureSpot({ signingFileId, signerUserId: clientId });

    try {
        const policyRes = await request(app)
            .patch(`/api/SigningFiles/${signingFileId}/policy`)
            .send({ requireOtp: false, otpWaiverAcknowledged: true })
            .set('Authorization', `Bearer ${makeAuthToken({ userid: lawyerId, role: 'Admin' })}`);

        assert.equal(policyRes.status, 200);
        assert.equal(policyRes.body?.success, true);

        const linkRes = await request(app)
            .post(`/api/SigningFiles/${signingFileId}/public-link`)
            .send({ signerUserId: clientId })
            .set('Authorization', `Bearer ${makeAuthToken({ userid: lawyerId, role: 'Admin' })}`);

        assert.equal(linkRes.status, 200);
        const token = linkRes.body.token;
        assert.ok(typeof token === 'string' && token.length > 10);

        const signingSessionId = randomUUID();
        const signRes = await request(app)
            .post(`/api/SigningFiles/public/${encodeURIComponent(token)}/sign`)
            .set('x-signing-session-id', signingSessionId)
            .send({
                signatureSpotId,
                signingSessionId,
                consentAccepted: true,
                consentVersion: '2026-01-11',
            });

        assert.equal(signRes.status, 200);
        assert.equal(signRes.body?.success, true);
    } finally {
        await cleanup({ signingFileId, userIds: [lawyerId, clientId] });
    }
});

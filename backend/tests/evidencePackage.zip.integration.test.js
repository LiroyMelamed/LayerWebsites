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
const { randomUUID } = require('node:crypto');

const AdmZip = require('adm-zip');

function makeToken({ userid, role }) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
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

async function createSignedSigningFile({ prefix, lawyerId, clientId, requireOtp }) {
    const res = await pool.query(
        `insert into signingfiles
         (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, expiresat,
          requireotp, signingpolicyversion, otpwaiveracknowledged, otpwaiveracknowledgedatutc, otpwaiveracknowledgedbyuserid,
          presentedpdfsha256, signedat, immutableatutc, signedfilekey)
         values ($1,$2,$3,$4,$5,$5,'signed',$6,$7,
          $8,$9,$10,now(),$11,
          $12, now(), now(), $13)
         returning signingfileid`,
        [
            null,
            lawyerId,
            clientId,
            `${prefix}-signed.pdf`,
            `${prefix}/filekey.pdf`,
            null,
            null,
            Boolean(requireOtp),
            '2026-01-11',
            requireOtp ? false : true,
            requireOtp ? null : lawyerId,
            'a'.repeat(64),
            `${prefix}/signed.pdf`,
        ]
    );

    return res.rows[0].signingfileid;
}

async function createSignatureSpot({ signingFileId, signerUserId }) {
    const res = await pool.query(
        `insert into signaturespots
         (signingfileid, pagenumber, x, y, width, height, signername, isrequired, signeruserid,
          issigned, signedat, signatureimagesha256, signerip, signeruseragent, signingsessionid)
         values ($1,1,50,50,150,75,'חתימה',true,$2,true,now(),$3,$4,$5,$6)
         returning signaturespotid`,
        [
            signingFileId,
            signerUserId,
            'b'.repeat(64),
            '127.0.0.1',
            'test-agent',
            '11111111-1111-4111-8111-111111111111',
        ]
    );
    return res.rows[0].signaturespotid;
}

async function createConsent({ signingFileId, signerUserId }) {
    const consentId = randomUUID();
    await pool.query(
        `insert into signing_consents
         (consentid, signingfileid, signeruserid, signingsessionid, consentversion, consenttextsha256, acceptedatutc, ip, user_agent)
         values ($1, $2, $3, $4, $5, $6, now(), $7, $8)`,
        [
            consentId,
            signingFileId,
            signerUserId,
            '11111111-1111-4111-8111-111111111111',
            '2026-01-11',
            'c'.repeat(64),
            '127.0.0.1',
            'test-agent',
        ]
    );
}

async function cleanup({ signingFileId, userIds }) {
    try {
        if (signingFileId) {
            await pool.query('delete from audit_events where signingfileid = $1', [signingFileId]).catch(() => { });
            await pool.query('delete from signing_otp_challenges where signingfileid = $1', [signingFileId]).catch(() => { });
            await pool.query('delete from signing_consents where signingfileid = $1', [signingFileId]).catch(() => { });
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

test('evidence-package ZIP (lawyer/admin) includes manifest.json + signed.pdf at minimum', async () => {
    resetStore();
    const app = require('../app');

    const prefix = `e2e-test-evidence-zip-${Date.now()}`;

    const lawyerId = await createUser({ prefix, role: 'Admin' });
    const clientId = await createUser({ prefix, role: 'User' });

    const signingFileId = await createSignedSigningFile({ prefix, lawyerId, clientId, requireOtp: false });

    try {
        await createSignatureSpot({ signingFileId, signerUserId: clientId });
        await createConsent({ signingFileId, signerUserId: clientId });

        const res = await request(app)
            .get(`/api/SigningFiles/${signingFileId}/evidence-package`)
            .set('Authorization', `Bearer ${makeToken({ userid: lawyerId, role: 'Admin' })}`)
            .buffer(true)
            .parse((response, callback) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => callback(null, Buffer.concat(chunks)));
            });

        assert.equal(res.status, 200);
        assert.match(String(res.headers['content-type'] || ''), /application\/zip/i);

        assert.ok(Buffer.isBuffer(res.body));
        assert.ok(res.body.length > 0);

        const zip = new AdmZip(res.body);
        const entries = zip.getEntries().map((e) => e.entryName);

        assert.ok(entries.includes('manifest.json'));
        assert.ok(entries.includes('signed.pdf'));
        assert.ok(entries.includes('audit_events.json'));
        assert.ok(entries.includes('consent.json'));

        const manifestText = zip.readAsText('manifest.json');
        const manifest = JSON.parse(manifestText);
        assert.equal(manifest.signingFileId, signingFileId);
        assert.equal(manifest.policy?.requireOtp, false);
    } finally {
        await cleanup({ signingFileId, userIds: [lawyerId, clientId] });
    }
});

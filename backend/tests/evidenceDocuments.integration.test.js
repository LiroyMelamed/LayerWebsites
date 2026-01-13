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

function makeToken({ userid = 1, role = 'Admin' } = {}) {
    return jwt.sign({ userid, role, phoneNumber: '0000000000' }, process.env.JWT_SECRET, {
        expiresIn: '1h',
    });
}

async function ensureCaseTypeId() {
    const existing = await pool.query('select casetypeid from casetypes order by casetypeid asc limit 1');
    const id = existing.rows?.[0]?.casetypeid;
    if (Number.isInteger(id)) return id;

    const name = `Test CaseType ${randomUUID()}`;
    const res = await pool.query(
        `insert into casetypes (casetypename, numberofstages)
         values ($1, $2)
         returning casetypeid`,
        [name, 1]
    );
    return Number(res.rows[0].casetypeid);
}

async function insertUser({ name, email, phone, role }) {
    const res = await pool.query(
        `insert into users (name, email, phonenumber, passwordhash, role, companyname, createdat)
         values ($1,$2,$3,$4,$5,$6,now())
         returning userid`,
        [name, email, phone, null, role, null]
    );
    return Number(res.rows[0].userid);
}

async function insertCase({ caseName, caseTypeId, userId }) {
    const res = await pool.query(
        `insert into cases (
            casename, casetypeid, userid, companyname, currentstage,
            isclosed, istagged, whatsappgrouplink, createdat, updatedat,
            casemanager, casemanagerid, estimatedcompletiondate, licenseexpirydate
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),$9,$10,$11,$12)
         returning caseid`,
        [
            caseName,
            caseTypeId,
            userId,
            'TestCo',
            1,
            false,
            false,
            null,
            null,
            null,
            null,
            null,
        ]
    );
    return Number(res.rows[0].caseid);
}

async function insertSignedSigningFile({ caseId, lawyerId, clientId, filename, otpWaivedByUserId }) {
    const fileKey = `file_${randomUUID()}`;
    const originalFileKey = `orig_${randomUUID()}`;
    const signedFileKey = `signed_${randomUUID()}`;

    const res = await pool.query(
        `insert into signingfiles (
            caseid, lawyerid, clientid,
            filename, filekey, originalfilekey,
            status, createdat,
            signedfilekey, signedat,
            requireotp,
            otpwaiveracknowledged, otpwaiveracknowledgedatutc, otpwaiveracknowledgedbyuserid
         ) values ($1,$2,$3,$4,$5,$6,$7,now(),$8,now(),$9,$10,now(),$11)
         returning signingfileid`,
        [
            caseId,
            lawyerId,
            clientId,
            filename,
            fileKey,
            originalFileKey,
            'signed',
            signedFileKey,
            true,
            true,
            otpWaivedByUserId,
        ]
    );
    return Number(res.rows[0].signingfileid);
}

test('admin can list evidence documents and q matches filename', async () => {
    resetStore();
    delete require.cache[require.resolve('../app')];
    const app = require('../app');

    const runTag = `edoc_${randomUUID()}`;
    const caseTypeId = await ensureCaseTypeId();

    const lawyerName = `Evidence Lawyer ${runTag}`;
    const lawyerId = await insertUser({
        name: lawyerName,
        email: `lawyer_${runTag}@example.com`,
        phone: `050${String(Date.now()).slice(-7)}`,
        role: 'Lawyer',
    });
    const clientName = `Evidence Client ${runTag}`;
    const clientId = await insertUser({
        name: clientName,
        email: `client_${runTag}@example.com`,
        phone: `052${String(Date.now() + 1).slice(-7)}`,
        role: 'User',
    });

    const caseName = `תיק בדיקה ${runTag}`;
    const caseId = await insertCase({ caseName, caseTypeId, userId: clientId });

    const filename = `evidence_${runTag}.pdf`;
    const signingFileId = await insertSignedSigningFile({
        caseId,
        lawyerId,
        clientId,
        filename,
        otpWaivedByUserId: lawyerId,
    });

    const res = await request(app)
        .get(`/api/evidence-documents?q=${encodeURIComponent(runTag)}&limit=50`)
        .set('Authorization', `Bearer ${makeToken({ userid: 9999, role: 'Admin' })}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body?.items));

    const found = res.body.items.find((x) => x.signingFileId === signingFileId);
    assert.ok(found, 'expected inserted signed document to be returned');

    assert.equal(found.caseId, caseId);
    assert.equal(found.evidenceZipAvailable, true);
    assert.equal(found.documentDisplayName, filename);
    assert.ok(typeof found.signedAtUtc === 'string' && found.signedAtUtc.includes('T'));
    assert.ok(typeof found.caseDisplayName === 'string' && found.caseDisplayName.includes(String(caseId)));
    assert.ok(typeof found.clientDisplayName === 'string' && found.clientDisplayName.includes(clientName));
    assert.equal(found.otpPolicy?.requireOtp, true);
    assert.equal(found.otpPolicy?.waivedBy, lawyerName);
    assert.ok(typeof found.otpPolicy?.waivedAtUtc === 'string' && found.otpPolicy.waivedAtUtc.includes('T'));
});

test('lawyer only sees evidence documents for their own signingfiles', async () => {
    resetStore();
    delete require.cache[require.resolve('../app')];
    const app = require('../app');

    const runTag = `edoc_${randomUUID()}`;
    const caseTypeId = await ensureCaseTypeId();

    const lawyer1Id = await insertUser({
        name: `Evidence Lawyer1 ${runTag}`,
        email: `lawyer1_${runTag}@example.com`,
        phone: `050${String(Date.now()).slice(-7)}`,
        role: 'Lawyer',
    });
    const lawyer2Id = await insertUser({
        name: `Evidence Lawyer2 ${runTag}`,
        email: `lawyer2_${runTag}@example.com`,
        phone: `051${String(Date.now() + 1).slice(-7)}`,
        role: 'Lawyer',
    });
    const clientId = await insertUser({
        name: `Evidence Client ${runTag}`,
        email: `client_${runTag}@example.com`,
        phone: `052${String(Date.now() + 2).slice(-7)}`,
        role: 'User',
    });

    const case1Id = await insertCase({ caseName: `Case1 ${runTag}`, caseTypeId, userId: clientId });
    const case2Id = await insertCase({ caseName: `Case2 ${runTag}`, caseTypeId, userId: clientId });

    const visibleSigningFileId = await insertSignedSigningFile({
        caseId: case1Id,
        lawyerId: lawyer1Id,
        clientId,
        filename: `visible_${runTag}.pdf`,
        otpWaivedByUserId: lawyer1Id,
    });
    const hiddenSigningFileId = await insertSignedSigningFile({
        caseId: case2Id,
        lawyerId: lawyer2Id,
        clientId,
        filename: `hidden_${runTag}.pdf`,
        otpWaivedByUserId: lawyer2Id,
    });

    const res = await request(app)
        .get(`/api/evidence-documents?q=${encodeURIComponent(runTag)}&limit=100`)
        .set('Authorization', `Bearer ${makeToken({ userid: lawyer1Id, role: 'Lawyer' })}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body?.items));

    const ids = res.body.items.map((x) => x.signingFileId);
    assert.ok(ids.includes(visibleSigningFileId), 'expected own signed document to be visible');
    assert.ok(!ids.includes(hiddenSigningFileId), 'expected other lawyer signed document to be hidden');
});

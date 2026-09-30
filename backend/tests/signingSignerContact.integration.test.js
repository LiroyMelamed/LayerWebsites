const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hasSigningContactOverride } = require('../lib/signingSignerContact');

test('legacy contact comparisons accept formatting changes but reject identity changes and clearing', () => {
    const customer = { Email: 'signer@example.invalid', Phone: '0501234567' };
    assert.equal(hasSigningContactOverride({}, customer), false);
    assert.equal(hasSigningContactOverride({ email: ' SIGNER@example.invalid ', phone: '+972-50-123-4567' }, customer), false);
    for (const input of [{ email: 'other@example.invalid' }, { phone: '0507654321' }, { email: null }, { phone: '' }]) {
        assert.equal(hasSigningContactOverride(input, customer), true);
    }
});

test('signing APIs preserve customer contacts and reject mismatched recipients before any mutation', {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 30000,
}, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439');
    assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
    process.env.SIGNING_ENABLED = 'true';
    process.env.JWT_SECRET = 'synthetic-contact-qa-only';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9';
    process.env.S3_KEY = 'synthetic-qa';
    process.env.S3_SECRET = 'synthetic-qa';
    process.env.S3_BUCKET = 'qa';
    const pool = require('../config/db');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const notifications = require('../services/notifications/notificationOrchestrator');
    const originalNotify = notifications.notifyRecipient;
    notifications.notifyRecipient = async () => { assert.fail('Contact changes must never send notifications'); };
    const { r2 } = require('../utils/r2');
    const originalSend = r2.send;
    r2.send = async () => { assert.fail('Mismatched recipients must be rejected before storage access'); };
    t.after(() => { notifications.notifyRecipient = originalNotify; r2.send = originalSend; });
    const app = require('../app');
    const auth = `Bearer ${jwt.sign({ userid: 1017, role: 'Admin' }, process.env.JWT_SECRET)}`;
    const marker = crypto.randomUUID();
    const ids = [];
    let fileId;
    t.after(async () => {
        if (fileId) await pool.query('DELETE FROM signingfiles WHERE signingfileid=$1', [fileId]);
        await pool.query('DELETE FROM users WHERE userid=ANY($1::int[])', [ids]);
        await pool.end();
    });
    const fixtureBaseId = crypto.randomInt(10000000, 1900000000);
    for (let i = 0; i < 2; i++) {
        // Restored QA fixtures can have explicit IDs above the database sequence.
        const result = await pool.query(`INSERT INTO users(userid,name,email,phonenumber,role)
            VALUES ($1,$2,$3,$4,'User') RETURNING userid`, [fixtureBaseId + i, `Synthetic contact QA ${marker} ${i}`, `contact-${marker}-${i}@example.invalid`, `050999991${i}`]);
        ids.push(result.rows[0].userid);
    }
    const snapshot = async () => (await pool.query('SELECT userid,name,email,phonenumber,role FROM users WHERE userid=ANY($1::int[]) ORDER BY userid', [ids])).rows;
    const before = await snapshot();
    const file = await pool.query(`INSERT INTO signingfiles(lawyerid,clientid,filename,filekey,status)
        VALUES (1017,$1,'Synthetic contact QA - no legal validity','qa/no-real-document.pdf','pending') RETURNING signingfileid`, [ids[0]]);
    fileId = file.rows[0].signingfileid;
    await pool.query('INSERT INTO signaturespots(signingfileid,signeruserid,isrequired) VALUES ($1,$2,true)', [fileId, ids[0]]);
    const patch = (body, signer = ids[0]) => request(app).patch(`/api/SigningFiles/${fileId}/signers/${signer}`).set('Authorization', auth).send(body);
    for (const body of [
        { email: before[1].email }, { phone: before[1].phonenumber }, { email: null },
        { replaceWithUserId: ids[1], email: before[0].email, deliveryMethod: 'email' },
    ]) {
        const result = await patch(body);
        assert.equal(result.status, 409, JSON.stringify(result.body));
        assert.deepEqual(await snapshot(), before);
        const spots = await pool.query('SELECT signeruserid FROM signaturespots WHERE signingfileid=$1', [fileId]);
        assert.equal(spots.rows[0].signeruserid, ids[0], 'Rejected replacement must leave the assigned signer intact');
        const delivery = await pool.query('SELECT * FROM signing_signer_delivery WHERE signing_file_id=$1', [fileId]);
        assert.equal(delivery.rows.length, 0, 'Rejected edit must not change delivery');
    }
    const unchanged = await patch({ email: before[0].email.toUpperCase(), phone: '+972509999910', deliveryMethod: 'email' });
    assert.equal(unchanged.status, 200, JSON.stringify(unchanged.body));
    const replace = await patch({ replaceWithUserId: ids[1], deliveryMethod: 'phone' });
    assert.equal(replace.status, 200, JSON.stringify(replace.body));
    assert.equal(replace.body.signerUserId, ids[1]);
    assert.equal(replace.body.signer.Email, before[1].email);
    assert.equal(replace.body.deliveryMethod, 'phone');
    assert.deepEqual(await snapshot(), before, 'Allowed changes must not modify either customer');
    for (const signer of [
        { userId: ids[0], email: before[1].email },
        { userId: ids[0], phone: before[1].phonenumber },
        { email: before[0].email, phone: before[1].phonenumber },
    ]) {
        const upload = await request(app).post('/api/SigningFiles/upload').set('Authorization', auth).send({
            fileName: 'Synthetic contact QA.pdf', fileKey: 'users/1017/qa.pdf', signers: [signer], signatureLocations: [],
        });
        assert.equal(upload.status, 409, JSON.stringify(upload.body));
        assert.deepEqual(await snapshot(), before);
    }
});

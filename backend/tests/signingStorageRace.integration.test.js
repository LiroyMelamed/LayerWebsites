const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Opt-in, isolated PostgreSQL plus in-memory object storage. Never uses R2.
test('a rejected concurrent signature cannot overwrite the accepted signature image', {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 20000,
}, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439');
    assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
    process.env.SIGNING_ENABLED = 'true';
    process.env.SIGNING_CLIENT_OTP_REQUIRED = 'false';
    process.env.JWT_SECRET = 'synthetic-signature-qa-only';
    const pool = require('../config/db');
    const { r2 } = require('../utils/r2');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const token = (userid) => jwt.sign({ userid, role: 'Lawyer' }, process.env.JWT_SECRET);
    const images = [Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')];
    images.push(Buffer.concat([images[0], Buffer.from('synthetic-second-image')]));
    const { rows: files } = await pool.query(`INSERT INTO signingfiles
        (lawyerid,clientid,filename,filekey,status,requireotp,otpwaiveracknowledged,presentedpdfsha256,signingorder)
        VALUES (1017,1088,'Synthetic QA — no legal validity','qa/no-real-document.pdf','pending',false,true,$1,'parallel')
        RETURNING signingfileid`, ['a'.repeat(64)]);
    const fileId = files[0].signingfileid;
    t.after(async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SET LOCAL app.audit_events_allow_delete = 'true'");
            await client.query('DELETE FROM audit_events WHERE signingfileid=$1', [fileId]);
            await client.query('DELETE FROM signingfiles WHERE signingfileid=$1', [fileId]);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    });
    const { rows: spots } = await pool.query(`INSERT INTO signaturespots(signingfileid,signeruserid,isrequired)
        VALUES ($1,1088,true),($1,1092,true) RETURNING signaturespotid`, [fileId]);
    const spotId = spots[0].signaturespotid;
    const objects = new Map();
    let uploads = 0;
    let secondEntered;
    const secondReady = new Promise((resolve) => { secondEntered = resolve; });
    const originalSend = r2.send;
    t.after(() => { r2.send = originalSend; });
    r2.send = async (command) => {
        if (command.constructor.name === 'DeleteObjectCommand') {
            objects.delete(command.input.Key);
            return {};
        }
        assert.equal(command.constructor.name, 'PutObjectCommand');
        uploads++;
        if (uploads === 1) {
            await Promise.race([secondReady, new Promise((_, reject) => setTimeout(() => reject(new Error('Second upload did not arrive')), 5000).unref())]);
        } else {
            secondEntered();
            const deadline = Date.now() + 5000;
            let signed = false;
            while (Date.now() < deadline) {
                const { rows } = await pool.query('SELECT issigned FROM signaturespots WHERE signaturespotid=$1', [spotId]);
                if (rows[0].issigned) { signed = true; break; }
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.ok(signed, 'First request must have committed before second storage write');
        }
        objects.set(command.input.Key, Buffer.from(command.input.Body));
        return { ETag: 'synthetic-etag' };
    };
    const app = require('../app');
    const body = (image) => ({ signatureSpotId: spotId, signatureImage: 'data:image/png;base64,' + image.toString('base64'),
        signingSessionId: crypto.randomUUID(), consentAccepted: true, consentVersion: '2026-01-11' });
    const outsider = await request(app).post(`/api/SigningFiles/${fileId}/sign`).set('Authorization', `Bearer ${token(1091)}`).send(body(images[0]));
    assert.equal(outsider.status, 403);
    assert.equal(uploads, 0);
    const responses = await Promise.all(images.map((image) => request(app).post(`/api/SigningFiles/${fileId}/sign`)
        .set('Authorization', `Bearer ${token(1088)}`).send(body(image))));
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409], JSON.stringify(responses.map((r) => r.body)));
    const { rows } = await pool.query('SELECT signaturedata, signatureimagesha256 FROM signaturespots WHERE signaturespotid=$1', [spotId]);
    const stored = objects.get(rows[0].signaturedata);
    assert.ok(stored);
    assert.equal(crypto.createHash('sha256').update(stored).digest('hex'), rows[0].signatureimagesha256,
        'Stored image must still match the accepted signature evidence hash');
    assert.equal(objects.size, 1, 'The rejected upload is removed without deleting the accepted image');
    const repeat = await request(app).post(`/api/SigningFiles/${fileId}/sign`)
        .set('Authorization', `Bearer ${token(1088)}`).send(body(images[1]));
    assert.equal(repeat.status, 409);
    assert.equal(uploads, 2, 'A sequential retry must not upload another image');
});

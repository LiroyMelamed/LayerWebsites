const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

test('OTP and two-signer PDF lifecycle preserves both images after a partial preview', {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 30000,
}, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439');
    assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
    process.env.SIGNING_ENABLED = 'true';
    process.env.SIGNING_CLIENT_OTP_REQUIRED = 'true';
    process.env.SIGNING_OTP_ENABLED = 'true';
    process.env.SIGNING_OTP_PEPPER = 'synthetic-signing-otp-only';
    process.env.JWT_SECRET = 'synthetic-pdf-qa-only';
    process.env.WEBSITE_DOMAIN = 'qa.example.invalid';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9';
    process.env.S3_KEY = 'synthetic-qa';
    process.env.S3_SECRET = 'synthetic-qa';
    process.env.S3_BUCKET = 'qa';
    const pool = require('../config/db');
    const { r2 } = require('../utils/r2');
    const { PDFDocument, PDFName } = require('pdf-lib');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const token = (userid, role = 'Client') => jwt.sign({ userid, role }, process.env.JWT_SECRET);
    const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawText('SYNTHETIC QA - NO LEGAL VALIDITY', { x: 40, y: 790, size: 15 });
    const unsigned = Buffer.from(await pdf.save());
    const key = `users/1017/qa-${crypto.randomUUID()}.pdf`;
    const objects = new Map([[key, { bytes: unsigned, type: 'application/pdf' }]]);
    const originalSend = r2.send;
    t.after(() => { r2.send = originalSend; });
    r2.send = async (command) => {
        const { Key, Body, ContentType } = command.input;
        if (command.constructor.name === 'PutObjectCommand') {
            objects.set(Key, { bytes: Buffer.from(Body), type: ContentType });
            return { ETag: hash(Buffer.from(Body)) };
        }
        if (command.constructor.name === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
        const object = objects.get(Key);
        assert.ok(object, 'The requested synthetic storage object must exist');
        if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: object.bytes.length, ContentType: object.type, ETag: hash(object.bytes) };
        assert.equal(command.constructor.name, 'GetObjectCommand');
        return { Body: Readable.from(object.bytes), ContentType: object.type, ETag: hash(object.bytes) };
    };
    // External boundaries only: no email/SMS/push or browser-rendered evidence certificate.
    const notifications = require('../services/notifications/notificationOrchestrator');
    const messages = require('../utils/sendMessage');
    const originalMessage = messages.sendMessage;
    const otpMessages = [];
    messages.sendMessage = async (message) => { otpMessages.push(message); return { ok: true }; };
    t.after(() => { messages.sendMessage = originalMessage; });
    const originalNotify = notifications.notifyRecipient;
    const delivered = [];
    notifications.notifyRecipient = async (payload) => {
        delivered.push(payload);
        return { ok: true, outcomes: { sms: { attempted: true, ok: true }, email: { attempted: true, ok: true } } };
    };
    const evidence = require('../lib/renderEvidencePdf');
    const originalRender = evidence.renderEvidencePdf;
    evidence.renderEvidencePdf = async () => unsigned;
    t.after(() => { notifications.notifyRecipient = originalNotify; evidence.renderEvidencePdf = originalRender; });
    const app = require('../app');
    let fileId;
    t.after(async () => {
        if (!fileId) return;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SET LOCAL app.audit_events_allow_delete = 'true'");
            await client.query('DELETE FROM audit_events WHERE signingfileid=$1', [fileId]);
            await client.query('DELETE FROM signingfiles WHERE signingfileid=$1', [fileId]);
            const slugs = delivered.flatMap((item) => Object.values(item.email?.contactFields || {}))
                .filter((value) => typeof value === 'string' && value.startsWith('https://qa.example.invalid/s/'))
                .map((value) => new URL(value).pathname.split('/').at(-1));
            await client.query('DELETE FROM signing_short_links WHERE slug = ANY($1::text[])', [slugs]);
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    });
    const upload = await request(app).post('/api/SigningFiles/upload')
        .set('Authorization', `Bearer ${token(1017, 'Admin')}`).send({
            fileName: 'Synthetic QA - no legal validity.pdf', fileKey: key,
            signers: [{ userId: 1088, name: 'Synthetic A', deliveryMethod: 'email' }, { userId: 1092, name: 'Synthetic B', deliveryMethod: 'email' }],
            signatureLocations: [1088, 1092].map((id, index) => ({ pageNum: 1, x: 80 + index * 260, y: 350,
                width: 180, height: 75, signerUserId: id, signerIndex: index, fieldType: 'signature', isRequired: true })),
            requireOtp: true,
        });
    fileId = upload.body.signingFileId;
    assert.equal(upload.status, 200, JSON.stringify(upload.body));
    assert.ok(fileId);
    const { rows: spots } = await pool.query('SELECT signaturespotid,signeruserid FROM signaturespots WHERE signingfileid=$1 ORDER BY signerindex', [fileId]);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const sign = async (spot, publicFlow = false) => {
        const signingSessionId = crypto.randomUUID();
        const auth = `Bearer ${token(spot.signeruserid)}`;
        let base = `/api/SigningFiles/${fileId}`;
        if (publicFlow) {
            const invite = delivered.find((item) => item.notificationType === 'SIGN_INVITE' && item.recipientUserId === spot.signeruserid);
            const slug = new URL(invite.email.contactFields.action_url).pathname.split('/').at(-1);
            const resolved = await request(app).get(`/api/SigningFiles/public/short/${slug}`);
            assert.equal(resolved.status, 200);
            assert.equal(resolved.body.purpose, 'sign');
            base = `/api/SigningFiles/public/${resolved.body.token}`;
            assert.equal((await request(app).get(base)).status, 200);
        }
        const post = (suffix, payload) => {
            const call = request(app).post(base + suffix);
            if (!publicFlow) call.set('Authorization', auth);
            return call.send(payload);
        };
        const body = { signatureSpotId: spot.signaturespotid, signatureImage: png, signingSessionId,
            consentAccepted: true, consentVersion: '2026-01-11' };
        const blocked = await post('/sign', body);
        assert.equal(blocked.status, 403);
        assert.equal(blocked.body.errorCode, 'OTP_REQUIRED');
        const beforeCount = otpMessages.length;
        const otpRequest = await post('/otp/request', { signingSessionId });
        assert.equal(otpRequest.status, 200, JSON.stringify(otpRequest.body));
        assert.equal(otpMessages.length, beforeCount + 1);
        const reused = await post('/otp/request', { signingSessionId });
        assert.equal(reused.body.reused, true);
        assert.equal(otpMessages.length, beforeCount + 1, 'Repeated request reuses the challenge without another provider message');
        const otp = otpMessages.at(-1).match(/\b\d{6}\b/)[0];
        const wrongOtp = String((Number(otp) + 1) % 1000000).padStart(6, '0');
        const wrong = await post('/otp/verify', { signingSessionId, otp: wrongOtp });
        assert.equal(wrong.body.verified, false);
        const verified = await post('/otp/verify', { signingSessionId, otp });
        assert.equal(verified.body.verified, true);
        return post('/sign', body);
    };
    const first = await sign(spots[0]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const preview = await request(app).get(`/api/SigningFiles/${fileId}/download`).set('Authorization', `Bearer ${token(1088)}`);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const second = await sign(spots[1], true);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const deadline = Date.now() + 10000;
    while (delivered.filter((item) => item.notificationType === 'DOC_SIGNED').length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(delivered.filter((item) => item.notificationType === 'DOC_SIGNED').length, 2, 'Finalization reached both mocked notification boundaries');
    const { rows: files } = await pool.query('SELECT status,signedstoragekey,signedpdfsha256,presentedpdfsha256 FROM signingfiles WHERE signingfileid=$1', [fileId]);
    assert.equal(files[0].status, 'signed');
    assert.equal(files[0].presentedpdfsha256, hash(unsigned));
    const signed = objects.get(files[0].signedstoragekey)?.bytes;
    assert.ok(signed, 'Final PDF persisted to simulated object storage');
    assert.equal(hash(signed), files[0].signedpdfsha256);
    const signedDoc = await PDFDocument.load(signed);
    assert.equal(signedDoc.getPageCount(), 1);
    const images = signedDoc.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
    assert.ok(images.keys().length >= 2, 'Final PDF must contain both signatures after a partial preview');
    const forbidden = await request(app).get(`/api/SigningFiles/${fileId}/download`).set('Authorization', `Bearer ${token(1091)}`);
    assert.equal(forbidden.status, 403);
    const download = await request(app).get(`/api/SigningFiles/${fileId}/download`).set('Authorization', `Bearer ${token(1092)}`);
    assert.equal(download.status, 200);
    assert.ok(download.body.downloadUrl);
});

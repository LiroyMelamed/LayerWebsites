const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

// Run legacy variants in separate Node processes: the Express controllers capture
// provider exports when loaded, so reusing their module cache would reuse mocks.
const legacyPreview = process.env.LEGAL_LEGACY_PREVIEW || null;
assert.ok([null, 'null-marker', 'old-marker'].includes(legacyPreview));
test(`OTP and two-signer PDF lifecycle preserves both images after a partial preview (${legacyPreview || 'current'})`, {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 60000,
}, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, process.env.CANDIDATE_DB_PORT); // Explicitly owned candidate cluster.
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
    // Own all identities: shared QA fixture IDs can have their roles changed
    // by permission tests, which must not turn signing coverage into a 401.
    const userIds = [];
    for (const role of ['Admin', 'Client', 'Client', 'Client']) {
        const id = crypto.randomUUID();
        const { rows } = await pool.query(
            `INSERT INTO users (name,email,phonenumber,passwordhash,role)
             VALUES ($1,$2,$3,'synthetic-test-only',$4) RETURNING userid`,
            ['Synthetic PDF QA', `${id}@example.invalid`, `+1999${crypto.randomInt(10000000, 99999999)}`, role],
        );
        userIds.push(rows[0].userid);
    }
    const [authorId, firstSignerId, secondSignerId, unrelatedId] = userIds;
    const { r2 } = require('../utils/r2');
    const { PDFDocument, PDFName } = require('pdf-lib');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const token = (userid, role = 'Client') => jwt.sign({ userid, role }, process.env.JWT_SECRET);
    const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawText('SYNTHETIC QA - NO LEGAL VALIDITY', { x: 40, y: 790, size: 15 });
    const unsigned = Buffer.from(await pdf.save());
    const key = `users/${authorId}/qa-${crypto.randomUUID()}.pdf`;
    const objects = new Map([[key, { bytes: unsigned, type: 'application/pdf' }]]);
    let delayFinalPdf = false;
    let releaseFinalPdf;
    const finalPdfGate = new Promise(resolve => { releaseFinalPdf = resolve; });
    t.after(() => releaseFinalPdf());
    const originalSend = r2.send;
    t.after(() => { r2.send = originalSend; });
    r2.send = async (command) => {
        const { Key, Body, ContentType } = command.input;
        if (command.constructor.name === 'PutObjectCommand') {
            if (delayFinalPdf && Key.startsWith('signed/')) await finalPdfGate;
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
    // Providers remain isolated; opt in to the actual certificate renderer separately.
    const notifications = require('../services/notifications/notificationOrchestrator');
    const messages = require('../utils/sendMessage');
    const emails = require('../utils/smooveEmailCampaignService');
    const originalEmail = emails.sendEmailCampaign;
    const originalMessage = messages.sendMessage;
    const otpMessages = [];
    messages.sendMessage = async (message) => { otpMessages.push(message); return { ok: true }; };
    emails.sendEmailCampaign = async ({ campaignKey, contactFields }) => {
        assert.equal(campaignKey, 'SIGNING_OTP');
        otpMessages.push(String(contactFields.otp_code));
        return { ok: true };
    };
    t.after(() => { messages.sendMessage = originalMessage; });
    t.after(() => { emails.sendEmailCampaign = originalEmail; });
    const originalNotify = notifications.notifyRecipient;
    const delivered = [];
    notifications.notifyRecipient = async (payload) => {
        delivered.push(payload);
        return { ok: true, outcomes: { sms: { attempted: true, ok: true }, email: { attempted: true, ok: true } } };
    };
    const evidence = require('../lib/renderEvidencePdf');
    const originalRender = evidence.renderEvidencePdf;
    const certificates = [];
    evidence.renderEvidencePdf = async (payload) => {
        if (process.env.LEGAL_REAL_PDF_QA !== 'true') return unsigned;
        const bytes = Buffer.from(await originalRender(payload));
        certificates.push(bytes);
        return bytes;
    };
    t.after(() => { notifications.notifyRecipient = originalNotify; evidence.renderEvidencePdf = originalRender; });
    const app = require('../app');
    let fileId;
    t.after(async () => {
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
            await client.query('DELETE FROM audit_events WHERE actor_userid = ANY($1::int[])', [userIds]);
            await client.query('DELETE FROM users WHERE userid = ANY($1::int[])', [userIds]);
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    });
    const upload = await request(app).post('/api/SigningFiles/upload')
        .set('Authorization', `Bearer ${token(authorId, 'Admin')}`).send({
            fileName: 'Synthetic QA - no legal validity.pdf', fileKey: key,
            signers: [{ userId: firstSignerId, name: 'Synthetic A', deliveryMethod: 'email' }, { userId: secondSignerId, name: 'Synthetic B', deliveryMethod: 'email' }],
            signatureLocations: [firstSignerId, secondSignerId].map((id, index) => ({ pageNum: 1, x: 80 + index * 260, y: 350,
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
            const details = await request(app).get(base).query({ includePageGeometry: '1' });
            assert.equal(details.status, 200);
            assert.equal(details.body.pageGeometries.length, 1);
            assert.ok(Math.abs(details.body.pageGeometries[0].width - 800) < 0.001);
            assert.ok(Math.abs(details.body.pageGeometries[0].height - 842 * 800 / 595) < 0.001);
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
    const preview = await request(app).get(`/api/SigningFiles/${fileId}/download`).set('Authorization', `Bearer ${token(firstSignerId)}`);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    if (legacyPreview) {
        const partial = await request(app).get(`/api/SigningFiles/${fileId}/pdf`)
            .set('Authorization', `Bearer ${token(firstSignerId)}`).buffer(true)
            .parse((res, callback) => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => callback(null, Buffer.concat(chunks))); });
        assert.equal(partial.status, 200);
        const legacyKey = `${key}.legacy-partial.pdf`;
        objects.set(legacyKey, { bytes: partial.body, type: 'application/pdf' });
        // Reproduce old releases that persisted a preview while still pending,
        // sometimes setting the immutable timestamp before all signers finished.
        await pool.query(`UPDATE signingfiles SET signedstoragekey=$2,signedfilekey=$2,
            signedpdfsha256=$3,immutableatutc=$4 WHERE signingfileid=$1 AND status='pending'`,
            [fileId, legacyKey, hash(partial.body), legacyPreview === 'old-marker' ? '2026-01-01T00:00:00Z' : null]);
        assert.equal((await pool.query('SELECT status FROM signingfiles WHERE signingfileid=$1', [fileId])).rows[0].status, 'pending');
    }
    delayFinalPdf = true;
    const second = await sign(spots[1], true);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    // Reproduce a native viewer requesting output while the final upload is
    // still pending. The read must wait, not return an error or unsigned source.
    const immediateView = request(app).get(`/api/SigningFiles/${fileId}/pdf`)
        .set('Authorization', `Bearer ${token(secondSignerId)}`).buffer(true)
        .parse((res, callback) => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => callback(null, Buffer.concat(chunks))); })
        .then(response => response);
    await new Promise(resolve => setTimeout(resolve, 100));
    releaseFinalPdf();
    const immediatePdf = await immediateView;
    assert.equal(immediatePdf.status, 200, 'Immediate read waits for finalization');
    const deadline = Date.now() + 30000;
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
    assert.equal(hash(immediatePdf.body), hash(signed), 'Immediate read returned the exact final artifact');
    const signedDoc = await PDFDocument.load(signed);
    assert.equal(signedDoc.getPageCount(), 1);
    const images = signedDoc.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
    assert.ok(images.keys().length >= 2, 'Final PDF must contain both signatures after a partial preview');
    const forbidden = await request(app).get(`/api/SigningFiles/${fileId}/download`).set('Authorization', `Bearer ${token(unrelatedId)}`);
    assert.equal(forbidden.status, 403);
    const download = await request(app).get(`/api/SigningFiles/${fileId}/download`).set('Authorization', `Bearer ${token(secondSignerId)}`);
    assert.equal(download.status, 200);
    assert.ok(download.body.downloadUrl);
    const binary = (res, callback) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
    };
    const pagePreview = await request(app).get(`/api/SigningFiles/${fileId}/pdf?page=1`)
        .set('Authorization', `Bearer ${token(secondSignerId)}`).buffer(true).parse(binary);
    assert.equal(pagePreview.status, 200);
    const pageDocument = await PDFDocument.load(pagePreview.body);
    assert.equal(pageDocument.getPageCount(), 1);
    assert.ok(pageDocument.getPage(0).node.Resources().lookup(PDFName.of('XObject')).keys().length >= 2);
    assert.equal((await request(app).get(`/api/SigningFiles/${fileId}/pdf?page=2`)
        .set('Authorization', `Bearer ${token(secondSignerId)}`)).status, 400);
    const fullPdf = await request(app).get(`/api/SigningFiles/${fileId}/pdf`)
        .set('Authorization', `Bearer ${token(secondSignerId)}`).buffer(true).parse(binary);
    assert.equal(fullPdf.status, 200);
    assert.equal(hash(fullPdf.body), hash(signed));
    const zip = await request(app).get(`/api/SigningFiles/${fileId}/evidence-package`)
        .set('Authorization', `Bearer ${token(authorId, 'Admin')}`).buffer(true).parse(binary);
    assert.equal(zip.status, 200);
    const archive = new (require('adm-zip'))(zip.body);
    assert.ok(archive.test(), 'Evidence ZIP CRCs must all be valid');
    assert.equal(hash(archive.readFile('signed.pdf')), hash(signed), 'Evidence contains exactly the finalized PDF');
    const finalized = (await pool.query('SELECT signedstoragekey,signedpdfsha256 FROM signingfiles WHERE signingfileid=$1', [fileId])).rows[0];
    assert.equal(finalized.signedstoragekey, files[0].signedstoragekey, 'Viewing/downloading a finalized document must preserve its stored artifact');
    assert.equal(finalized.signedpdfsha256, files[0].signedpdfsha256, 'A finalized hash must never change on read');
    const previous = objects.get(finalized.signedstoragekey);
    objects.set(finalized.signedstoragekey, { ...previous, bytes: Buffer.from('synthetic corrupted output') });
    const corruptView = await request(app).get(`/api/SigningFiles/${fileId}/pdf`)
        .set('Authorization', `Bearer ${token(secondSignerId)}`);
    assert.equal(corruptView.status, 500, 'Corrupt signed bytes must not be served or silently regenerated');
    objects.set(finalized.signedstoragekey, previous);
    if (process.env.LEGAL_REAL_PDF_QA === 'true') {
        assert.ok(certificates.length > 0, 'Finalization must render a real evidence certificate');
        const certificate = await PDFDocument.load(certificates[0]);
        assert.equal(certificate.getPageCount(), 1, 'The two-signer fixture must not orphan the footer on another page');
        assert.notDeepEqual(certificates[0], unsigned);
        if (process.env.LEGAL_QA_PDF_OUTPUT) {
            require('node:fs').writeFileSync(process.env.LEGAL_QA_PDF_OUTPUT, certificates[0]);
        }
    }
});

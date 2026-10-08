const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

test('batch turn notifications, mixed OTP, uncertain delivery and new-route permission boundaries', { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    const ok = response => { assert.ok(response.status < 300, JSON.stringify(response.body));return response.body; };
    const auth = req => req.set('Authorization', `Bearer ${f.token}`);
    const contact = user => ({ userId: user.userid, deliveryMethod: 'email' });
    const template = ok(await auth(request(f.app).post('/api/signing-templates')).send({ ...f.definition, signingOrder: 'sequential' })).template;
    const input = { templateId: template.id, templateVersion: 1, idempotencyKey: crypto.randomUUID(), sharedSigners: { shared: contact(f.users[3]) },
        packages: [{ signers: { first: contact(f.users[1]) } }, { signers: { first: contact(f.users[2]) } }] };
    const batch = ok(await auth(request(f.app).post('/api/signing-batches')).send(input)).batch;
    assert.equal(batch.status, 'draft');
    const details = ok(await auth(request(f.app).post(`/api/signing-batches/${batch.id}/send`)).send({}));
    assert.equal(f.deliveries.length, 2, 'later signers are not invited before their turn');
    const shared = details.recipients.find(row => row.user_id === f.users[3].userid);
    const { recipientToken, notifyBatchTurn } = require('../services/signingBatchDelivery');
    const path = `/api/signing-batches/public/${recipientToken(shared.id)}`;
    let list = ok(await request(f.app).get(path));assert.ok(list.files.every(file => !file.isMyTurn));
    const consent = { consentAccepted: true, consentVersion: '2026-01-11' };
    assert.equal((await request(f.app).post(`${path}/session`).send({ ...consent, sessionId: crypto.randomUUID(), documents: list.files.map(file => ({ fileId: file.id, sha256: file.sha256 })) })).status, 409);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const { createPublicSigningToken } = require('../controllers/signingFileController');
    for (const [index, user] of [f.users[1], f.users[2]].entries()) {
        const fileId = details.files[index].signingfileid;
        const single = `/api/SigningFiles/public/${createPublicSigningToken({ signingFileId: fileId, signerUserId: user.userid })}`;
        const sid = crypto.randomUUID();
        ok(await request(f.app).post(`${single}/otp/request`).set('x-signing-session-id', sid).send({}));
        ok(await request(f.app).post(`${single}/otp/verify`).set('x-signing-session-id', sid).send({ otp: f.otp.at(-1) }));
        const info = ok(await request(f.app).get(single));
        ok(await request(f.app).post(`${single}/sign-batch`).set('x-signing-session-id', sid).send({ ...consent, signatureImage: png, signatureSpotIds: info.signatureSpots.filter(s => s.SignerUserId === user.userid).map(s => s.SignatureSpotId) }));
        assert.equal(f.deliveries.filter(p => p.recipientUserId === f.users[3].userid).length, index + 1, 'new ready documents produce a batch-link update');
        await Promise.all([notifyBatchTurn(fileId, f.users[3].userid), notifyBatchTurn(fileId, f.users[3].userid)]);
        assert.equal(f.deliveries.filter(p => p.recipientUserId === f.users[3].userid).length, index + 1, 'concurrent duplicate turn notifications do not resend');
    }
    assert.ok(f.deliveries.filter(p => p.recipientUserId === f.users[3].userid).every(p => new URL(p.email.contactFields.action_url).pathname === '/ViewSignedDocument/Package'));
    // An individually waived first file must not prevent real OTP on the remaining file.
    await f.pool.query('UPDATE signingfiles SET requireotp=false WHERE signingfileid=$1', [details.files[0].signingfileid]);
    list = ok(await request(f.app).get(path));
    const sid = crypto.randomUUID();
    const session = ok(await request(f.app).post(`${path}/session`).send({ ...consent, sessionId: sid, documents: list.files.map(file => ({ fileId: file.id, sha256: file.sha256 })) }));
    assert.equal(session.requireOtp, true);
    const canonical = ok(await request(f.app).get(`/api/SigningFiles/public/${session.canonicalToken}`));
    assert.equal(canonical.file.RequireOtp, true);
    const cp = `/api/SigningFiles/public/${session.canonicalToken}`;
    ok(await request(f.app).post(`${cp}/otp/request`).set('x-signing-session-id', sid).send({}));
    ok(await request(f.app).post(`${cp}/otp/verify`).set('x-signing-session-id', sid).send({ otp: f.otp.at(-1) }));
    ok(await request(f.app).post(`${path}/confirm-otp`).send({ sessionId: sid }));
    const { batchOtpGrant } = require('../lib/signingBatchOtpGrant');
    await f.pool.query("UPDATE signing_batch_sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [sid]);
    assert.equal(await batchOtpGrant({ signingFileId: list.files[0].id, signerUserId: f.users[3].userid, signingSessionId: sid, presentedPdfSha256: list.files[0].sha256 }), null);
    assert.equal((await request(f.app).post(`${path}/confirm-otp`).send({ sessionId: sid })).status, 403);
    assert.equal((await request(f.app).post(`${path}/session`).send({ ...consent, sessionId: crypto.randomUUID(), documents: [{ fileId: 2147483647, sha256: 'a'.repeat(64) }] })).status, 409);

    const uncertain = ok(await auth(request(f.app).post('/api/signing-batches')).send({ ...input, idempotencyKey: crypto.randomUUID() })).batch;
    f.outbound.mode = 'throw';const before = f.deliveries.length;
    const failed = ok(await auth(request(f.app).post(`/api/signing-batches/${uncertain.id}/send`)).send({}));
    assert.equal(failed.batch.status, 'partial');assert.equal(f.deliveries.length - before, 2);
    f.outbound.mode = 'success';ok(await auth(request(f.app).post(`/api/signing-batches/${uncertain.id}/send`)).send({}));
    assert.equal(f.deliveries.length - before, 2, 'ambiguous provider acceptance never gets an automatic resend');

    // New endpoints: upload-only can publish their own draft, but cannot manage other owners or offices.
    const tenant = (await f.pool.query('INSERT INTO law_firm_tenants(slug,name) VALUES($1,$2) RETURNING id', [`tpl${crypto.randomUUID().slice(0, 8)}`, 'Synthetic template office'])).rows[0];
    const permissions = { version: 3, areas: { signing: { visible: true, actions: ['view', 'upload'], dataScope: 'all_firm' } } };
    const role = (await f.pool.query('INSERT INTO firm_staff_roles(law_firm_tenant_id,name,permissions) VALUES($1,$2,$3) RETURNING id', [tenant.id, 'Synthetic uploader', permissions])).rows[0];
    await f.pool.query('UPDATE users SET law_firm_tenant_id=$1 WHERE userid=ANY($2::int[])', [tenant.id, f.users.map(u => u.userid)]);
    await f.pool.query('UPDATE users SET firm_staff_role_id=$1 WHERE userid=$2', [role.id, f.users[0].userid]);
    const ownTemplate = ok(await auth(request(f.app).post('/api/signing-templates')).send(f.definition)).template;
    const ownBatch = ok(await auth(request(f.app).post('/api/signing-batches')).send({ ...input, templateId: ownTemplate.id, idempotencyKey: crypto.randomUUID() })).batch;
    assert.equal(ok(await auth(request(f.app).get(`/api/signing-batches/${ownBatch.id}`))).canDeliver, true);
    ok(await auth(request(f.app).post(`/api/signing-batches/${ownBatch.id}/send`)).send({}));
    assert.equal((await auth(request(f.app).put(`/api/signing-templates/${ownTemplate.id}`)).send({ ...ownTemplate.definition, expectedVersion: 1 })).status, 403);
    await f.pool.query('UPDATE signing_batches SET owner_userid=$1 WHERE id=$2', [f.users[4].userid, ownBatch.id]);
    assert.equal((await auth(request(f.app).post(`/api/signing-batches/${ownBatch.id}/send`)).send({})).status, 403);
    const outsider = (await f.pool.query('INSERT INTO users(name,email,role,passwordhash) VALUES($1,$2,$3,$4) RETURNING userid', ['Other office', `${crypto.randomUUID()}@example.invalid`, 'Admin', 'synthetic'])).rows[0];
    const foreignToken = jwt.sign({ userid: outsider.userid, role: 'Admin' }, process.env.JWT_SECRET);
    assert.equal((await request(f.app).get(`/api/signing-templates/${ownTemplate.id}`).set('Authorization', `Bearer ${foreignToken}`)).status, 404);
    assert.equal((await request(f.app).get(`/api/signing-batches/${ownBatch.id}`).set('Authorization', `Bearer ${foreignToken}`)).status, 404);
    const contacts = ok(await request(f.app).get('/api/signing-batches/contacts?q=Synthetic').set('Authorization', `Bearer ${foreignToken}`));
    assert.ok(!contacts.contacts.some(c => f.users.some(u => u.userid === c.userId)));
});

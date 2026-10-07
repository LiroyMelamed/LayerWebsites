const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

// A real PNG with an opaque stroke, built without an image library.
function signaturePng(width = 240, height = 80) {
    const rows = [];
    for (let y = 0; y < height; y += 1) {
        const row = Buffer.alloc(1 + width * 4);
        for (let x = 0; x < width; x += 1) {
            const ink = Math.abs(y - (height / 2 + Math.sin(x / 18) * height / 4)) < 2.5;
            row.writeUInt32BE(ink ? 0x1a2b6dff : 0x00000000, 1 + x * 4);
        }
        rows.push(row);
    }
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('v2 public signing: exact manifest, OTP per session, sequential stages, one bulk session for the shared signer, final PDFs and evidence',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 300000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    const { createRuntime, objectStorage, notificationOtpTransport } = require('../services/signingV2/runtime');
    const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
    const { fakeProvider } = require('./helpers/signingV2Delivery');
    const { r2 } = require('../utils/r2');
    const publicRoutes = require('../routes/signingV2PublicRoutes');
    const grantKey = Buffer.alloc(32, 9);
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `qa-${randomUUID()}.invalid` });
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; });
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const ok = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
    const code = response => response.body?.errorCode || response.body?.code || response.body?.error?.code;
    const storage = objectStorage({ client: r2, bucket: 'qa' });
    const sendMessage = require('../utils/sendMessage'), campaigns = require('../utils/smooveEmailCampaignService');
    publicRoutes.useService(createPublicSigningService({ pool: f.pool, storage, otpKey: grantKey, otpTransport: notificationOtpTransport({
        sendMessage: (...args) => sendMessage.sendMessage(...args), sendEmailCampaign: (...args) => campaigns.sendEmailCampaign(...args) }) }));
    t.after(() => publicRoutes.useService(null));

    const definition = structuredClone(f.definition);
    definition.signingOrder = 'sequential';
    definition.documents[0].fields.push(
        { pageNum: 1, x: 50, y: 200, width: 260, height: 30, roleId: 'first', fieldType: 'text', isRequired: true, fieldLabel: 'Job title' },
        { pageNum: 1, x: 50, y: 250, width: 130, height: 24, roleId: 'first', fieldType: 'date', isRequired: true },
        { pageNum: 1, x: 50, y: 300, width: 24, height: 24, roleId: 'first', fieldType: 'checkbox', isRequired: true });
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(definition), 201).template;
    const versionId = ok(await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({ locale: 'he' }), 201).versionId;
    const lawyer = { name: 'עו״ד בדיקה', email: 'lawyer@example.invalid', channel: 'email', locale: 'he' };
    const body = { name: 'Synthetic onboarding', templateVersionId: versionId, shared: { shared: lawyer }, rows: [
        { key: 'E1', recipients: { first: { name: 'Synthetic Employee One', email: 'one@example.invalid', channel: 'email', locale: 'en' } } },
        { key: 'E2', recipients: { first: { name: 'موظف تجريبي', phone: '050-765-4321', channel: 'sms', locale: 'ar' } } },
        { key: 'E3', recipients: { first: { name: 'עובד שלישי', email: 'three@example.invalid', channel: 'email', locale: 'he' } } },
    ] };
    const preview = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(body), 200);
    assert.equal(preview.valid, true, JSON.stringify(preview.errors));
    const { submissionId } = ok(await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID()).send({ ...body, previewHash: preview.previewHash }), 201);
    const contextId = (await f.pool.query('SELECT id FROM signing_owner_contexts WHERE deployment_key=$1', [process.env.SIGNING_DEPLOYMENT_KEY])).rows[0].id;

    const provider = fakeProvider();
    const runtime = createRuntime({ pool: f.pool, env: { ...process.env, SIGNING_V2_GRANT_KEY: grantKey.toString('base64'), WEBSITE_DOMAIN: 'qa.example.invalid', SIGNING_V2_RENDERERS: '2' },
        storage, provider, contextIds: [contextId], log: { log() {}, error: (...args) => workerErrors.push(args.map(arg => arg?.stack || String(arg)).join(' ')) } });
    const workerErrors = [];
    t.after(() => runtime.stop());
    const queued = (await f.pool.query(`SELECT count(*)::integer AS count FROM signing_jobs WHERE owner_context_id=$1 AND state='pending'`, [contextId])).rows[0].count;
    assert.equal(queued, 15, 'the run is queued durably before any worker runs');
    t.diagnostic(`drained ${await runtime.drain()} jobs`);
    assert.deepEqual(workerErrors, [], 'no job failed while preparing the run');
    const tokenFor = endpoint => {
        const call = provider.calls.find(item => item.endpoint === endpoint);
        assert.ok(call, `an invitation reached ${endpoint}`);
        return new URL(call.url).hash.slice(1);
    };
    assert.deepEqual(provider.calls.map(call => call.endpoint).sort(), ['+972507654321', 'one@example.invalid', 'three@example.invalid'],
        'the second stage gets nothing before the first stage signs');
    const pub = (method, url, token) => request(f.app)[method](`/api/signing-v2/public${url}`).set('X-Signing-Grant', token);

    assert.equal((await request(f.app).get('/api/signing-v2/public/package')).status, 404, 'no token, no package');
    assert.equal((await pub('get', '/package', 'A'.repeat(43))).status, 404, 'an unknown token reveals nothing');
    process.env.SIGNING_V2_ENABLED = 'false';
    assert.equal((await pub('get', '/package', tokenFor('one@example.invalid'))).status, 404, 'offices without v2 keep their current flows only');
    process.env.SIGNING_V2_ENABLED = 'true';

    const one = tokenFor('one@example.invalid');
    const view = ok(await pub('get', '/package', one), 200);
    assert.equal(view.person.name, 'Synthetic Employee One');
    assert.equal(view.locale, 'en');
    assert.equal(view.consentVersion, CONSENT_VERSION);
    assert.deepEqual(view.counts, { ready: 1, accepted: 0, waiting: 0 });
    assert.deepEqual(view.packages[0].otherParticipants, ['עו״ד בדיקה']);
    const task = view.packages[0].documents[0].tasks[0];
    assert.deepEqual(task.fields.map(field => field.type), ['signature', 'text', 'date', 'checkbox']);
    const fieldOf = type => task.fields.find(field => field.type === type).id;
    const pdf = await pub('get', `/documents/${view.packages[0].documents[0].documentId}`, one);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.equal(pdf.headers['cache-control'], 'private, no-store');

    const two = tokenFor('+972507654321');
    const twoView = ok(await pub('get', '/package', two), 200);
    assert.equal((await pub('get', `/documents/${twoView.packages[0].documents[0].documentId}`, one)).status, 404, 'a link never opens another signer\'s document');
    const foreign = await pub('post', '/sessions', one).send({ taskIds: [twoView.packages[0].documents[0].tasks[0].taskId], consentVersion: CONSENT_VERSION, locale: 'en' });
    assert.equal(foreign.status, 404, 'another signer\'s task cannot enter a manifest');
    assert.equal((await pub('post', '/sessions', one).send({ taskIds: [task.taskId], consentVersion: 'old', locale: 'en' })).status, 409);

    const session = ok(await pub('post', '/sessions', one).set('User-Agent', 'synthetic-browser/1').send({ taskIds: [task.taskId], consentVersion: CONSENT_VERSION, locale: 'en' }), 201);
    assert.deepEqual(session.channels, [{ channel: 'email', hint: 'o•••@example.invalid' }]);
    const png = signaturePng().toString('base64');
    const values = { [task.taskId]: { [fieldOf('text')]: 'Synthetic analyst', [fieldOf('checkbox')]: true } };
    const accept = (token, id, payload, key = randomUUID()) => pub('post', `/sessions/${id}/accept`, token).set('Idempotency-Key', key).send(payload);
    let refused = await accept(one, session.sessionId, { consent: true, signature: png, values });
    assert.equal(refused.status, 403, 'nothing is signed before the code is verified');

    const sentBefore = f.otp.length;
    const challenged = ok(await pub('post', `/sessions/${session.sessionId}/challenge`, one).send({ channel: 'email' }), 200);
    assert.equal(challenged.delivery, 'sent');
    assert.equal(f.otp.length, sentBefore + 1, 'exactly one code went through the isolated test transport');
    const otp = f.otp.at(-1);
    assert.match(otp, /^\d{6}$/);
    const stored = (await f.pool.query('SELECT code_hash,code_salt FROM signing_otp_challenges_v2 WHERE session_id=$1', [session.sessionId])).rows[0];
    assert.ok(!JSON.stringify(stored).includes(otp), 'only a keyed hash of the code is stored');
    assert.equal((await pub('post', `/sessions/${session.sessionId}/challenge`, one).send({})).status, 429, 'a second code waits for the cooldown');
    const wrong = await pub('post', `/sessions/${session.sessionId}/verify`, one).send({ code: otp === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 422);
    assert.equal(ok(await pub('post', `/sessions/${session.sessionId}/verify`, one).send({ code: otp }), 200).verified, true);

    refused = await accept(one, session.sessionId, { consent: true, signature: png, values: { [task.taskId]: { [fieldOf('checkbox')]: true } } });
    assert.equal(code(refused), 'FIELD_REQUIRED', 'a required text field must be filled');
    refused = await accept(one, session.sessionId, { consent: true, values });
    assert.equal(code(refused), 'SIGNATURE_REQUIRED');
    refused = await accept(one, session.sessionId, { consent: true, signature: Buffer.from('not a png at all, just text that is long enough').toString('base64'), values });
    assert.equal(code(refused), 'INVALID_SIGNATURE');
    refused = await accept(one, session.sessionId, { consent: false, signature: png, values });
    assert.equal(code(refused), 'CONSENT_REQUIRED');

    const key = randomUUID();
    const twice = await Promise.all([0, 1].map(() => accept(one, session.sessionId, { consent: true, signature: png, values }, key)));
    assert.deepEqual(twice.map(item => item.status), [200, 200], JSON.stringify(twice.map(item => item.body)));
    assert.deepEqual(twice.map(item => item.body.reused).sort(), [false, true], 'a double click or a lost response returns the same acceptance');
    assert.equal((await f.pool.query('SELECT count(*)::integer AS count FROM signing_actions WHERE task_id=$1', [task.taskId])).rows[0].count, 1);
    assert.equal((await accept(one, session.sessionId, { consent: true, signature: png, values: { [task.taskId]: { [fieldOf('text')]: 'Different', [fieldOf('checkbox')]: true } } }, key)).status, 409,
        'the same key with different content is rejected');
    assert.equal((await pub('post', '/sessions', one).send({ taskIds: [task.taskId], consentVersion: CONSENT_VERSION, locale: 'en' })).status, 409, 'an accepted task cannot be signed again');
    assert.equal((await accept(one, session.sessionId, { consent: true, signature: png, values })).status, 409, 'a session signs once');

    async function signAll(token, endpointCode = () => f.otp.at(-1), extra = {}) {
        const current = ok(await pub('get', '/package', token), 200);
        const tasks = current.packages.flatMap(item => item.documents.flatMap(document => document.tasks.filter(item2 => item2.state === 'ready')));
        const opened = ok(await pub('post', '/sessions', token).send({ taskIds: tasks.map(item => item.taskId), consentVersion: CONSENT_VERSION, locale: current.locale }), 201);
        ok(await pub('post', `/sessions/${opened.sessionId}/challenge`, token).send({}), 200);
        ok(await pub('post', `/sessions/${opened.sessionId}/verify`, token).send({ code: endpointCode() }), 200);
        const filled = Object.fromEntries(tasks.map(item => [item.taskId, Object.fromEntries(item.fields
            .filter(field => ['text', 'checkbox'].includes(field.type)).map(field => [field.id, field.type === 'text' ? (extra.text || 'כותרת תפקיד') : true]))]));
        return { tasks, result: ok(await accept(token, opened.sessionId, { consent: true, signature: png, values: filled }), 200) };
    }

    await runtime.drain();
    const lawyerCalls = () => provider.calls.filter(call => call.endpoint === 'lawyer@example.invalid');
    assert.equal(lawyerCalls().length, 1, 'the first signed package invites the shared signer');
    const smsChallenge = await signAll(two, () => f.otp.at(-1), { text: 'محلل بيانات' });
    assert.equal(smsChallenge.tasks.length, 1);
    const three = tokenFor('three@example.invalid');
    const revoked = (await f.pool.query(`UPDATE signing_public_grants SET revoked_at=clock_timestamp() WHERE token_hash=$1 RETURNING id`,
        [require('../lib/signingV2/canonical').bytesHash(Buffer.from(three))])).rows[0];
    assert.equal((await pub('get', '/package', three)).status, 404, 'a revoked link stops working at once');
    await f.pool.query('UPDATE signing_public_grants SET revoked_at=NULL WHERE id=$1', [revoked.id]);
    const threeTask = ok(await pub('get', '/package', three), 200).packages[0].documents[0].tasks[0].taskId;
    const guessed = ok(await pub('post', '/sessions', three).send({ taskIds: [threeTask], consentVersion: CONSENT_VERSION, locale: 'he' }), 201);
    ok(await pub('post', `/sessions/${guessed.sessionId}/challenge`, three).send({}), 200);
    const real = f.otp.at(-1), miss = real === '000000' ? '111111' : '000000';
    const misses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) misses.push((await pub('post', `/sessions/${guessed.sessionId}/verify`, three).send({ code: miss })).status);
    assert.deepEqual(misses, [422, 422, 422, 422, 429], 'five wrong codes close the challenge');
    assert.equal((await pub('post', `/sessions/${guessed.sessionId}/verify`, three).send({ code: real })).status, 409, 'the right code after exhaustion no longer works');
    const expiring = ok(await pub('post', '/sessions', three).send({ taskIds: [threeTask], consentVersion: CONSENT_VERSION, locale: 'he' }), 201);
    ok(await pub('post', `/sessions/${expiring.sessionId}/challenge`, three).send({}), 200);
    await f.pool.query(`UPDATE signing_otp_challenges_v2 SET created_at=created_at-interval '1 hour',sent_at=sent_at-interval '1 hour',
        expires_at=expires_at-interval '1 hour' WHERE session_id=$1`, [expiring.sessionId]);
    assert.equal((await pub('post', `/sessions/${expiring.sessionId}/verify`, three).send({ code: f.otp.at(-1) })).status, 410, 'an expired code is refused');
    await signAll(three);
    await runtime.drain();
    assert.equal(lawyerCalls().length, 1, 'one invitation for the whole run, not one per package');
    const lawyerDeliveries = (await f.pool.query(`SELECT state,count(*)::integer AS count FROM signing_deliveries
        WHERE owner_context_id=$1 AND (target_snapshot->>'endpoint')='lawyer@example.invalid' GROUP BY 1 ORDER BY 1`, [contextId])).rows;
    assert.deepEqual(lawyerDeliveries, [{ state: 'bundled', count: 2 }, { state: 'provider_accepted', count: 1 }]);

    const lawyerToken = new URL(lawyerCalls()[0].url).hash.slice(1);
    const lawyerView = ok(await pub('get', '/package', lawyerToken), 200);
    assert.equal(lawyerView.packages.length, 3, 'the shared link covers every package of the run');
    assert.deepEqual(lawyerView.counts, { ready: 3, accepted: 0, waiting: 0 });
    assert.deepEqual(lawyerView.packages.map(item => item.reference), ['E1', 'E2', 'E3']);
    const bulk = await signAll(lawyerToken);
    assert.equal(bulk.tasks.length, 3, 'one session and one code sign all three packages');
    assert.deepEqual(bulk.result.packages.map(item => item.state), ['finalizing', 'finalizing', 'finalizing']);
    await runtime.drain();

    const finished = (await f.pool.query(`SELECT r.workflow_state,d.state AS document_state,d.final_artifact_id IS NOT NULL AS has_final
        FROM signing_packages p JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        JOIN signing_documents d ON d.owner_context_id=r.owner_context_id AND d.revision_id=r.id WHERE p.submission_id=$1`, [submissionId])).rows;
    assert.deepEqual(finished, Array(3).fill({ workflow_state: 'complete', document_state: 'final', has_final: true }));
    assert.equal((await f.pool.query('SELECT state FROM signing_submissions WHERE id=$1', [submissionId])).rows[0].state, 'complete');

    const final = await pub('get', `/documents/${view.packages[0].documents[0].documentId}`, one).buffer(true).parse((response, done) => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks)));
    });
    assert.equal(final.status, 200);
    assert.equal(final.headers['x-document-final'], 'true');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const standardFontDataUrl = `${path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts')}/`;
    const loaded = await pdfjs.getDocument({ data: new Uint8Array(final.body), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
    assert.equal(loaded.numPages, 2);
    const firstPage = await loaded.getPage(1);
    const text = (await firstPage.getTextContent()).items.map(item => item.str).join('').replace(/\s+/g, ' ');
    assert.match(text, /Synthetic ?analyst/, 'the signer\'s text is printed on the final PDF');
    assert.match(text, /\d{2} ?\/ ?\d{2} ?\/ ?\d{4}/, 'the signing date is printed');
    const operators = await firstPage.getOperatorList();
    const images = operators.fnArray.filter(fn => fn === pdfjs.OPS.paintImageXObject).length;
    assert.ok(images >= 1, 'the signature image is drawn on page 1');
    const secondImages = (await (await loaded.getPage(2)).getOperatorList()).fnArray.filter(fn => fn === pdfjs.OPS.paintImageXObject).length;
    assert.ok(secondImages >= 1, 'the shared signer\'s signature is drawn on page 2');

    const evidence = await pub('get', `/packages/${view.packages[0].packageId}/evidence`, one).buffer(true).parse((response, done) => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks)));
    });
    assert.equal(evidence.status, 200);
    const certificate = await pdfjs.getDocument({ data: new Uint8Array(evidence.body), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
    let certificateText = '';
    for (let index = 1; index <= certificate.numPages; index += 1) certificateText += (await (await certificate.getPage(index)).getTextContent()).items.map(item => item.str).join('');
    certificateText = certificateText.replace(/\s+/g, ' ');
    assert.match(certificateText, /Synthetic ?Employee ?One/);
    assert.match(certificateText, /synthetic-browser\/1/, 'the evidence records the device that signed');
    assert.match(certificateText, /o•••@example\.invalid/, 'the evidence names the verified channel without the full address');
    assert.ok(!certificateText.includes('one@example.invalid'), 'the certificate does not print the full address');
    t.diagnostic(`final PDF ${final.body.length} bytes; evidence ${evidence.body.length} bytes, ${certificate.numPages} page(s)`);

    const extra = (await f.pool.query(`SELECT count(*)::integer AS count FROM signing_actions a JOIN signing_tasks t ON t.id=a.task_id
        JOIN signing_packages p ON p.active_revision_id=t.revision_id WHERE p.submission_id=$1`, [submissionId])).rows[0].count;
    assert.equal(extra, 6, 'three employee signatures and three lawyer signatures, no duplicates');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { bytesHash } = require('../lib/signingV2/canonical');
const png = require('./helpers/completionMarkPng');

test('authorized completion marks and typed fields survive native publication, two PDF stages and real final PDF rendering',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 120000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `marks-${randomUUID()}.invalid` });
    const { createRuntime, objectStorage, notificationOtpTransport } = require('../services/signingV2/runtime');
    const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
    const { fakeProvider } = require('./helpers/signingV2Delivery');
    const { r2 } = require('../utils/r2'), publicRoutes = require('../routes/signingV2PublicRoutes');
    const storage = objectStorage({ client: r2, bucket: 'qa' }), key = Buffer.alloc(32, 12);
    publicRoutes.useService(createPublicSigningService({ pool: f.pool, storage, otpKey: key, otpTransport: notificationOtpTransport({
        sendMessage: (...args) => require('../utils/sendMessage').sendMessage(...args),
        sendEmailCampaign: (...args) => require('../utils/smooveEmailCampaignService').sendEmailCampaign(...args) }) }));
    t.after(() => publicRoutes.useService(null));
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const ok = (reply, status = 200) => { assert.equal(reply.status, status, JSON.stringify(reply.body)); return reply.body; };
    const api = (method, path, body) => as(request(f.app)[method](`/api/signing-v2${path}`)).send(body);
    const markImage = png(), input = { authorized: true, kind: 'office_stamp', image: `data:image/png;base64,${markImage.toString('base64')}` };
    let mark;
    await t.test('private asset registration is explicitly authorized, idempotent and not publicly accessible', async () => {
        assert.equal((await api('post', '/authoring/completion-marks', { ...input, authorized: false })).status, 422);
        const clientToken = jwt.sign({ userid: f.users[1].userid, role: 'Client' }, process.env.JWT_SECRET);
        assert.equal((await request(f.app).post('/api/signing-v2/authoring/completion-marks').set('Authorization', `Bearer ${clientToken}`).send(input)).status, 403);
        mark = ok(await api('post', '/authoring/completion-marks', input)).mark;
        assert.equal(mark.hash, bytesHash(markImage));
        assert.equal(ok(await api('post', '/authoring/completion-marks', input)).mark.id, mark.id);
        assert.equal(ok(await api('get', `/authoring/completion-marks/${mark.id}`)).mark.image, input.image);
        assert.equal((await request(f.app).get(`/api/signing-v2/authoring/completion-marks/${mark.id}`)).status, 401);
    });
    const legacyDefinition = structuredClone(f.definition); legacyDefinition.signingOrder = 'sequential';
    legacyDefinition.documents[0].fields.push(...['email', 'phone', 'idnumber', 'lawyerStamp', 'initials'].map((fieldType, index) => ({
        fieldType, roleId: 'first', pageNum: 2, x: 40, y: 70 + index * 45, width: 280, height: 30, isRequired: true })));
    legacyDefinition.documents.push({ ...structuredClone(legacyDefinition.documents[0]), id: randomUUID(), name: 'Second distinct PDF' });
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(legacyDefinition), 201).template;
    const imported = ok(await api('post', `/templates/legacy/${legacy.id}/import`, { locale: 'en' }), 201);
    const original = ok(await api('get', `/authoring/versions/${imported.versionId}`)).version;
    const definition = structuredClone(original.definition);
    for (const doc of definition.documents) doc.fields.push({ id: 'officeMark', type: 'completionMark', pageNum: 2,
        x: 40, y: 400, width: 240, height: 80, required: false, automaticAtCompletion: true, assetId: mark.id, assetHash: mark.hash });
    const draftId = randomUUID(); let version;
    await t.test('publication preserves typed fields, refuses foreign/hash-changed marks and freezes the exact approved image', async () => {
        const wrong = structuredClone(definition); wrong.documents[0].fields.at(-1).assetHash = 'a'.repeat(64);
        assert.equal((await api('put', `/authoring/drafts/${draftId}`, { expectedVersion: 0, definition: wrong })).status, 422);
        wrong.documents[0].fields.at(-1).assetId = randomUUID();
        assert.equal((await api('put', `/authoring/drafts/${draftId}`, { expectedVersion: 0, definition: wrong })).status, 404);
        const draft = ok(await api('put', `/authoring/drafts/${draftId}`, { expectedVersion: 0, definition })).version;
        version = ok(await api('post', `/authoring/drafts/${draftId}/publish`, { expectedVersion: draft.editVersion, definitionHash: draft.definitionHash })).version;
        assert.deepEqual(ok(await api('get', `/authoring/versions/${imported.versionId}`)).version, original);
        assert.deepEqual(version.definition.documents[0].fields.filter(field => ['email','phone','idnumber'].includes(field.type)).map(field => field.type), ['email','phone','idnumber']);
    });
    const createBody = { templateVersionId: version.id, name: 'Synthetic completion marks',
        shared: { shared: { name: 'Manual external professional', email: 'second@example.invalid', channel: 'email' } },
        rows: [{ key: 'one', recipients: { first: { name: 'Manual external client', email: 'first@example.invalid', channel: 'email' } } }] };
    const preview = ok(await api('post', '/creation/preview', createBody)); assert.equal(preview.valid, true, JSON.stringify(preview));
    const created = ok(await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID()).send({ ...createBody, previewHash: preview.previewHash }), 201);
    const packageRow = (await f.pool.query('SELECT * FROM signing_packages WHERE submission_id=$1', [created.submissionId])).rows[0];
    const contextId = packageRow.owner_context_id, provider = fakeProvider(), workerErrors = [];
    const runtime = createRuntime({ pool: f.pool, storage, provider, contextIds: [contextId],
        env: { ...process.env, SIGNING_V2_GRANT_KEY: key.toString('base64'), WEBSITE_DOMAIN: 'qa.example.invalid', SIGNING_V2_RENDERERS: '2' },
        log: { log() {}, error: (...args) => workerErrors.push(args.map(arg => arg?.stack || String(arg)).join(' ')) } });
    t.after(() => runtime.stop());
    await runtime.drain(); assert.deepEqual(workerErrors, []);
    const tokenFor = email => new URL(provider.calls.find(call => call.endpoint === email).url).hash.slice(1);
    const pub = (method, url, token) => request(f.app)[method](`/api/signing-v2/public${url}`).set('X-Signing-Grant', token);
    const sign = async (token, typed) => {
        const view = ok(await pub('get', '/package', token));
        const docs = view.packages.flatMap(pkg => pkg.documents), tasks = docs.flatMap(doc => doc.tasks.filter(task => task.state === 'ready'));
        assert.equal(tasks.length, 2); assert.equal(docs.every(doc => doc.hasCompletionMark === true), true);
        assert.equal(tasks.some(task => task.fields.some(field => field.type === 'completionMark')), false);
        const session = ok(await pub('post', '/sessions', token).send({ taskIds: tasks.map(task => task.taskId), consentVersion: CONSENT_VERSION, locale: 'en' }), 201);
        ok(await pub('post', `/sessions/${session.sessionId}/challenge`, token).send({ channel: 'email' }));
        ok(await pub('post', `/sessions/${session.sessionId}/verify`, token).send({ code: f.otp.at(-1) }));
        const values = Object.fromEntries(tasks.map(task => [task.taskId, Object.fromEntries(task.fields.filter(field => ['email','phone','idnumber'].includes(field.type)).map(field => [field.id, typed[field.type]]))]));
        const accept = body => pub('post', `/sessions/${session.sessionId}/accept`, token).set('Idempotency-Key', randomUUID()).send(body);
        const payload = { consent: true, signature: png(0x2244B8FF).toString('base64'), values,
            drawings: tasks.flatMap(task => task.fields.filter(field=>['lawyerStamp','initials'].includes(field.type)).map(field=>({image:png(field.type==='lawyerStamp'?0x22B844FF:0x554455FF).toString('base64'),fields:[{taskId:task.taskId,fieldId:field.id}]}))) };
        if (typed) {
            const bad = structuredClone(payload), emailField = tasks[0].fields.find(field => field.type === 'email');
            bad.values[tasks[0].taskId][emailField.id] = 'invalid';
            assert.equal((await accept(bad)).status, 422);
        }
        ok(await accept(payload));
        return { session, tasks };
    };
    await t.test('first-stage document values are explicit and exact; no automatic mark is applied early', async () => {
        const signed = await sign(tokenFor('first@example.invalid'), { email: 'document-value@example.invalid', phone: '0500123456', idnumber: '000012345' });
        const values = (await f.pool.query('SELECT values_snapshot FROM signing_actions WHERE task_id=$1', [signed.tasks[0].taskId])).rows[0].values_snapshot.fields;
        assert.equal(values.find(field => field.type === 'idnumber').value, '000012345');
        assert.equal(values.find(field => field.type === 'phone').value, '0500123456');
        assert.equal(values.find(field => field.type === 'email').value, 'document-value@example.invalid');
        assert.notEqual(values.find(field=>field.type==='lawyerStamp').value, values.find(field=>field.type==='signature').value);
        assert.notEqual(values.find(field=>field.type==='initials').value, values.find(field=>field.type==='signature').value);
        await runtime.drain(); assert.deepEqual(workerErrors, []);
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_events_v2 WHERE package_id=$1 AND kind='completion_marks_applied'", [packageRow.id])).rows[0].n, 0);
        assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_documents WHERE revision_id=$1 AND final_artifact_id IS NOT NULL', [packageRow.active_revision_id])).rows[0].n, 0);
    });
    await t.test('last signer keeps consent/OTP; automatic marks appear once in all final real PDFs and separate audit', async () => {
        await sign(tokenFor('second@example.invalid'), null);
        await runtime.drain(); assert.deepEqual(workerErrors, []);
        const finals = (await f.pool.query(`SELECT a.* FROM signing_documents d JOIN signing_artifacts a ON a.id=d.final_artifact_id WHERE d.revision_id=$1`, [packageRow.active_revision_id])).rows;
        assert.equal(finals.length, 2);
        for (const artifact of finals) {
            assert.equal(artifact.metadata.completionMarks[0].hash, mark.hash);
            const bytes = f.objects.get(artifact.object_key); assert.equal(bytesHash(bytes), artifact.content_sha256);
            const pdf = await require('pdf-lib').PDFDocument.load(bytes);
            assert.equal(pdf.getPages().length, 2);
            const { PDFName, PDFDict, PDFRawStream } = require('pdf-lib');
            const xobjects = pdf.getPages()[1].node.Resources().lookup(PDFName.of('XObject'), PDFDict);
            const hasRedMark = xobjects.values().some(ref => {
                const stream = pdf.context.lookup(ref, PDFRawStream);
                if (stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') return false;
                const decoded = require('node:zlib').inflateSync(stream.contents);
                return decoded.includes(Buffer.from([0xB8,0x22,0x22]));
            });
            assert.equal(hasRedMark, true, 'approved red completion image is embedded in the final PDF');
        }
        assert.equal((await f.pool.query('SELECT workflow_state FROM signing_package_revisions WHERE id=$1', [packageRow.active_revision_id])).rows[0].workflow_state, 'complete');
        assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM signing_actions a JOIN signing_tasks t ON t.id=a.task_id WHERE t.revision_id=$1', [packageRow.active_revision_id])).rows[0].n, 4, 'only four consent/OTP actions, no fabricated office signing action');
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_events_v2 WHERE package_id=$1 AND kind='completion_marks_applied'", [packageRow.id])).rows[0].n, 2);
        await runtime.drain();
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM signing_events_v2 WHERE package_id=$1 AND kind='completion_marks_applied'", [packageRow.id])).rows[0].n, 2);
    });
});

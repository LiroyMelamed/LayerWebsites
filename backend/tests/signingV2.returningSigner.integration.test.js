const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const zlib = require('node:zlib');

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

test('the same person signing now and again after other signers needs a new explicit session for the later PDF',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 180000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    const { createRuntime, objectStorage } = require('../services/signingV2/runtime');
    const { createPublicSigningService, CONSENT_VERSION } = require('../services/signingV2/publicSigning');
    const { fakeProvider } = require('./helpers/signingV2Delivery');
    const { createPerson } = require('../services/signingV2/people');
    const { r2 } = require('../utils/r2');
    const publicRoutes = require('../routes/signingV2PublicRoutes');
    const grantKey = Buffer.alloc(32, 7), codes = [];
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `qa-returning-${randomUUID()}.invalid` });
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; publicRoutes.useService(null); });
    const storage = objectStorage({ client: r2, bucket: 'qa' });
    publicRoutes.useService(createPublicSigningService({ pool: f.pool, storage, otpKey: grantKey,
        otpTransport: { send: async item => { codes.push(item.code); } } }));
    const as = call => call.set('Authorization', `Bearer ${f.token}`);
    const ok = (res, expected = 200) => { assert.equal(res.status, expected, JSON.stringify(res.body)); return res.body; };
    const definition = { ...f.definition, signingOrder: 'sequential', roles: [
        { id: 'opening', name: 'עו״ד — אישור ראשון', kind: 'shared' },
        { id: 'client', name: 'לקוח', kind: 'first' },
        { id: 'closing', name: 'עו״ד — אישור לאחר הלקוח', kind: 'shared' },
    ], documents: [
        { id: randomUUID(), name: 'First PDF', fileKey: f.key, fields: [
            { pageNum: 1, x: 50, y: 100, width: 160, height: 55, roleId: 'opening', fieldType: 'signature', isRequired: true },
            { pageNum: 2, x: 50, y: 100, width: 160, height: 55, roleId: 'client', fieldType: 'signature', isRequired: true },
        ] },
        { id: randomUUID(), name: 'Later PDF', fileKey: f.key, fields: [
            { pageNum: 2, x: 50, y: 250, width: 160, height: 55, roleId: 'closing', fieldType: 'signature', isRequired: true },
        ] },
    ] };
    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(definition), 201).template;
    const versionId = ok(await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({ locale: 'he' }), 201).versionId;
    const contextId = (await f.pool.query('SELECT id FROM signing_owner_contexts WHERE deployment_key=$1', [process.env.SIGNING_DEPLOYMENT_KEY])).rows[0].id;
    const scope = { contextId, userId: f.users[0].userid, tenantId: null, all: true, manage: true };
    const { person } = await createPerson(f.pool, scope, { name: 'Same lawyer', endpoints: { email: 'returning@example.invalid' } });
    const shared = { personId: person.id, name: person.name, email: 'returning@example.invalid', channel: 'email' };
    const body = { name: 'Returning signer QA', templateVersionId: versionId, shared: { opening: shared, closing: shared },
        rows: [{ key: 'QA', recipients: { client: { name: 'Other signer', email: 'middle@example.invalid', channel: 'email' } } }] };
    const preview = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(body));
    assert.equal(preview.valid, true, JSON.stringify(preview));
    ok(await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID()).send({ ...body, previewHash: preview.previewHash }), 201);
    const provider = fakeProvider(), workerErrors = [];
    const runtime = createRuntime({ pool: f.pool, storage, provider, contextIds: [contextId],
        env: { ...process.env, SIGNING_V2_GRANT_KEY: grantKey.toString('base64'), WEBSITE_DOMAIN: 'qa.example.invalid', SIGNING_V2_RENDERERS: '2' },
        log: { log() {}, error: (...args) => workerErrors.push(args.map(String).join(' ')) } });
    t.after(() => runtime.stop());
    await runtime.drain();
    assert.deepEqual(workerErrors, []);
    const tokenFor = endpoint => { const call = provider.calls.find(item => item.endpoint === endpoint); assert.ok(call, endpoint); return new URL(call.url).hash.slice(1); };
    const pub = (method, url, token) => request(f.app)[method](`/api/signing-v2/public${url}`).set('X-Signing-Grant', token);
    const viewFor = async token => ok(await pub('get', '/package', token));
    const tasksOf = view => view.packages.flatMap(pkg => pkg.documents.flatMap(doc => doc.tasks));
    const lawyer = tokenFor('returning@example.invalid');
    const initialTasks = tasksOf(await viewFor(lawyer));
    assert.deepEqual(initialTasks.map(task => task.state).sort(), ['ready', 'waiting']);
    const first = initialTasks.find(task => task.state === 'ready'), later = initialTasks.find(task => task.state === 'waiting');
    const premature = await pub('post', '/sessions', lawyer).send({ taskIds: [first.taskId, later.taskId], consentVersion: CONSENT_VERSION, locale: 'he' });
    assert.equal(premature.status, 409);
    assert.equal(premature.body.errorCode, 'NOT_YOUR_TURN');
    const signature = signaturePng().toString('base64');
    async function sign(token, task) {
        const session = ok(await pub('post', '/sessions', token).send({ taskIds: [task.taskId], consentVersion: CONSENT_VERSION, locale: 'he' }), 201);
        ok(await pub('post', `/sessions/${session.sessionId}/challenge`, token).send({}));
        ok(await pub('post', `/sessions/${session.sessionId}/verify`, token).send({ code: codes.at(-1) }));
        const key = randomUUID(), payload = { consent: true, signature, values: { [task.taskId]: {} } };
        ok(await pub('post', `/sessions/${session.sessionId}/accept`, token).set('Idempotency-Key', key).send(payload));
        return { session, key, payload };
    }
    const old = await sign(lawyer, first);
    await runtime.drain();
    assert.equal(tasksOf(await viewFor(lawyer)).find(task => task.taskId === later.taskId).state, 'waiting');
    const middle = tokenFor('middle@example.invalid');
    await sign(middle, tasksOf(await viewFor(middle)).find(task => task.state === 'ready'));
    await runtime.drain();
    assert.equal(tasksOf(await viewFor(lawyer)).find(task => task.taskId === later.taskId).state, 'ready');
    // A delayed replay of the first approval cannot expand into the newly ready PDF.
    const replay = ok(await pub('post', `/sessions/${old.session.sessionId}/accept`, lawyer).set('Idempotency-Key', old.key).send(old.payload));
    assert.equal(replay.reused, true);
    assert.equal((await f.pool.query('SELECT count(*)::integer AS count FROM signing_actions WHERE task_id=$1', [later.taskId])).rows[0].count, 0);
    const unauthorized = await pub('post', `/sessions/${old.session.sessionId}/accept`, lawyer).set('Idempotency-Key', randomUUID()).send({ consent: true, signature, values: { [later.taskId]: {} } });
    assert.equal(unauthorized.status, 409);
    const final = await sign(lawyer, later);
    assert.notEqual(final.session.sessionId, old.session.sessionId);
    assert.equal(codes.length, 3, 'one fresh OTP for each explicit stage, including the returning signer');
    await runtime.drain();
    assert.deepEqual(tasksOf(await viewFor(lawyer)).map(task => task.state), ['accepted', 'accepted']);
    assert.deepEqual(workerErrors, []);
});

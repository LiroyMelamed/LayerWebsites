const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

test('v2 creation from the product: explicit legacy import, row validation, approved preview, one durable run for 200 employees',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 240000 }, async t => {
    const f = await require('./helpers/signingTemplateFixture').signingTemplateFixture();
    t.after(() => f.pool.end());
    const jwt = require('jsonwebtoken');
    const { createRuntime, objectStorage } = require('../services/signingV2/runtime');
    const { fakeProvider } = require('./helpers/signingV2Delivery');
    const { r2 } = require('../utils/r2');
    Object.assign(process.env, { SIGNING_V2_ENABLED: 'true', SIGNING_DEPLOYMENT_KEY: `qa-${randomUUID()}.invalid` });
    t.after(() => { delete process.env.SIGNING_V2_ENABLED; delete process.env.SIGNING_DEPLOYMENT_KEY; });
    const as = (call, token = f.token) => call.set('Authorization', `Bearer ${token}`);
    const ok = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };

    const legacy = ok(await as(request(f.app).post('/api/signing-templates')).send(f.definition), 201).template;
    let listed = ok(await as(request(f.app).get('/api/signing-v2/templates')), 200);
    assert.deepEqual(listed.legacy.find(item => item.id === legacy.id).roles.map(role => role.audience), ['each', 'shared']);

    const client = (await f.pool.query(`INSERT INTO users(name,email,role,passwordhash) VALUES('Synthetic client',$1,'Client','synthetic-only') RETURNING userid`,
        [`${randomUUID()}@example.invalid`])).rows[0].userid;
    const clientToken = jwt.sign({ userid: client, role: 'Client' }, process.env.JWT_SECRET);
    assert.equal((await as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`), clientToken).send({})).status, 403);
    assert.equal((await as(request(f.app).post('/api/signing-v2/creation/preview'), clientToken).send({})).status, 403);

    const [first, again] = await Promise.all([0, 1].map(() => as(request(f.app).post(`/api/signing-v2/templates/legacy/${legacy.id}/import`)).send({ locale: 'he' })));
    assert.deepEqual([first.status, again.status].sort(), [200, 201], 'a double click imports once');
    assert.equal(first.body.versionId, again.body.versionId);
    const versionId = first.body.versionId;
    listed = ok(await as(request(f.app).get('/api/signing-v2/templates')), 200);
    assert.equal(listed.legacy.some(item => item.id === legacy.id), false, 'an imported version is not offered again');
    assert.deepEqual(listed.templates.map(item => item.versionId), [versionId]);
    const version = (await f.pool.query('SELECT definition FROM signing_template_versions WHERE id=$1', [versionId])).rows[0].definition;
    assert.deepEqual(version.documents[0].fields.map(field => [field.pageNum, field.x, field.y, field.roleKey]),
        f.definition.documents[0].fields.map(field => [field.pageNum, field.x, field.y, field.roleId]), 'coordinates are carried over unchanged');
    assert.equal(version.policy.otpRequired, true);

    const ExcelJS = require('exceljs');
    const download = await as(request(f.app).get(`/api/signing-v2/templates/${versionId}/workbook?locale=ar`)).buffer(true).parse((response, done) => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks)));
    });
    assert.equal(download.status, 200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(download.body);
    const sheet = book.getWorksheet('recipients');
    assert.equal(sheet.getRow(1).getCell(1).value, 'معرّف الصف');
    assert.equal(sheet.views[0].rightToLeft, true);
    sheet.getRow(2).values = ['E1', 'موظف تجريبي', '', 501234567, 'sms', 'ar'];
    sheet.getRow(3).values = ['E2', { formula: '1+1' }, 'x@example.invalid', '', 'email', ''];
    sheet.getRow(4).values = ['E3', 'Synthetic Three', 'three@example.invalid', '', '', 'en'];
    const parsed = ok(await as(request(f.app).post(`/api/signing-v2/templates/${versionId}/workbook`)).send({ base64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64') }), 200);
    assert.deepEqual(parsed.errors, [{ row: 3, code: 'UNSUPPORTED_CELL' }], 'formulas are rejected per row, never evaluated');
    assert.deepEqual(parsed.rows.map(row => [row.key, row.recipients.first.phone, row.recipients.first.channel || null, row.recipients.first.locale]),
        [['E1', '0501234567', 'sms', 'ar'], ['E3', '', null, 'en']], 'a numeric mobile number keeps its leading zero');

    const lawyer = { name: 'עו״ד בדיקה', email: 'lawyer@example.invalid', channel: 'email', locale: 'he' };
    const employee = index => ({ key: `E${String(index).padStart(3, '0')}`,
        recipients: { first: { name: `עובד ${index}`, email: `employee-${index}@example.invalid`, channel: 'email', locale: ['he', 'ar', 'en'][index % 3] } } });
    const broken = { name: 'October', templateVersionId: versionId, shared: { shared: lawyer },
        rows: [employee(1), { key: 'E001', recipients: { first: { name: '', email: 'not-an-email', channel: 'email' } } }, { recipients: { first: { name: 'SMS only', phone: '12', channel: 'sms' } } }] };
    const invalid = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(broken), 200);
    assert.equal(invalid.valid, false);
    assert.deepEqual(invalid.errors.map(error => `${error.path}:${error.code}`).sort(),
        ['rows.1.first.email:INVALID_EMAIL', 'rows.1.first.name:NAME_REQUIRED', 'rows.1.key:DUPLICATE_ROW_KEY', 'rows.2.first.phone:INVALID_PHONE', 'rows.2.first.phone:PHONE_REQUIRED'].sort());
    const contextId = (await f.pool.query('SELECT id FROM signing_owner_contexts WHERE deployment_key=$1', [process.env.SIGNING_DEPLOYMENT_KEY])).rows[0].id;
    assert.equal((await f.pool.query('SELECT count(*)::integer AS count FROM signing_people WHERE owner_context_id=$1', [contextId])).rows[0].count, 0, 'preview writes nothing');

    const body = { name: 'October employees', templateVersionId: versionId, shared: { shared: lawyer }, rows: Array.from({ length: 200 }, (_, index) => employee(index + 1)) };
    body.rows[7].recipients.first = { name: 'Phone signer', phone: '050-123-4567', channel: 'sms', locale: 'ar' };
    const preview = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(body), 200);
    assert.equal(preview.valid, true, JSON.stringify(preview.errors));
    assert.equal(preview.packageCount, 200);
    assert.equal(preview.documentCount, 200);

    const changed = structuredClone(body); changed.rows[3].recipients.first.name = 'Edited after preview';
    assert.equal((await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID()).send({ ...changed, previewHash: preview.previewHash })).status, 412,
        'a change after the approved preview is never created silently');

    const key = randomUUID();
    const started = Date.now();
    const created = await Promise.all([0, 1].map(() => as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', key).send({ ...body, previewHash: preview.previewHash })));
    const elapsed = Date.now() - started;
    assert.deepEqual(created.map(item => item.status).sort(), [200, 201], JSON.stringify(created.map(item => item.body)));
    assert.equal(created[0].body.submissionId, created[1].body.submissionId);
    assert.equal(created[0].body.durable, true);
    t.diagnostic(`two parallel identical create requests for 200 packages answered in ${elapsed} ms`);
    const submissionId = created[0].body.submissionId;
    const counts = (await f.pool.query(`SELECT (SELECT count(*) FROM signing_submissions WHERE owner_context_id=$2)::integer AS submissions,
        (SELECT count(*) FROM signing_packages WHERE submission_id=$1)::integer AS packages,
        (SELECT count(*) FROM signing_people WHERE owner_context_id=$2)::integer AS people,
        (SELECT count(DISTINCT person_id) FROM signing_participations WHERE owner_context_id=$2 AND role_key='shared')::integer AS shared`, [submissionId, contextId])).rows[0];
    assert.deepEqual(counts, { submissions: 1, packages: 200, people: 201, shared: 1 }, 'one run, one shared signer across all packages, no duplicate people');

    const other = structuredClone(body); other.name = 'Different content';
    const otherPreview = ok(await as(request(f.app).post('/api/signing-v2/creation/preview')).send(other), 200);
    assert.equal((await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', key).send({ ...other, previewHash: otherPreview.previewHash })).status, 409,
        'the same key with different content is rejected');
    const second = ok(await as(request(f.app).post('/api/signing-v2/creation')).set('Idempotency-Key', randomUUID()).send({ ...body, previewHash: preview.previewHash }), 201);
    assert.notEqual(second.submissionId, submissionId, 'a new run from the same template stays a separate row');
    const runs = ok(await as(request(f.app).get('/api/signing-v2/submissions?state=all')), 200);
    assert.equal(runs.rows.length, 2);

    const provider = fakeProvider();
    const runtime = createRuntime({ pool: f.pool, env: { ...process.env, SIGNING_V2_GRANT_KEY: Buffer.alloc(32, 7).toString('base64'), WEBSITE_DOMAIN: 'qa.example.invalid', SIGNING_V2_RENDERERS: '2' },
        storage: objectStorage({ client: r2, bucket: 'qa' }), provider, contextIds: [contextId], log: { log() {}, error() {} } });
    t.after(() => runtime.stop());
    await runtime.drain();
    const states = (await f.pool.query(`SELECT r.workflow_state,count(*)::integer AS count FROM signing_packages p
        JOIN signing_package_revisions r ON r.owner_context_id=p.owner_context_id AND r.id=p.active_revision_id
        WHERE p.submission_id=$1 GROUP BY 1`, [submissionId])).rows;
    assert.deepEqual(states, [{ workflow_state: 'active', count: 200 }]);
    const sent = provider.calls.filter(call => call.url.startsWith('https://qa.example.invalid/ViewSignedDocument/Sign#'));
    assert.equal(sent.length, provider.calls.length);
    assert.ok(provider.calls.some(call => call.channel === 'sms' && call.endpoint === '+972501234567' && call.locale === 'ar'));
    const lawyerLinks = provider.calls.filter(call => call.endpoint === 'lawyer@example.invalid').map(call => call.url);
    assert.equal(lawyerLinks.length, 2, 'the shared signer receives one invitation per run, not one per package');
    assert.equal(new Set(lawyerLinks).size, 2, 'each run has its own link');
    const bundled = (await f.pool.query(`SELECT count(*)::integer AS count FROM signing_deliveries WHERE owner_context_id=$1
        AND state='bundled' AND (target_snapshot->>'endpoint')='lawyer@example.invalid'`, [contextId])).rows[0].count;
    assert.equal(bundled, 398);
});

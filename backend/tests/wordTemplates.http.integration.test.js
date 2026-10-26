'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const AdmZip = require('adm-zip');
const jwt = require('jsonwebtoken');
const { bytesHash } = require('../lib/signingV2/canonical');
const { createFixture, SOCKET, ROOT } = require(path.resolve(__dirname, '../../../../outputs/workflow-improvements-20261023/http-qa/fixture.cjs'));

function sourceDocx() {
    const zip = new AdmZip();
    const entries = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Client ____</w:t></w:r></w:p></w:body></w:document>',
    };
    for (const [name, text] of Object.entries(entries)) { zip.addFile(name, Buffer.from(text)); zip.getEntry(name).header.time = new Date('2026-10-23T00:00:00Z'); }
    return zip.toBuffer();
}

test('Word HTTP boundaries with actual JWT, current DB permissions, scoped SQL, and exact private PDF reads', {
    skip: process.env.WORD_HTTP_TEST_SOCKET !== SOCKET, timeout: 60000,
}, async t => {
    const f = await createFixture(); t.after(() => f.close());
    const statuses = [];
    const countRows = async () => Number((await f.db.query('SELECT count(*) n FROM signing_word_previews')).rows[0].n);
    let source, preview;
    const request = async (...args) => { const result = await f.request(...args); statuses.push({ method: args[0], route: args[1] || '/', status: result.status }); return result; };
    const previewBody = () => ({ expectedVersion: source.version, bindingsHash: source.bindingsHash,
        inputs: { clientId: 4, manualValues: {}, roleClientIds: {} } });

    await t.test('no token, invalid signature and expired token are denied before Word/storage work', async () => {
        const before = f.counters();
        const bad = jwt.sign({ userid: 1, role: 'Admin' }, 'synthetic-wrong-test-secret');
        const expired = jwt.sign({ userid: 1, role: 'Admin', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
        for (const actor of [null, bad, expired]) assert.equal((await request('GET', '', { actor })).status, 401);
        assert.deepEqual(f.counters(), before);
        assert.equal(Number((await f.db.query('SELECT count(*) n FROM signing_owner_contexts')).rows[0].n), 0);
    });
    await t.test('current DB role, upload permission and server tenant defeat valid-but-ineligible or stale JWTs', async () => {
        assert.equal((await request('GET', '', { actor: 'foreign' })).status, 403);
        assert.equal((await request('GET', '', { actor: 'client' })).status, 403);
        assert.equal((await request('GET', '', { actor: 'reader' })).status, 403);
        assert.equal((await request('GET', '', { actor: 'revoked' })).status, 401);
        await f.db.query('UPDATE firm_staff_roles SET is_active=false WHERE id=$1', [f.FULL]);
        assert.equal((await request('GET')).status, 403);
        await f.db.query('UPDATE firm_staff_roles SET is_active=true WHERE id=$1', [f.FULL]);
        assert.equal((await request('GET')).status, 200);
    });
    await t.test('actual JSON import/save rebuilds anchors and does not accept body owner or tenant overrides', async () => {
        f.uploads.set('users/1/http-source.docx', sourceDocx());
        const imported = await request('POST', '', { body: { name: 'Synthetic HTTP source', fileKey: 'users/1/http-source.docx',
            userId: 2, tenantId: f.B, contextId: randomUUID() } });
        assert.equal(imported.status, 201); source = imported.json.source;
        assert.equal(source.model.parts[0].paragraphs[0].text, 'Client ____');
        const saved = await request('PUT', `/${source.id}`, { body: { expectedVersion: source.version, sourceHash: source.sourceHash,
            name: source.name, roles: [], bindings: [{ id: 'client', part: 'word/document.xml', paragraphId: 'p0', start: 7, end: 11, field: 'client.fullName' }] } });
        assert.equal(saved.status, 200); source = saved.json.source;
        assert.equal(source.version, 2); assert.ok(source.bindings[0].paragraphHash);
        const row = (await f.db.query('SELECT created_by,c.law_firm_tenant_id FROM signing_word_sources s JOIN signing_owner_contexts c ON c.id=s.owner_context_id WHERE s.id=$1', [source.id])).rows[0];
        assert.equal(row.created_by, 1); assert.equal(row.law_firm_tenant_id, f.A);
    });
    await t.test('other all-firm author cannot see source; foreign tenant cannot reach it', async () => {
        const list = await request('GET', '', { actor: 'other' }); assert.equal(list.status, 200); assert.deepEqual(list.json.sources, []);
        assert.equal((await request('GET', `/${source.id}`, { actor: 'other' })).status, 404);
        assert.equal((await request('GET', `/${source.id}`, { actor: 'foreign' })).status, 403);
    });
    await t.test('idempotency header survives HTTP and overrides body key; no header cannot create a PDF', async () => {
        const header = randomUUID();
        const first = await request('POST', `/${source.id}/previews`, { body: { ...previewBody(), idempotencyKey: 'body-must-not-win' }, headers: { 'Idempotency-Key': header } });
        assert.equal(first.status, 201); preview = first.json.preview;
        const second = await request('POST', `/${source.id}/previews`, { body: { ...previewBody(), idempotencyKey: 'different-body-key' }, headers: { 'Idempotency-Key': header } });
        assert.equal(second.status, 201); assert.equal(second.json.preview.id, preview.id);
        assert.equal(f.counters().conversions, 1); assert.equal(await countRows(), 1);
        const noHeader = await request('POST', `/${source.id}/previews`, { body: { ...previewBody(), idempotencyKey: randomUUID() } });
        assert.equal(noHeader.status, 422); assert.equal(noHeader.json.errorCode, 'INVALID_IDEMPOTENCY_KEY'); assert.equal(await countRows(), 1);
        assert.equal((await f.db.query('SELECT idempotency_key FROM signing_word_previews')).rows[0].idempotency_key, header);
    });
    await t.test('protected metadata and PDF have no-store, nosniff, safe inline name and exact hash over HTTP bytes', async () => {
        const metadata = await request('GET', `/previews/${preview.id}`); assert.equal(metadata.status, 200);
        assert.equal(metadata.json.preview.requiresFreshSigningGeometry, true);
        const pdf = await request('GET', `/previews/${preview.id}/pdf`);
        assert.equal(pdf.status, 200); assert.equal(pdf.headers['cache-control'], 'private, no-store');
        assert.equal(pdf.headers['x-content-type-options'], 'nosniff'); assert.equal(pdf.headers['content-type'], 'application/pdf');
        assert.equal(pdf.headers['content-disposition'], 'inline; filename="document.pdf"');
        assert.equal(bytesHash(pdf.bytes), preview.pdfHash); assert.deepEqual(pdf.bytes, f.output);
        assert.equal((await request('GET', `/previews/${preview.id}/pdf`, { actor: null })).status, 401);
        assert.equal((await request('GET', `/previews/${preview.id}/pdf`, { actor: 'other' })).status, 404);
        assert.equal((await request('GET', `/previews/${preview.id}`, { actor: 'other' })).status, 404);
    });
    await t.test('current client permission and upload permission are re-read for already-created private PDF', async () => {
        const withoutClients = structuredClone(f.fullPermissions); withoutClients.areas.clients.actions = [];
        await f.db.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1', [f.FULL, withoutClients]);
        assert.equal((await request('GET', `/previews/${preview.id}`)).status, 404);
        assert.equal((await request('GET', `/previews/${preview.id}/pdf`)).status, 404);
        await f.db.query('UPDATE users SET firm_staff_role_id=$2 WHERE userid=$1', [1, f.READER]);
        assert.equal((await request('GET', `/previews/${preview.id}/pdf`)).status, 403);
        await f.db.query('UPDATE users SET firm_staff_role_id=$2 WHERE userid=$1', [1, f.FULL]);
        await f.db.query('UPDATE firm_staff_roles SET permissions=$2 WHERE id=$1', [f.FULL, f.fullPermissions]);
        assert.equal((await request('GET', `/previews/${preview.id}/pdf`)).status, 200);
    });
    await t.test('same-length private storage corruption never escapes the HTTP route as reviewed PDF', async () => {
        const key = (await f.db.query('SELECT object_key FROM signing_word_previews WHERE id=$1', [preview.id])).rows[0].object_key;
        const original = f.files.get(key); f.files.set(key, Buffer.alloc(original.length, 32));
        const result = await request('GET', `/previews/${preview.id}/pdf`);
        assert.equal(result.status, 422); assert.equal(result.json.errorCode, 'ARTIFACT_HASH_MISMATCH');
        assert.ok(!result.headers['content-type'].includes('application/pdf')); f.files.set(key, original);
    });
    await t.test('converter operational errors preserve HTTP503/504/500, safe code/key, no private diagnostic or row', async () => {
        for (const [code, status] of [['WORD_CONVERSION_NOT_CONFIGURED', 503], ['WORD_CONVERSION_TIMEOUT', 504], ['WORD_CONVERSION_FAILED', 500]]) {
            f.setFailure(code);
            const result = await request('POST', `/${source.id}/previews`, { body: previewBody(), headers: { 'Idempotency-Key': randomUUID() } });
            assert.equal(result.status, status); assert.equal(result.json.errorCode, code);
            assert.equal(result.json.messageKey, 'signingWord.requestFailed'); assert.ok(!result.bytes.includes(Buffer.from('MUST_NOT_ESCAPE_PRIVATE')));
            assert.equal(result.json.details, undefined); assert.equal(result.json.stack, undefined); assert.equal(await countRows(), 1);
        }
        f.setFailure(null);
    });
    await t.test('HTTP body size limit is413 with no leaked body; invalid source schema is422', async () => {
        const before = f.counters();
        const oversized = await request('POST', '', { body: { name: 'X'.repeat(2 * 1024 * 1024 + 1) } });
        assert.equal(oversized.status, 413); assert.equal(oversized.json.errorCode, 'REQUEST_TOO_LARGE');
        const invalid = await request('POST', '', { body: [] }); assert.equal(invalid.status, 422);
        assert.deepEqual(f.counters(), before);
    });
    await t.test('disabled signing policy and feature flag block current private artifacts', async () => {
        process.env.SIGNING_ENABLED = 'false'; assert.equal((await request('GET', `/previews/${preview.id}/pdf`)).status, 403);
        assert.equal((await f.db.query("SELECT count(*)::int n FROM audit_events WHERE event_type='SIGNING_BLOCKED_BY_POLICY'")).rows[0].n, 1);
        process.env.SIGNING_ENABLED = 'true'; process.env.SIGNING_V2_ENABLED = 'false';
        assert.equal((await request('GET', `/previews/${preview.id}/pdf`)).status, 404); process.env.SIGNING_V2_ENABLED = 'true';
    });
    fs.writeFileSync(path.join(ROOT, 'outputs/workflow-improvements-20261023/http-qa/http-statuses.json'), JSON.stringify({ statuses,
        privatePdfSHA256: preview.pdfHash, expectedPdfBytes: f.output.length, counters: f.counters(),
        limits: 'Actual localhost HTTP/JWT/incumbent permission middleware/actorScope/Word routes/service/isolated SQL; fake private storage and converter. No app boot, tenant resolver, external transport, browser, production or alerts proof.' }, null, 2) + '\n');
});

// Separately selectable so fixing the generic parser branch never reruns the
// eleven unchanged JWT/private-Word boundary scenarios above.
test('Word malformed JSON classification over HTTP and exact error predicate', {
    skip: process.env.WORD_HTTP_TEST_SOCKET !== SOCKET, timeout: 60000,
}, async t => {
    const f = await createFixture(); t.after(() => f.close());
    await t.test('malformed JSON receives safe400 before Word or storage work', async () => {
        const before = f.counters();
        for (const raw of ['{"name":', '{"name":"SYNTHETIC_PRIVATE_BODY",}']) {
            const result = await f.request('POST', '', { raw });
            assert.equal(result.status, 400); assert.equal(result.json.errorCode, 'VALIDATION_ERROR');
            assert.equal(result.json.details, undefined); assert.equal(result.json.stack, undefined);
            assert.ok(!result.bytes.includes(Buffer.from('SYNTHETIC_PRIVATE_BODY')));
        }
        assert.deepEqual(f.counters(), before);
    });
    await t.test('only exact body-parser parsefailed400 maps; unrelated syntax or other statuses keep500', () => {
        const handler = require('../middlewares/errorHandler');
        function responseFor(error) {
            let status, payload;
            handler(error, {}, { headersSent: false, status(value) { status = value; return this; }, json(value) { payload = value; return this; } }, () => assert.fail('unexpected next'));
            return { status, payload };
        }
        const mapped = responseFor(Object.assign(new SyntaxError('SYNTHETIC_PRIVATE_BODY'), { type: 'entity.parse.failed', status: 400, body: 'SYNTHETIC_PRIVATE_BODY' }));
        assert.equal(mapped.status, 400); assert.equal(mapped.payload.errorCode, 'VALIDATION_ERROR'); assert.equal(mapped.payload.details, undefined);
        for (const error of [new SyntaxError('synthetic internal failure'),
            { type: 'entity.parse.failed', status: 401 }, { type: 'entity.parse.failed' }, { type: 'unrelated.type', status: 400 }]) {
            const kept = responseFor(error); assert.equal(kept.status, 500); assert.equal(kept.payload.errorCode, 'INTERNAL_ERROR');
            assert.equal(kept.payload.details, undefined);
        }
    });
});

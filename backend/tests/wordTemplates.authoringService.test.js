'use strict';
// In-memory PostgreSQL + immutable memory objects. No socket, URL, application
// database, real converter or delivery/provider dependency is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const service = require('../services/signingV2/wordTemplates');
const core = require('../lib/wordTemplates');
const visual = require('../lib/wordTemplates/visual');
const { digest } = require('../lib/signingV2/canonical');
const { clientDocumentValues } = require('../lib/wordTemplates/clientValues');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const contextId = '20000000-0000-4000-8000-000000000001';
const scope = { contextId, userId: 1, tenantId: null, send: true, all: true, clientView: true, caseView: true, caseAll: false };
const error = expected => caught => { assert.equal(caught.errorCode || caught.code, expected); return true; };
function docx(text = 'Name Ada Example and Ada Example') {
    const zip = new AdmZip();
    const entries = { '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` };
    for (const [key, value] of Object.entries(entries)) zip.addFile(key, Buffer.from(value));
    return zip.toBuffer();
}
async function fixture(t, { birthDate = true, court = false } = {}) {
    const pg = new PGlite(); t.after(() => pg.close());
    const trace = [];
    const query = (sql, values) => { trace.push(sql); return pg.query(sql, values); };
    const pool = { query, connect: async () => ({ query, release() {} }) };
    await pg.exec(`CREATE TABLE signing_owner_contexts(id uuid PRIMARY KEY);
        CREATE TABLE users(userid integer PRIMARY KEY,name text,email text,phonenumber text,companyname text,role text,
            law_firm_tenant_id uuid,client_profile jsonb DEFAULT '{}'${birthDate ? ',dateofbirth date' : ''});
        CREATE TABLE cases(caseid integer PRIMARY KEY,casename text,law_firm_tenant_id uuid);
        CREATE TABLE case_users(caseid integer,userid integer);
        CREATE TABLE signingfiles(id integer);`);
    await pg.query('INSERT INTO signing_owner_contexts VALUES($1)', [contextId]);
    await pg.exec("INSERT INTO users(userid,name,role) VALUES(1,'Synthetic author','Admin'),(2,'Other synthetic author','Admin'),(3,'Synthetic client','Client'); INSERT INTO cases VALUES(9,'Synthetic case',null); INSERT INTO case_users VALUES(9,1);");
    if (court) await pg.exec('CREATE TABLE court_case_links(case_id integer,law_firm_tenant_id uuid,court_number text,is_primary boolean)');
    const migrations = ['2026-10-23_01_signing_word_sources.sql', '2026-10-26_01_signing_word_authoring_renders.sql'];
    const migrationHashes = {};
    for (const file of migrations) {
        const raw = fs.readFileSync(path.join(__dirname, '../migrations', file)); migrationHashes[file] = hash(raw); await pg.exec(raw.toString());
    }
    t.diagnostic('Consumed migration SHA256 ' + JSON.stringify(migrationHashes));
    t.after(() => { for (const file of migrations) assert.equal(hash(fs.readFileSync(path.join(__dirname, '../migrations', file))), migrationHashes[file]); });
    const objects = new Map(), uploads = new Map();
    const storage = { objects, uploads,
        async readUpload(key) { assert.ok(uploads.has(key)); return Buffer.from(uploads.get(key)); },
        async write(key, bytes) { if (objects.has(key)) assert.deepEqual(objects.get(key), bytes); objects.set(key, Buffer.from(bytes)); },
        async verify(key, size, digest) { assert.equal(objects.get(key).length, size); assert.equal(hash(objects.get(key)), digest); },
        async read(key, size) { assert.ok(objects.has(key)); assert.equal(objects.get(key).length, size); return Buffer.from(objects.get(key)); } };
    const conversions = [];
    const convertDocxToPdf = async bytes => {
        conversions.push(core.importDocx(bytes));
        const pdf = await PDFDocument.create(); pdf.addPage([600, 800]); const buffer = Buffer.from(await pdf.save());
        return { buffer, format: 'pdf', sourceHash: hash(bytes), outputHash: hash(buffer), requiresFreshSigningGeometry: true, pageCount: 1 };
    };
    const buildAuthoringMap = async model => visual.buildAuthoringMap(model, [{ pageNum: 1, width: 600, height: 800,
        rotation: 0, userUnit: 1, viewBox: [0, 0, 600, 800], viewportTransform: [1, 0, 0, -1, 0, 800],
        items: model.parts[0].paragraphs.map((p, i) => ({ id: 'item' + i, text: p.text, dir: 'ltr', transform: [12, 0, 0, 12, 50, 700], width: 400, height: 12, hasEOL: true })) }]);
    const dependencies = { storage, convertDocxToPdf, buildAuthoringMap };
    async function imported(text) {
        const key = `users/1/${randomUUID()}.docx`; uploads.set(key, docx(text));
        return service.importSource(pool, scope, { name: 'Synthetic ready Word source', fileKey: key }, dependencies);
    }
    return { pg, pool, trace, storage, conversions, dependencies, imported };
}
const selector = (start, end) => ({ kind: 'range', start: { itemId: 'item0', offset: start }, end: { itemId: 'item0', offset: end } });

test('actual authoring SQL saves server-resolved independent ranges, reuses original render and keeps it private', async t => {
    const f = await fixture(t), source = await f.imported();
    const view = await service.authoringRender(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash }, f.dependencies);
    assert.equal(view.schemaVersion, 2); assert.equal(view.sourceHash, source.sourceHash); assert.ok(view.catalog.fields.length);
    const input = { expectedVersion: 1, sourceHash: source.sourceHash, mapHash: view.mapHash, selector: selector(5, 16) };
    const first = await service.authoringSelection(f.pool, scope, source.id, view.renderId, input, f.dependencies);
    const second = await service.authoringSelection(f.pool, scope, source.id, view.renderId, { ...input, selector: selector(21, 32) }, f.dependencies);
    assert.equal(first.selectedText, 'Ada Example'); assert.equal(second.selectedText, 'Ada Example');
    assert.notEqual(first.anchor.start, second.anchor.start);
    const saved = await service.save(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name,
        bindingSchemaVersion: 2, authoringRenderId: view.renderId, authoringMapHash: view.mapHash,
        roles: [{ key: 'other', label: 'Other' }], bindings: [{ id: 'one', field: 'client.fullName', selector: input.selector },
            { id: 'two', field: 'role.other.fullName', selector: selector(21, 32) }] }, f.dependencies);
    assert.equal(saved.version, 2); assert.equal(saved.bindings.length, 2);
    const reused = await service.authoringRender(f.pool, scope, source.id, { expectedVersion: 2, sourceHash: source.sourceHash }, f.dependencies);
    assert.equal(reused.renderId, view.renderId); assert.equal(reused.renderSourceVersion, 1); assert.equal(reused.sourceVersion, 2);
    assert.equal(f.conversions.length, 1);
    await assert.rejects(service.authoringInfo(f.pool, { ...scope, userId: 2 }, view.renderId, f.dependencies), error('NOT_FOUND'));
    await assert.rejects(service.authoringSelection(f.pool, scope, source.id, view.renderId, input, f.dependencies), error('WORD_AUTHORING_RENDER_CHANGED'));
    const original = (await f.pg.query('SELECT source_sha256 FROM signing_word_sources WHERE id=$1', [source.id])).rows[0];
    assert.equal(original.source_sha256, source.sourceHash);
});

test('authoring map and PDF storage tampering are rejected against immutable hashes', async t => {
    const f = await fixture(t), source = await f.imported();
    const view = await service.authoringRender(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash }, f.dependencies);
    const row = (await f.pg.query('SELECT * FROM signing_word_authoring_renders')).rows[0];
    const map = Buffer.from(f.storage.objects.get(row.map_object_key));
    f.storage.objects.set(row.map_object_key, Buffer.alloc(map.length, 32));
    await assert.rejects(service.authoringInfo(f.pool, scope, view.renderId, f.dependencies), error('ARTIFACT_HASH_MISMATCH'));
    f.storage.objects.set(row.map_object_key, map);
    const pdf = f.storage.objects.get(row.pdf_object_key); f.storage.objects.set(row.pdf_object_key, Buffer.alloc(pdf.length));
    await assert.rejects(service.authoringPdf(f.pool, scope, view.renderId, f.dependencies), error('ARTIFACT_HASH_MISMATCH'));
    await assert.rejects(f.pg.query('UPDATE signing_word_authoring_renders SET page_count=2'), { code: '23514' });
    await assert.rejects(f.pg.query('DELETE FROM signing_word_authoring_renders'), { code: '23514' });
});

test('mapping version changes during conversion stop before an authoring row is committed', async t => {
    const f = await fixture(t), source = await f.imported();
    const convert = f.dependencies.convertDocxToPdf;
    await assert.rejects(service.authoringRender(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash }, {
        ...f.dependencies, async convertDocxToPdf(bytes) {
            await service.save(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name, roles: [], bindings: [] }, f.dependencies);
            return convert(bytes);
        } }), error('VERSION_CHANGED'));
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM signing_word_authoring_renders')).rows[0].n, 0);
});

test('visual caret insertion survives SQL save and mutates a fresh DOCX/PDF, legacy raw insertion is refused', async t => {
    const f = await fixture(t), source = await f.imported('Name: end');
    const view = await service.authoringRender(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash }, f.dependencies);
    const selected = { kind: 'insert', start: { itemId: 'item0', offset: 5 }, affinity: 'before' };
    const saved = await service.save(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name, roles: [],
        bindingSchemaVersion: 2, authoringRenderId: view.renderId, authoringMapHash: view.mapHash,
        bindings: [{ id: 'insert', field: 'client.fullName', selector: selected }] }, f.dependencies);
    assert.equal(saved.bindings[0].kind, 'insert');
    const preview = await service.preview(f.pool, scope, source.id, { expectedVersion: 2, bindingsHash: saved.bindingsHash,
        idempotencyKey: randomUUID(), inputs: { manualValues: { 'client.fullName': ' Ada' }, roleClientIds: {} } }, f.dependencies);
    assert.equal(preview.requiresFreshSigningGeometry, true);
    assert.equal(f.conversions.at(-1).parts[0].paragraphs[0].text, 'Name: Ada end');
    await assert.rejects(service.save(f.pool, scope, source.id, { expectedVersion: 2, sourceHash: source.sourceHash, name: source.name, roles: [],
        bindings: saved.bindings }, f.dependencies), error('WORD_AUTHORING_RENDER_REQUIRED'));
});

test('new stored DOB and court number preserve calendar date and remain distinct from internal case ID', async t => {
    const f = await fixture(t, { court: true });
    await f.pg.query("UPDATE users SET dateofbirth='2000-02-29' WHERE userid=3");
    await f.pg.query("INSERT INTO court_case_links VALUES(9,null,'00042-10-2026',true),(9,null,'other-nonprimary',false)");
    const source = await f.imported('DOB date; Court number; Internal ID');
    const text = source.model.parts[0].paragraphs[0].text;
    const specs = [['client.birthDate', 'date'], ['case.courtNumber', 'number'], ['case.reference', 'ID']].map(([field, word], i) => ({
        id: 'b' + i, field, part: 'word/document.xml', paragraphId: 'p0', start: text.indexOf(word), end: text.indexOf(word) + word.length }));
    const saved = await service.save(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name, roles: [], bindings: specs }, f.dependencies);
    await service.preview(f.pool, scope, source.id, { expectedVersion: 2, bindingsHash: saved.bindingsHash, idempotencyKey: randomUUID(),
        inputs: { clientId: 3, caseId: 9, roleClientIds: {}, manualValues: {} } }, f.dependencies);
    assert.equal(f.conversions.at(-1).parts[0].paragraphs[0].text, 'DOB 2000-02-29; Court 00042-10-2026; Internal 9');
    assert.ok(f.trace.some(sql => sql.includes("to_char((to_jsonb(users)->>'dateofbirth')::date,'YYYY-MM-DD')")));
    await f.pg.query("INSERT INTO court_case_links VALUES(9,null,'second-primary',true)");
    await assert.rejects(service.preview(f.pool, scope, source.id, { expectedVersion: 2, bindingsHash: saved.bindingsHash, idempotencyKey: randomUUID(),
        inputs: { clientId: 3, caseId: 9, roleClientIds: {}, manualValues: {} } }, f.dependencies), error('WORD_CASE_COURT_NUMBER_AMBIGUOUS'));
});

test('legacy seven-field values hash/idempotency survives old schema without birthdate or court table', async t => {
    const f = await fixture(t, { birthDate: false }), source = await f.imported('Name Existing');
    const saved = await service.save(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name,
        roles: [], bindings: [{ id: 'name', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 5, end: 13 }] }, f.dependencies);
    const input = { expectedVersion: 2, bindingsHash: saved.bindingsHash, idempotencyKey: randomUUID(), inputs: { clientId: 3, roleClientIds: {}, manualValues: {} } };
    const first = await service.preview(f.pool, scope, source.id, input, f.dependencies);
    const second = await service.preview(f.pool, scope, source.id, input, f.dependencies);
    assert.equal(first.id, second.id); assert.equal(f.conversions.length, 1);
    const row = (await f.pg.query('SELECT values_hash FROM signing_word_previews WHERE id=$1', [first.id])).rows[0];
    assert.equal(row.values_hash, digest(clientDocumentValues({ name: 'Synthetic client', client_profile: {} })));
    assert.equal(f.trace.some(sql => sql.includes('/*word:court-')), false);
    assert.equal(f.trace.some(sql => sql.includes('to_char(')), false);
});

test('cached authoring response refuses a concurrent metadata-version advance during private map read', async t => {
    const f = await fixture(t), source = await f.imported();
    await service.authoringRender(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash }, f.dependencies);
    let advanced = false;
    // A concurrent source metadata save wins between the initial version check
    // and loadAuthoringRender's second source snapshot.
    const query = f.pool.query;
    let existingFound = false;
    const racingPool = { ...f.pool, async query(sql, values) {
        const answer = await query(sql, values);
        if (sql.includes('/*word:authoring-existing*/')) existingFound = true;
        if (existingFound && sql.includes('/*word:source*/') && !advanced) {
            advanced = true;
            await service.save(f.pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name, roles: [], bindings: [] }, f.dependencies);
            return query(sql, values);
        }
        return answer;
    } };
    await assert.rejects(service.authoringRender(racingPool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash }, f.dependencies), error('VERSION_CHANGED'));
    assert.equal(f.conversions.length, 1, 'Cached response does not reconvert');
});

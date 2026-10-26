'use strict';

// Explicit, socket-only synthetic PostgreSQL opt-in. Never use app DB settings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const service = require('../services/signingV2/wordTemplates');
const { importDocx, WordTemplateError } = require('../lib/wordTemplates');
const { bytesHash } = require('../lib/signingV2/canonical');
const SOCKET = '/tmp/codex-word-service-55489-socket';
const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000001';
const CA = 'a0000000-0000-4000-8000-000000000002';
const CB = 'b0000000-0000-4000-8000-000000000002';
const scope = { contextId: CA, userId: 1, tenantId: A, send: true, all: true, clientView: true, caseView: true, caseAll: false };
const other = { ...scope, userId: 3 };
const foreign = { ...scope, contextId: CB, userId: 2, tenantId: B };
const error = code => caught => { assert.equal(caught.errorCode || caught.code, code); assert.ok(!caught.meta); return true; };
function docx(fields = ['client.fullName']) {
    const zip = new AdmZip();
    const entries = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${fields.map(field => `<w:p><w:r><w:t>${field} ____</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
    };
    for (const [name, text] of Object.entries(entries)) { zip.addFile(name, Buffer.from(text)); zip.getEntry(name).header.time = new Date('2026-10-23T00:00:00Z'); }
    return zip.toBuffer();
}
function fakeStorage() {
    const files = new Map();
    const uploads = new Map();
    const reads = [];
    return { files, uploads, reads,
        async readUpload(key, maximum) { reads.push({ key, maximum }); if (!uploads.has(key)) throw new Error('fixture missing'); return Buffer.from(uploads.get(key)); },
        async read(key, exact) { const value = files.get(key); assert.ok(value, 'private object exists'); assert.equal(value.length, exact, 'storage exact-byte contract'); return Buffer.from(value); },
        async write(key, value) { if (files.has(key)) assert.deepEqual(files.get(key), value, 'immutable object cannot change bytes'); files.set(key, Buffer.from(value)); },
        async verify(key, exact, hash) { assert.equal(files.get(key).length, exact); assert.equal(bytesHash(files.get(key)), hash); },
    };
}

// A fake converter accepts real materialized OOXML and produces a real valid PDF.
// It does not test LibreOffice or typography; those have independent evidence.
test('private Word library and per-use PDF service on isolated PostgreSQL', { skip: process.env.WORD_SERVICE_TEST_SOCKET !== SOCKET }, async t => {
    const db = new Pool({ host: SOCKET, port: 55489, user: 'word_service_test_owner', database: 'postgres', max: 8 });
    t.after(() => db.end());
    assert.equal((await db.query('SELECT current_user AS name')).rows[0].name, 'word_service_test_owner');
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP ROLE IF EXISTS word_service_dml');
    await db.query(`CREATE TABLE users(userid integer PRIMARY KEY,name text,email text,phonenumber text,companyname text,role text,law_firm_tenant_id uuid,client_profile jsonb DEFAULT '{}');
        CREATE TABLE cases(caseid integer PRIMARY KEY,casename text,law_firm_tenant_id uuid);
        CREATE TABLE case_users(caseid integer REFERENCES cases,userid integer REFERENCES users);
        CREATE TABLE signing_owner_contexts(id uuid PRIMARY KEY);
        CREATE TABLE signingfiles(id integer);
        CREATE ROLE word_service_dml NOLOGIN; GRANT SELECT,INSERT,UPDATE,DELETE ON signingfiles TO word_service_dml;`);
    const profile = { version: 1, partyType: 'organization', identity: { type: 'national_id', number: '001234567', country: 'IL' },
        organization: { registrationType: 'company', registrationNumber: '005123456', registrationCountry: 'IL' }, address: { line1: 'Synthetic street', city: 'Test', country: 'IL' } };
    await db.query(`INSERT INTO users(userid,name,email,phonenumber,companyname,role,law_firm_tenant_id,client_profile) VALUES
        (1,'Owner A','owner-a@example.invalid','00001','','Admin',$1,'{}'),
        (2,'Owner B','owner-b@example.invalid','00002','','Admin',$2,'{}'),
        (3,'Other author','other@example.invalid','00003','','Admin',$1,'{}'),
        (4,'Person A','person-a@example.invalid','00004','Synthetic Ltd','User',$1,$3),
        (5,'Foreign person','foreign@example.invalid','00005','','User',$2,$3),
        (6,'Office lawyer','lawyer@example.invalid','00006','Office company','Lawyer',$1,$3),
        (7,'Deleted person','','','','Deleted',$1,$3),
        (8,'Person without assignment','unassigned@example.invalid','00008','','User',$1,'{}');
        `, [A, B, profile]);
    await db.query('INSERT INTO signing_owner_contexts VALUES($1),($2)', [CA, CB]);
    await db.query("INSERT INTO cases VALUES(101,'Synthetic case A',$1),(102,'Unassigned case',$1),(201,'Foreign case',$2)", [A, B]);
    await db.query('INSERT INTO case_users VALUES(101,1),(201,2)');
    const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/2026-10-23_01_signing_word_sources.sql'), 'utf8');
    await t.test('additive migration applies twice, copies signing grants and grants nothing to PUBLIC', async () => {
        await db.query(migration); await db.query(migration);
        assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE grantee='word_service_dml' AND table_name LIKE 'signing_word_%'`)).rows[0].n, 12);
        assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE grantee='PUBLIC' AND table_name LIKE 'signing_word_%'`)).rows[0].n, 0);
    });
    const storage = fakeStorage();
    let uploadIndex = 0;
    async function create(fields = ['client.fullName'], actor = scope) {
        const key = `users/${actor.userId}/word/${++uploadIndex}.docx`;
        storage.uploads.set(key, docx(fields));
        const imported = await service.importSource(db, actor, { name: `Synthetic ${uploadIndex}`, fileKey: key }, { storage });
        const bindings = fields.map((field, index) => ({ id: `b${index}`, part: 'word/document.xml', paragraphId: `p${index}`,
            start: field.length + 1, end: field.length + 5, field }));
        const roles = [...new Set(fields.filter(f => f.startsWith('role.')).map(f => f.split('.')[1]))].map(key => ({ key, label: key }));
        return service.save(db, actor, imported.id, { expectedVersion: imported.version, sourceHash: imported.sourceHash, name: imported.name, roles, bindings }, { storage });
    }
    const pdf = await PDFDocument.create(); pdf.addPage([612, 792]);
    const output = Buffer.from(await pdf.save());
    const conversions = [];
    let duringConversion;
    const convert = async buffer => {
        conversions.push({ hash: bytesHash(buffer), text: importDocx(buffer).parts.flatMap(p => p.paragraphs.map(v => v.text)) });
        if (duringConversion) await duringConversion();
        return { buffer: output, sourceHash: bytesHash(buffer), outputHash: bytesHash(output), pageCount: 1, converter: 'libreoffice', format: 'pdf', requiresFreshSigningGeometry: true };
    };
    const options = { storage, convertDocxToPdf: convert };
    const request = (source, overrides = {}) => ({ expectedVersion: source.version, bindingsHash: source.bindingsHash, idempotencyKey: randomUUID(), inputs: { clientId: 4, manualValues: {}, roleClientIds: {} }, ...overrides });
    let main;
    await t.test('source import reads bounded own upload, privately readbacks exact source and exposes text model without XML', async () => {
        main = await create(['client.fullName', 'client.identityNumber', 'client.companyNumber', 'role.lawyer.fullName', 'case.reference', 'case.title']);
        assert.equal(storage.reads[0].maximum, 20 * 1024 * 1024);
        assert.ok(storage.reads[0].key.startsWith('users/1/'));
        const loaded = await service.load(db, scope, main.id, { storage });
        assert.equal(loaded.sourceHash, main.sourceHash); assert.equal(loaded.model.parts[0].paragraphs.length, 6);
        assert.ok(!JSON.stringify(loaded.model).includes('<w:'));
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_source_versions WHERE source_id=$1', [main.id])).rows[0].n, 2);
    });
    await t.test('all-firm permission cannot list, load, save, archive or preview another author or tenant', async () => {
        const own = (await service.list(db, scope)).sources.find(row => row.id === main.id);
        assert.equal(own.bindingCount, 6); assert.equal(own.bindings, undefined); assert.equal(own.model, undefined);
        assert.equal((await service.list(db, other)).sources.length, 0);
        assert.equal((await service.list(db, foreign)).sources.length, 0);
        for (const actor of [other, foreign]) {
            await assert.rejects(service.load(db, actor, main.id, { storage }), error('NOT_FOUND'));
            await assert.rejects(service.save(db, actor, main.id, { expectedVersion: main.version, sourceHash: main.sourceHash, name: 'Attempt', roles: [], bindings: [] }, { storage }), error('NOT_FOUND'));
            await assert.rejects(service.archive(db, actor, main.id, { expectedVersion: main.version, archived: true }), error('NOT_FOUND'));
            await assert.rejects(service.preview(db, actor, main.id, request(main), options), error('NOT_FOUND'));
        }
    });
    await t.test('every public method requires send permission and trusted context/user identifiers', async () => {
        for (const actor of [{ ...scope, send: false }, { ...scope, contextId: 'body-tenant' }, { ...scope, userId: '1' }]) {
            await assert.rejects(service.list(db, actor));
            await assert.rejects(service.load(db, actor, main.id, { storage }));
        }
    });
    await t.test('foreign upload, traversal, malformed package and oversized upload are rejected before source creation', async () => {
        const before = (await service.list(db, scope)).sources.length;
        for (const fileKey of ['users/2/a.docx', 'users/1/../a.docx', 'users/1/a.docx?x=1', 'users/1/a.pdf', 'users/1/%2e%2e/a.docx']) {
            await assert.rejects(service.importSource(db, scope, { name: 'Bad', fileKey }, { storage }), error('INVALID_SOURCE'));
        }
        storage.uploads.set('users/1/not-word.docx', Buffer.from('not Word'));
        await assert.rejects(service.importSource(db, scope, { name: 'Bad', fileKey: 'users/1/not-word.docx' }, { storage }));
        storage.uploads.set('users/1/huge.docx', Buffer.alloc(20 * 1024 * 1024 + 1));
        await assert.rejects(service.importSource(db, scope, { name: 'Huge', fileKey: 'users/1/huge.docx' }, { storage }), error('INVALID_SOURCE'));
        assert.equal((await service.list(db, scope)).sources.length, before);
    });
    await t.test('mapping saves rebuild server anchors, enforce declared roles, overlap and CAS without editing prior versions', async () => {
        const original = structuredClone(main);
        const input = { expectedVersion: main.version, sourceHash: main.sourceHash, name: main.name, roles: main.roles,
            bindings: main.bindings.map(binding => ({ ...binding, paragraphHash: 'forged', selectedTextHash: 'forged' })) };
        main = await service.save(db, scope, main.id, input, { storage });
        assert.notEqual(main.bindings[0].paragraphHash, 'forged'); assert.equal(main.version, original.version + 1);
        const historical = (await db.query('SELECT * FROM signing_word_source_versions WHERE source_id=$1 AND version=$2', [main.id, original.version])).rows[0];
        assert.deepEqual(historical.bindings, original.bindings);
        await assert.rejects(service.save(db, scope, main.id, input, { storage }), error('VERSION_CHANGED'));
        const current = { ...input, expectedVersion: main.version };
        await assert.rejects(service.save(db, scope, main.id, { ...current, roles: [] }, { storage }), error('INVALID_WORD_ROLE'));
        await assert.rejects(service.save(db, scope, main.id, { ...current, bindings: [main.bindings[0], { ...main.bindings[0], id: 'overlap' }] }, { storage }), error('OVERLAPPING_BINDINGS'));
        assert.equal((await service.load(db, scope, main.id, { storage })).version, main.version);
    });
    await t.test('materializes separate leading-zero IDs, office role name and authorized case; never saves resolved values', async () => {
        const input = request(main, { inputs: { clientId: 4, caseId: 101, roleClientIds: { lawyer: 6 }, manualValues: {} } });
        const result = await service.preview(db, scope, main.id, input, options);
        assert.deepEqual(conversions.at(-1).text, ['client.fullName Person A', 'client.identityNumber 001234567', 'client.companyNumber 005123456', 'role.lawyer.fullName Office lawyer', 'case.reference 101', 'case.title Synthetic case A']);
        assert.equal(result.caseId, 101); assert.equal(result.clientId, 4); assert.equal(result.requiresFreshSigningGeometry, true);
        const row = (await db.query('SELECT * FROM signing_word_previews WHERE id=$1', [result.id])).rows[0];
        assert.ok(!JSON.stringify(row).includes('001234567')); assert.ok(!JSON.stringify(row).includes('Person A')); assert.ok(!JSON.stringify(row).includes('005123456'));
        assert.equal((await service.previewPdf(db, scope, result.id, { storage })).bytes.equals(output), true);
        assert.equal((await service.previewInfo(db, scope, result.id)).pdfHash, bytesHash(output));
        await assert.rejects(service.previewInfo(db, other, result.id), error('NOT_FOUND'));
        await assert.rejects(service.previewPdf(db, foreign, result.id, { storage }), error('NOT_FOUND'));
    });
    await t.test('client permission and repeated tenant/deleted predicates reject inaccessible profile data', async () => {
        const source = await create();
        for (const [actor, clientId] of [[scope, 5], [scope, 7], [scope, 6], [{ ...scope, clientView: false }, 4]]) {
            await assert.rejects(service.preview(db, actor, source.id, request(source, { inputs: { clientId, manualValues: {}, roleClientIds: {} } }), options), error('NOT_FOUND'));
        }
    });
    await t.test('same-tenant office roles may provide names without client permission but cannot infer IDs, capacity or authority', async () => {
        const source = await create(['role.lawyer.fullName']);
        const actor = { ...scope, clientView: false };
        await service.preview(db, actor, source.id, request(source, { inputs: { manualValues: {}, roleClientIds: { lawyer: 6 } } }), options);
        assert.deepEqual(conversions.at(-1).text, ['role.lawyer.fullName Office lawyer']);
        for (const field of ['identityNumber', 'companyNumber', 'capacity', 'authority']) {
            const required = await create([`role.lawyer.${field}`]);
            await assert.rejects(service.preview(db, actor, required.id, request(required, { inputs: { manualValues: {}, roleClientIds: { lawyer: 6 } } }), options), error('MISSING_REQUIRED_VALUE'));
        }
        await assert.rejects(service.preview(db, actor, source.id, request(source, { inputs: { roleClientIds: { lawyer: [6, 4] } } }), options), error('INVALID_CLIENT'));
    });
    await t.test('only explicitly bound manual values override the current record and leave client card unchanged', async () => {
        const source = await create(['client.identityNumber']);
        await service.preview(db, scope, source.id, request(source, { inputs: { clientId: 4, roleClientIds: {}, manualValues: { 'client.identityNumber': '000000009' } } }), options);
        assert.deepEqual(conversions.at(-1).text, ['client.identityNumber 000000009']);
        assert.equal((await db.query('SELECT client_profile FROM users WHERE userid=4')).rows[0].client_profile.identity.number, '001234567');
        for (const manualValues of [{ 'office.name': 'Not bound' }, { 'client.identityNumber': 123 }, { 'client.identityNumber': 'x'.repeat(10001) }]) {
            await assert.rejects(service.preview(db, scope, source.id, request(source, { inputs: { manualValues } }), options), error('INVALID_WORD_INPUTS'));
        }
    });
    await t.test('case viewing/assignment and foreign tenant access are rechecked rather than inferred from a chosen client', async () => {
        const source = await create(['case.title']);
        for (const [actor, caseId] of [[scope, 102], [scope, 201], [{ ...scope, caseView: false }, 101]]) {
            await assert.rejects(service.preview(db, actor, source.id, request(source, { inputs: { caseId, manualValues: {} } }), options), error('NOT_FOUND'));
        }
    });
    await t.test('idempotent same-input reuse verifies current access and PDF, different inputs conflict without another conversion', async () => {
        const source = await create(); const input = request(source);
        const first = await service.preview(db, scope, source.id, input, options); const n = conversions.length;
        assert.equal((await service.preview(db, scope, source.id, input, options)).id, first.id); assert.equal(conversions.length, n);
        await assert.rejects(service.preview(db, scope, source.id, { ...input, inputs: { manualValues: { 'client.fullName': 'Different' } } }, options), error('IDEMPOTENCY_CONFLICT'));
        assert.equal(conversions.length, n);
        await assert.rejects(service.preview(db, { ...scope, clientView: false }, source.id, input, options), error('NOT_FOUND'));
    });
    await t.test('source changes during conversion block obsolete output and preserve immutable previous preview', async () => {
        const source = await create(); const first = await service.preview(db, scope, source.id, request(source), options);
        duringConversion = async () => { duringConversion = null; await service.save(db, scope, source.id, { expectedVersion: source.version, sourceHash: source.sourceHash, name: 'New name', roles: [], bindings: source.bindings }, { storage }); };
        await assert.rejects(service.preview(db, scope, source.id, request(source), options), error('VERSION_CHANGED'));
        assert.equal((await service.previewPdf(db, scope, first.id, { storage })).bytes.equals(output), true);
        assert.equal((await service.previewInfo(db, scope, first.id)).name, first.name, 'preview display name remains tied to immutable source version');
    });
    await t.test('profile changes during conversion block stale materialization and reuse with changed persisted values', async () => {
        const source = await create(); const input = request(source); const first = await service.preview(db, scope, source.id, input, options);
        duringConversion = async () => { duringConversion = null; await db.query("UPDATE users SET name='Changed person' WHERE userid=4"); };
        await assert.rejects(service.preview(db, scope, source.id, request(source), options), error('WORD_INPUTS_CHANGED'));
        await assert.rejects(service.preview(db, scope, source.id, input, options), error('WORD_INPUTS_CHANGED'));
        assert.equal((await service.previewInfo(db, scope, first.id)).id, first.id);
        await db.query("UPDATE users SET name='Person A' WHERE userid=4");
    });
    await t.test('current case assignment revocation during conversion blocks output and subsequent preview download', async () => {
        const source = await create(['case.title']); const input = request(source, { inputs: { caseId: 101, manualValues: {} } });
        const first = await service.preview(db, scope, source.id, input, options);
        duringConversion = async () => { duringConversion = null; await db.query('DELETE FROM case_users WHERE caseid=101 AND userid=1'); };
        await assert.rejects(service.preview(db, scope, source.id, request(source, { inputs: input.inputs }), options), error('NOT_FOUND'));
        await assert.rejects(service.previewPdf(db, scope, first.id, { storage }), error('NOT_FOUND'));
        await db.query('INSERT INTO case_users VALUES(101,1)');
    });
    await t.test('archive is CAS, blocks source use/download/reimport, restore retains mapping history', async () => {
        const source = await create(['client.email']); const first = await service.preview(db, scope, source.id, request(source), options);
        const archived = await service.archive(db, scope, source.id, { expectedVersion: source.version, archived: true });
        await assert.rejects(service.load(db, scope, source.id, { storage }), error('NOT_FOUND'));
        await assert.rejects(service.previewPdf(db, scope, first.id, { storage }), error('NOT_FOUND'));
        const key = `users/1/reimport.docx`; storage.uploads.set(key, docx(['client.email']));
        await assert.rejects(service.importSource(db, scope, { fileKey: key, name: 'Bypass' }, { storage }), error('WORD_SOURCE_ARCHIVED'));
        await assert.rejects(service.archive(db, scope, source.id, { expectedVersion: source.version, archived: false }), error('VERSION_CHANGED'));
        const restored = await service.archive(db, scope, source.id, { expectedVersion: archived.version, archived: false });
        assert.equal(restored.version, source.version + 2);
        assert.deepEqual((await service.load(db, scope, source.id, { storage })).bindings, source.bindings);
        assert.equal((await service.previewInfo(db, scope, first.id)).id, first.id);
    });
    await t.test('archiving while conversion runs prevents persisting a new preview', async () => {
        const source = await create(['client.phone']);
        duringConversion = async () => { duringConversion = null; await service.archive(db, scope, source.id, { expectedVersion: source.version, archived: true }); };
        await assert.rejects(service.preview(db, scope, source.id, request(source), options), error('NOT_FOUND'));
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_previews WHERE source_id=$1', [source.id])).rows[0].n, 0);
    });
    await t.test('concurrent identical idempotency inputs create exactly one preview', async () => {
        const source = await create(['office.name']); const input = request(source, { inputs: { manualValues: { 'office.name': 'Synthetic office' } } });
        let arrived = 0; let release; const barrier = new Promise(resolve => { release = resolve; });
        const concurrentConvert = async buffer => { arrived += 1; if (arrived === 2) release(); await barrier; return convert(buffer); };
        const [a, b] = await Promise.all([service.preview(db, scope, source.id, input, { storage, convertDocxToPdf: concurrentConvert }), service.preview(db, scope, source.id, input, { storage, convertDocxToPdf: concurrentConvert })]);
        assert.equal(a.id, b.id);
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_previews WHERE idempotency_key=$1', [input.idempotencyKey])).rows[0].n, 1);
    });
    await t.test('concurrent same-key differing inputs produce one immutable winner and one conflict', async () => {
        const source = await create(['office.address']); const input = request(source, { inputs: { manualValues: { 'office.address': 'Address A' } } });
        let arrived = 0; let release; const barrier = new Promise(resolve => { release = resolve; });
        const concurrentConvert = async buffer => { arrived += 1; if (arrived === 2) release(); await barrier; return convert(buffer); };
        const results = await Promise.allSettled([service.preview(db, scope, source.id, input, { storage, convertDocxToPdf: concurrentConvert }), service.preview(db, scope, source.id, { ...input, inputs: { manualValues: { 'office.address': 'Address B' } } }, { storage, convertDocxToPdf: concurrentConvert })]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.errorCode, 'IDEMPOTENCY_CONFLICT');
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_previews WHERE idempotency_key=$1', [input.idempotencyKey])).rows[0].n, 1);
    });
    await t.test('a private empty mapping is retained as a draft and cannot create an unmapped preview', async () => {
        const fileKey = 'users/1/blank-mapping.docx'; storage.uploads.set(fileKey, docx(['office.phone']));
        const imported = await service.importSource(db, scope, { fileKey, name: 'Empty draft' }, { storage });
        const saved = await service.save(db, scope, imported.id, { expectedVersion: imported.version, sourceHash: imported.sourceHash, name: imported.name, roles: [], bindings: [] }, { storage });
        assert.deepEqual((await service.load(db, scope, saved.id, { storage })).bindings, []);
        await assert.rejects(service.preview(db, scope, saved.id, request(saved), options), error('WORD_BINDINGS_REQUIRED'));
    });
    await t.test('same source imports deduplicate per author only and concurrent CAS writes keep one immutable winner', async () => {
        const fileKey = 'users/1/dedupe.docx'; const bytes = docx(['office.name', 'office.phone']); storage.uploads.set(fileKey, bytes);
        const [first, second] = await Promise.all([service.importSource(db, scope, { fileKey, name: 'Import A' }, { storage }), service.importSource(db, scope, { fileKey, name: 'Import B' }, { storage })]);
        assert.equal(first.id, second.id);
        const foreignKey = 'users/3/dedupe.docx'; storage.uploads.set(foreignKey, bytes);
        const third = await service.importSource(db, other, { fileKey: foreignKey, name: 'Another author' }, { storage }); assert.notEqual(first.id, third.id);
        const input = { expectedVersion: first.version, sourceHash: first.sourceHash, name: 'A', roles: [], bindings: [] };
        const writes = await Promise.allSettled([service.save(db, scope, first.id, input, { storage }), service.save(db, scope, first.id, { ...input, name: 'B' }, { storage })]);
        assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(writes.find(result => result.status === 'rejected').reason.errorCode, 'VERSION_CHANGED');
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_source_versions WHERE source_id=$1', [first.id])).rows[0].n, 2);
    });
    await t.test('stale version/hash and malformed role references fail before conversion', async () => {
        const source = await create(['role.tenant.fullName']); const n = conversions.length;
        await assert.rejects(service.preview(db, scope, source.id, { ...request(source), expectedVersion: source.version - 1 }, options), error('VERSION_CHANGED'));
        await assert.rejects(service.preview(db, scope, source.id, { ...request(source), bindingsHash: 'a'.repeat(64) }, options), error('VERSION_CHANGED'));
        await assert.rejects(service.preview(db, scope, source.id, request(source, { inputs: { roleClientIds: { unknown: 4 } } }), options), error('INVALID_WORD_ROLE'));
        await assert.rejects(service.preview(db, scope, source.id, request(source, { inputs: { roleClientIds: { tenant: '4' } } }), options), error('INVALID_CLIENT'));
        assert.equal(conversions.length, n);
    });
    await t.test('a late same-key converter cannot reuse a preview after an intervening mapping edit', async () => {
        const source = await create(['office.address', 'office.phone']);
        const input = request(source, { inputs: { manualValues: { 'office.address': 'Address', 'office.phone': '00000' } } });
        let reached; const reachedConvert = new Promise(resolve => { reached = resolve; });
        let resume; const delayed = new Promise(resolve => { resume = resolve; });
        const late = service.preview(db, scope, source.id, input, { storage, convertDocxToPdf: async bytes => { reached(); await delayed; return convert(bytes); } });
        await reachedConvert;
        const first = await service.preview(db, scope, source.id, input, options);
        await service.save(db, scope, source.id, { expectedVersion: source.version, sourceHash: source.sourceHash, name: 'Changed while second converter ran', roles: source.roles, bindings: source.bindings }, { storage });
        const checked = assert.rejects(late, error('VERSION_CHANGED')); resume(); await checked;
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_previews WHERE idempotency_key=$1', [input.idempotencyKey])).rows[0].n, 1);
        assert.equal((await service.previewInfo(db, scope, first.id)).id, first.id);
    });
    await t.test('conversion failures retain original typed error for HTTP status and operational alerts', async () => {
        const source = await create(['office.email', 'office.phone']);
        for (const code of ['WORD_CONVERSION_TIMEOUT', 'WORD_CONVERSION_BUSY', 'WORD_CONVERSION_EXECUTABLE_UNAVAILABLE', 'WORD_CONVERSION_FAILED']) {
            const original = new WordTemplateError(code);
            const input = request(source, { inputs: { manualValues: { 'office.email': 'a@example.invalid', 'office.phone': '000' } } });
            await assert.rejects(service.preview(db, scope, source.id, input, { storage, convertDocxToPdf: async () => { throw original; } }), caught => caught === original);
        }
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_previews WHERE source_id=$1', [source.id])).rows[0].n, 0);
    });
    await t.test('source/PDF exact-length and hash readbacks detect corruption even when a storage verifier lies', async () => {
        const source = await create(['client.companyName']);
        const row = (await db.query('SELECT * FROM signing_word_sources WHERE id=$1', [source.id])).rows[0];
        const original = storage.files.get(row.object_key); storage.files.set(row.object_key, Buffer.alloc(original.length));
        await assert.rejects(service.load(db, scope, source.id, { storage }), error('ARTIFACT_HASH_MISMATCH')); storage.files.set(row.object_key, original);
        const first = await service.preview(db, scope, source.id, request(source), options);
        const saved = (await db.query('SELECT * FROM signing_word_previews WHERE id=$1', [first.id])).rows[0];
        const originalPdf = storage.files.get(saved.object_key); storage.files.set(saved.object_key, Buffer.alloc(originalPdf.length));
        await assert.rejects(service.previewPdf(db, scope, first.id, { storage }), error('ARTIFACT_HASH_MISMATCH')); storage.files.set(saved.object_key, originalPdf);
        const lying = { ...storage, write: async (key, bytes) => { storage.files.set(key, Buffer.alloc(bytes.length)); }, verify: async () => {} };
        storage.uploads.set('users/1/new.docx', docx(['office.phone']));
        await assert.rejects(service.importSource(db, scope, { fileKey: 'users/1/new.docx', name: 'Bad readback' }, { storage: lying }), error('ARTIFACT_HASH_MISMATCH'));
    });
    await t.test('malformed PDF metadata or actual non-PDF converter output cannot persist a preview', async () => {
        const source = await create(['office.email']); const input = request(source, { inputs: { manualValues: { 'office.email': 'synthetic@example.invalid' } } });
        for (const broken of [{ buffer: Buffer.from('not PDF'), pageCount: 1 }, { buffer: output, pageCount: 2 }]) {
            await assert.rejects(service.preview(db, scope, source.id, { ...input, idempotencyKey: randomUUID() }, { storage, convertDocxToPdf: async bytes => ({ ...broken, sourceHash: bytesHash(bytes), outputHash: bytesHash(broken.buffer), format: 'pdf', requiresFreshSigningGeometry: true }) }), error('WORD_INVALID_CONVERSION'));
        }
        assert.equal((await db.query('SELECT count(*)::int n FROM signing_word_previews WHERE source_id=$1', [source.id])).rows[0].n, 0);
    });
    await t.test('converter is unavailable explicitly when not configured; no automatic executable probing', async () => {
        const previous = process.env.WORD_TEMPLATE_SOFFICE_PATH; delete process.env.WORD_TEMPLATE_SOFFICE_PATH;
        try {
            assert.equal((await service.list(db, scope)).converterAvailable, false);
            const source = await create(['client.address']);
            await assert.rejects(service.preview(db, scope, source.id, request(source), { storage }), error('WORD_CONVERSION_NOT_CONFIGURED'));
        } finally { if (previous === undefined) delete process.env.WORD_TEMPLATE_SOFFICE_PATH; else process.env.WORD_TEMPLATE_SOFFICE_PATH = previous; }
    });
    await t.test('DB enforces immutable originals/history/previews, source/context FK and bounded JSON independently of service', async () => {
        const row = (await db.query('SELECT * FROM signing_word_previews LIMIT 1')).rows[0];
        for (const sql of ['UPDATE signing_word_previews SET bytes=bytes+1 WHERE id=$1', 'DELETE FROM signing_word_previews WHERE id=$1']) await assert.rejects(db.query(sql, [row.id]), { code: '23514' });
        const history = (await db.query('SELECT * FROM signing_word_source_versions LIMIT 1')).rows[0];
        await assert.rejects(db.query('UPDATE signing_word_source_versions SET name=$2 WHERE id=$1', [history.id, 'Changed']), { code: '23514' });
        await assert.rejects(db.query('DELETE FROM signing_word_source_versions WHERE id=$1', [history.id]), { code: '23514' });
        await assert.rejects(db.query('UPDATE signing_word_sources SET source_sha256=$2 WHERE id=$1', [main.id, 'a'.repeat(64)]), { code: '23514' });
        await assert.rejects(db.query('UPDATE signing_word_sources SET roles=$2 WHERE id=$1', [main.id, JSON.stringify(Array.from({ length: 41 }, () => ({})))]), { code: '23514' });
        await assert.rejects(db.query(`INSERT INTO signing_word_source_versions(id,owner_context_id,source_id,version,name,bindings_hash,roles,bindings,created_by) VALUES($1,$2,$3,1,'Foreign',$4,'[]','[]',1)`, [randomUUID(), CB, main.id, 'a'.repeat(64)]), { code: '23503' });
    });
});

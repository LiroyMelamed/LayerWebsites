'use strict';

// Exercise the actual selected QA service with synthetic SQL records and real
// DOCX materialization. Storage and PDF conversion remain in memory; this suite
// makes no claim about a live database, LibreOffice typography or browser UI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const backend = process.env.WORD_AUTOFILL_QA_BACKEND || path.resolve(__dirname, '..');
const service = require(path.join(backend, 'services/signingV2/wordTemplates'));
const core = require(path.join(backend, 'lib/wordTemplates'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const contextId = '20000000-0000-4000-8000-000000000001';
const foreignTenant = '20000000-0000-4000-8000-000000000099';
const scope = { contextId, userId: 1, tenantId: null, send: true, all: true,
    clientView: true, caseView: true, caseAll: false };
const error = code => caught => { assert.equal(caught.errorCode || caught.code, code); return true; };
const profileA = { version: 1, partyType: 'organization',
    identity: { type: 'national_id', number: '001234567', country: 'IL' },
    organization: { registrationType: 'company', registrationNumber: '005123456', registrationCountry: 'IL' },
    address: { line1: 'רחוב בדיקה 123', line2: 'קומה 2', city: 'עיר דמה', postalCode: '0012345', country: 'IL' } };
const profileB = { version: 1, partyType: 'person',
    identity: { type: 'passport', number: '000000082', country: 'IL' },
    address: { line1: 'רחוב אחר 7', city: 'עיר אחרת', country: 'IL' } };

function makeDocx(paragraphs) {
    const zip = new AdmZip();
    const entries = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
    };
    for (const [name, text] of Object.entries(entries)) zip.addFile(name, Buffer.from(text));
    return zip.toBuffer();
}
async function fixture(t) {
    const pg = new PGlite(); t.after(() => pg.close());
    const query = (sql, values) => pg.query(sql, values);
    const pool = { query, connect: async () => ({ query, release() {} }) };
    await pg.exec(`CREATE TABLE signing_owner_contexts(id uuid PRIMARY KEY);
        CREATE TABLE users(userid integer PRIMARY KEY,name text,email text,phonenumber text,companyname text,role text,
            law_firm_tenant_id uuid,client_profile jsonb DEFAULT '{}',dateofbirth date);
        CREATE TABLE cases(caseid integer PRIMARY KEY,casename text,law_firm_tenant_id uuid);
        CREATE TABLE case_users(caseid integer,userid integer);
        CREATE TABLE court_case_links(case_id integer,law_firm_tenant_id uuid,court_number text,is_primary boolean);
        CREATE TABLE signingfiles(id integer);`);
    await pg.query('INSERT INTO signing_owner_contexts VALUES($1)', [contextId]);
    await pg.query(`INSERT INTO users VALUES
        (1,'Synthetic author','author@example.invalid','0000000001','','Admin',null,'{}',null),
        (2,'Other author','other@example.invalid','0000000002','','Admin',null,'{}',null),
        (3,'לקוח א — נתוני בדיקה','client-a@example.invalid','0500012345','חברת דמה א', 'Client',null,$1,'2000-02-29'),
        (4,'לקוח ב — נתוני בדיקה','client-b@example.invalid','0500082000','מעסיק ב', 'User',null,$2,null),
        (5,'Foreign synthetic client','foreign@example.invalid','0000000005','','Client',$3,$1,null),
        (6,'Office lawyer','lawyer@example.invalid','0000000006','Office company','Lawyer',null,$1,null),
        (7,'Deleted synthetic client','','','','Deleted',null,$1,null),
        (8,'Missing profile client','','','','Client',null,'{}',null)`, [profileA, profileB, foreignTenant]);
    await pg.exec("INSERT INTO cases VALUES(9,'תיק בדיקה א',null),(10,'Unassigned synthetic case',null); INSERT INTO case_users VALUES(9,1); INSERT INTO court_case_links VALUES(9,null,'00042-10-2026',true)");
    for (const name of ['2026-10-23_01_signing_word_sources.sql', '2026-10-26_01_signing_word_authoring_renders.sql']) {
        await pg.exec(fs.readFileSync(path.join(backend, 'migrations', name), 'utf8'));
    }
    const objects = new Map(), uploads = new Map(), conversions = [];
    const storage = {
        async readUpload(key) { assert.ok(uploads.has(key)); return Buffer.from(uploads.get(key)); },
        async write(key, bytes) { if (objects.has(key)) assert.deepEqual(objects.get(key), bytes); objects.set(key, Buffer.from(bytes)); },
        async verify(key, size, digest) { assert.equal(objects.get(key).length, size); assert.equal(hash(objects.get(key)), digest); },
        async read(key, size) { assert.ok(objects.has(key)); assert.equal(objects.get(key).length, size); return Buffer.from(objects.get(key)); },
    };
    const options = { storage, async convertDocxToPdf(bytes) {
        conversions.push({ bytes: Buffer.from(bytes), text: core.importDocx(bytes).parts.flatMap(p => p.paragraphs.map(v => v.text)) });
        const pdf = await PDFDocument.create(); pdf.addPage([600, 800]); const buffer = Buffer.from(await pdf.save());
        return { buffer, format: 'pdf', sourceHash: hash(bytes), outputHash: hash(buffer), requiresFreshSigningGeometry: true, pageCount: 1 };
    } };
    async function create(fields, optional = new Set()) {
        const paragraphs = fields.map((field, i) => `${i} ${field} ____`);
        const fileKey = `users/1/autofill-${randomUUID()}.docx`; const original = makeDocx(paragraphs); uploads.set(fileKey, original);
        const source = await service.importSource(pool, scope, { name: 'Synthetic auto-fill acceptance', fileKey }, options);
        const roles = [...new Set(fields.filter(f => f.startsWith('role.')).map(f => f.split('.')[1]))].map(key => ({ key, label: key }));
        const bindings = fields.map((field, i) => ({ id: 'b' + i, field, part: 'word/document.xml', paragraphId: 'p' + i,
            start: paragraphs[i].length - 4, end: paragraphs[i].length, required: !optional.has(field) }));
        const saved = await service.save(pool, scope, source.id, { expectedVersion: 1, sourceHash: source.sourceHash, name: source.name, roles, bindings }, options);
        return { ...saved, original };
    }
    const request = (source, inputs = {}, idempotencyKey = randomUUID()) => ({ expectedVersion: source.version, bindingsHash: source.bindingsHash,
        idempotencyKey, inputs: { clientId: 3, roleClientIds: {}, manualValues: {}, ...inputs } });
    const preview = (source, inputs, key, actor = scope) => service.preview(pool, actor, source.id, request(source, inputs, key), options);
    return { pg, pool, conversions, create, request, preview, options, objects };
}

test('selected records automatically fill client, organization, contact, role and case fields with no manual values', async t => {
    const f = await fixture(t);
    const expected = {
        'client.fullName': 'לקוח א — נתוני בדיקה', 'client.identityNumber': '001234567',
        'client.companyName': 'חברת דמה א', 'client.companyNumber': '005123456',
        'client.address': 'רחוב בדיקה 123, קומה 2, עיר דמה, 0012345, IL',
        'client.email': 'client-a@example.invalid', 'client.phone': '0500012345',
        'client.birthDate': '2000-02-29', 'client.address.postalCode': '0012345',
        'case.title': 'תיק בדיקה א', 'case.reference': '9', 'case.courtNumber': '00042-10-2026',
        'role.tenant.fullName': 'לקוח ב — נתוני בדיקה', 'role.tenant.identityNumber': '000000082',
        'role.landlord.fullName': 'לקוח א — נתוני בדיקה', 'role.landlord.companyNumber': '005123456',
        'role.lawyer.fullName': 'Office lawyer',
    };
    const fields = Object.keys(expected), source = await f.create(fields);
    const before = JSON.stringify((await f.pg.query('SELECT * FROM users ORDER BY userid')).rows);
    const result = await f.preview(source, { caseId: 9, roleClientIds: { tenant: 4, landlord: 3, lawyer: 6 } });
    assert.equal(result.clientId, 3); assert.equal(result.caseId, 9);
    assert.deepEqual(f.conversions[0].text, fields.map((field, i) => `${i} ${field} ${expected[field]}`));
    assert.equal(JSON.stringify((await f.pg.query('SELECT * FROM users ORDER BY userid')).rows), before, 'document fill does not update profiles');
    const persistedSource = (await f.pg.query('SELECT object_key,source_sha256 FROM signing_word_sources')).rows[0];
    assert.deepEqual(f.objects.get(persistedSource.object_key), source.original);
    assert.equal(persistedSource.source_sha256, hash(source.original));
});

test('switching selected clients uses the new record and never leaks the previous client or organization number', async t => {
    const f = await fixture(t), fields = ['client.fullName', 'client.identityNumber', 'client.companyNumber', 'client.address'];
    const source = await f.create(fields, new Set(['client.companyNumber']));
    await f.preview(source); await f.preview(source, { clientId: 4 });
    assert.deepEqual(f.conversions[1].text, ['0 client.fullName לקוח ב — נתוני בדיקה', '1 client.identityNumber 000000082',
        '2 client.companyNumber ', '3 client.address רחוב אחר 7, עיר אחרת, IL']);
    assert.equal(f.conversions[1].text.join('\n').includes('001234567'), false);
});

test('missing required identity blocks before conversion while optional missing identity is cleared', async t => {
    const f = await fixture(t), required = await f.create(['client.fullName', 'client.identityNumber']);
    await assert.rejects(f.preview(required, { clientId: 8 }), error('MISSING_REQUIRED_VALUE'));
    assert.equal(f.conversions.length, 0);
    const optional = await f.create(['client.identityNumber'], new Set(['client.identityNumber']));
    await f.preview(optional, { clientId: 8 }); assert.deepEqual(f.conversions[0].text, ['0 client.identityNumber ']);
});

test('person and office roles never infer organization identifiers or signing authority from stored profile', async t => {
    const f = await fixture(t);
    for (const [field, inputs] of [['client.companyNumber', { clientId: 4 }], ['role.lawyer.identityNumber', { roleClientIds: { lawyer: 6 } }],
        ['role.lawyer.companyNumber', { roleClientIds: { lawyer: 6 } }], ['role.lawyer.capacity', { roleClientIds: { lawyer: 6 } }],
        ['role.lawyer.authority', { roleClientIds: { lawyer: 6 } }], ['client.firstName', {}]]) {
        const source = await f.create([field]);
        await assert.rejects(f.preview(source, inputs), error('MISSING_REQUIRED_VALUE'));
    }
    assert.equal(f.conversions.length, 0);
});

test('idempotent reuse revalidates stored values and a new request materializes changed client data', async t => {
    const f = await fixture(t), source = await f.create(['client.fullName', 'client.identityNumber']), key = randomUUID();
    const original = await f.preview(source, {}, key), reused = await f.preview(source, {}, key);
    assert.equal(original.id, reused.id); assert.equal(f.conversions.length, 1);
    await f.pg.query("UPDATE users SET name='לקוח א — עודכן בבדיקה' WHERE userid=3");
    await assert.rejects(f.preview(source, {}, key), error('WORD_INPUTS_CHANGED')); assert.equal(f.conversions.length, 1);
    await f.preview(source); assert.deepEqual(f.conversions[1].text, ['0 client.fullName לקוח א — עודכן בבדיקה', '1 client.identityNumber 001234567']);
});

test('foreign, deleted, office-primary and inaccessible client/case selections fail before conversion', async t => {
    const f = await fixture(t), source = await f.create(['client.fullName', 'role.other.fullName']);
    for (const clientId of [5, 6, 7, 999]) await assert.rejects(f.preview(source, { clientId, roleClientIds: { other: 4 } }), error('NOT_FOUND'));
    await assert.rejects(f.preview(source, { roleClientIds: { other: 5 } }), error('NOT_FOUND'));
    await assert.rejects(f.preview(source, { roleClientIds: { other: 4 }, caseId: 10 }), error('NOT_FOUND'));
    await assert.rejects(f.preview(source, { roleClientIds: { other: 4 } }, undefined, { ...scope, clientView: false }), error('NOT_FOUND'));
    assert.equal(f.conversions.length, 0);
});

test('record references reject numeric strings and manual numeric identity values cannot coerce leading-zero strings', async t => {
    const f = await fixture(t), source = await f.create(['client.identityNumber', 'role.other.fullName']);
    await assert.rejects(f.preview(source, { clientId: '3', roleClientIds: { other: 4 } }), error('INVALID_CLIENT'));
    await assert.rejects(f.preview(source, { roleClientIds: { other: '4' } }), error('INVALID_CLIENT'));
    await assert.rejects(f.preview(source, { roleClientIds: { other: 4 }, manualValues: { 'client.identityNumber': 1234567 } }), error('INVALID_WORD_INPUTS'));
    assert.equal(f.conversions.length, 0);
});

test('separate repeated client and role bindings resolve independently in the same original document', async t => {
    const f = await fixture(t), fields = ['client.fullName', 'role.other.fullName', 'client.fullName', 'client.identityNumber', 'role.other.identityNumber'];
    const source = await f.create(fields); await f.preview(source, { roleClientIds: { other: 4 } });
    assert.deepEqual(f.conversions[0].text, ['0 client.fullName לקוח א — נתוני בדיקה', '1 role.other.fullName לקוח ב — נתוני בדיקה',
        '2 client.fullName לקוח א — נתוני בדיקה', '3 client.identityNumber 001234567', '4 role.other.identityNumber 000000082']);
});

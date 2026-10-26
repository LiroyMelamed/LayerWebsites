'use strict';

// ONE bounded, explicitly opted-in local integration scenario. No app DB, real
// clients, network transports, HTTP authentication, or production converter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const service = require('../services/signingV2/wordTemplates');
const { convertDocxToPdf } = require('../lib/wordTemplates/converter');
const { bytesHash } = require('../lib/signingV2/canonical');
const SOCKET = '/tmp/codex-word-actual-55490-socket';
const EXECUTABLE = '/Users/liroymelamed/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice';
const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(ROOT, 'outputs/workflow-improvements-20261023/word-service/actual-converter');
const CONTEXT = 'd0000000-0000-4000-8000-000000000001';
const TENANT = 'e0000000-0000-4000-8000-000000000001';
async function textContent(bytes) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, stopAtErrors: true });
    let document;
    try {
        document = await loading.promise;
        const pages = [];
        for (let n = 1; n <= document.numPages; n += 1) {
            const page = await document.getPage(n);
            pages.push((await page.getTextContent()).items.filter(item => typeof item.str === 'string').map(item => item.str).join(' '));
            page.cleanup();
        }
        return pages.join('\n');
    } finally { if (document) await document.destroy(); else await loading.destroy(); }
}
test('private Word service integrates actual configured conversion and protected current PDF readback', {
    skip: process.env.WORD_SERVICE_ACTUAL_SOCKET !== SOCKET, timeout: 150000,
}, async t => {
    const db = new Pool({ host: SOCKET, port: 55490, user: 'word_actual_test_owner', database: 'postgres', max: 4 });
    t.after(() => db.end());
    assert.equal((await db.query('SELECT current_user AS name')).rows[0].name, 'word_actual_test_owner');
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await db.query(`CREATE TABLE users(userid integer PRIMARY KEY,name text,email text,phonenumber text,companyname text,role text,law_firm_tenant_id uuid,client_profile jsonb DEFAULT '{}');
        CREATE TABLE cases(caseid integer PRIMARY KEY,casename text,law_firm_tenant_id uuid);
        CREATE TABLE case_users(caseid integer,userid integer);
        CREATE TABLE signing_owner_contexts(id uuid PRIMARY KEY);
        CREATE TABLE signingfiles(id integer)`);
    const profile = { version: 1, partyType: 'organization', identity: { type: 'national_id', number: '001234567', country: 'IL' },
        organization: { registrationType: 'company', registrationNumber: '005123456', registrationCountry: 'IL' } };
    await db.query(`INSERT INTO users(userid,name,email,phonenumber,companyname,role,law_firm_tenant_id,client_profile) VALUES
        (1,'Synthetic author','author@example.invalid','00001','','Admin',$1,'{}'),
        (2,'Other synthetic author','other@example.invalid','00002','','Admin',$1,'{}'),
        (4,'Ada Example','person@example.invalid','00004','Synthetic Company','User',$1,$2)`, [TENANT, profile]);
    await db.query('INSERT INTO signing_owner_contexts VALUES($1)', [CONTEXT]);
    await db.query(await fs.readFile(path.join(__dirname, '../migrations/2026-10-23_01_signing_word_sources.sql'), 'utf8'));
    const scope = { contextId: CONTEXT, tenantId: TENANT, userId: 1, send: true, all: true, clientView: true, caseView: true, caseAll: true };
    const foreignAuthor = { ...scope, userId: 2 };
    const original = await fs.readFile(path.join(OUT, 'source.docx'));
    const objects = new Map();
    const uploadKey = 'users/1/synthetic-source.docx';
    const storage = {
        async readUpload(key, maximum) { assert.equal(key, uploadKey); assert.ok(original.length <= maximum); return Buffer.from(original); },
        async read(key, exact) { assert.ok(objects.has(key)); assert.equal(objects.get(key).length, exact); return Buffer.from(objects.get(key)); },
        async write(key, bytes) { if (objects.has(key)) assert.deepEqual(objects.get(key), bytes); objects.set(key, Buffer.from(bytes)); },
        async verify(key, size, sha256) { assert.equal(objects.get(key).length, size); assert.equal(bytesHash(objects.get(key)), sha256); },
    };
    const imported = await service.importSource(db, scope, { name: 'Synthetic reusable source', fileKey: uploadKey }, { storage });
    const fields = ['client.fullName', 'client.identityNumber', 'client.companyName', 'client.companyNumber'];
    const paragraphs = imported.model.parts.find(part => part.name === 'word/document.xml').paragraphs;
    const bindingParagraphs = paragraphs.filter(p => p.text.includes('____') && !p.text.startsWith('Signature:'));
    assert.equal(bindingParagraphs.length, fields.length);
    const bindings = fields.map((field, index) => ({ id: `b${index}`, part: 'word/document.xml', paragraphId: bindingParagraphs[index].id,
        start: bindingParagraphs[index].text.indexOf('____'), end: bindingParagraphs[index].text.indexOf('____') + 4, field }));
    const saved = await service.save(db, scope, imported.id, { expectedVersion: imported.version, sourceHash: imported.sourceHash,
        name: imported.name, roles: [], bindings }, { storage });
    const conversions = [];
    const converter = async bytes => {
        const started = performance.now();
        const result = await convertDocxToPdf(bytes, { executablePath: EXECUTABLE, timeoutMs: 60000 });
        conversions.push({ milliseconds: performance.now() - started, sourceHash: result.sourceHash, pdfHash: result.outputHash, pages: result.pageCount, actualEngine: result.converter });
        return result;
    };
    const options = { storage, convertDocxToPdf: converter };
    const inputs = { clientId: 4, roleClientIds: {}, manualValues: {} };
    const firstInput = { expectedVersion: saved.version, bindingsHash: saved.bindingsHash, idempotencyKey: randomUUID(), inputs };
    const first = await service.preview(db, scope, saved.id, firstInput, options);
    const firstPdf = await service.previewPdf(db, scope, first.id, { storage });
    assert.equal(bytesHash(firstPdf.bytes), first.pdfHash);
    const firstText = await textContent(firstPdf.bytes);
    for (const value of ['Ada Example', '001234567', 'Synthetic Company', '005123456']) assert.ok(firstText.includes(value), `first PDF includes synthetic value ${value}`);
    assert.equal((await service.preview(db, scope, saved.id, firstInput, options)).id, first.id);
    assert.equal(conversions.length, 1, 'same-key retry does not invoke actual converter again');
    await db.query("UPDATE users SET name='Ada Updated',client_profile=jsonb_set(client_profile,'{identity,number}','\"000000009\"'::jsonb) WHERE userid=4");
    const second = await service.preview(db, scope, saved.id, { ...firstInput, idempotencyKey: randomUUID() }, options);
    const secondPdf = await service.previewPdf(db, scope, second.id, { storage });
    const secondText = await textContent(secondPdf.bytes);
    assert.equal(bytesHash(secondPdf.bytes), second.pdfHash);
    assert.notEqual(second.pdfHash, first.pdfHash);
    assert.ok(secondText.includes('Ada Updated')); assert.ok(secondText.includes('000000009')); assert.ok(!secondText.includes('Ada Example'));
    assert.equal(bytesHash((await service.previewPdf(db, scope, first.id, { storage })).bytes), first.pdfHash, 'prior per-use PDF is immutable after client update');
    const source = await service.load(db, scope, saved.id, { storage });
    assert.equal(source.sourceHash, bytesHash(original)); assert.equal(source.version, saved.version);
    assert.deepEqual(source.bindings, saved.bindings); assert.equal(source.model.parts[0].paragraphs.filter(p => p.text.includes('____')).length, 5);
    assert.ok(!JSON.stringify(source.model).includes('Ada Example')); assert.ok(!JSON.stringify(source.model).includes('Ada Updated'));
    assert.equal((await service.list(db, foreignAuthor)).sources.length, 0);
    await assert.rejects(service.load(db, foreignAuthor, saved.id, { storage }), error => error.errorCode === 'NOT_FOUND');
    await assert.rejects(service.previewPdf(db, foreignAuthor, first.id, { storage }), error => error.errorCode === 'NOT_FOUND');
    await assert.rejects(service.previewInfo(db, { ...scope, clientView: false }, first.id), error => error.errorCode === 'NOT_FOUND');
    const rows = (await db.query('SELECT * FROM signing_word_previews ORDER BY created_at')).rows;
    assert.equal(rows.length, 2);
    for (const row of rows) {
        assert.ok(!JSON.stringify(row).includes('Ada Example')); assert.ok(!JSON.stringify(row).includes('000000009'));
        assert.equal(row.source_id, saved.id); assert.equal(row.source_sha256, bytesHash(original));
        assert.ok(row.object_key.startsWith(`signing-v2/${CONTEXT}/word/1/previews/`));
    }
    const sourceRow = (await db.query('SELECT * FROM signing_word_sources WHERE id=$1', [saved.id])).rows[0];
    assert.equal(bytesHash(objects.get(sourceRow.object_key)), bytesHash(original));
    await fs.writeFile(path.join(OUT, 'preview-first.pdf'), firstPdf.bytes);
    await fs.writeFile(path.join(OUT, 'preview-current.pdf'), secondPdf.bytes);
    await fs.writeFile(path.join(OUT, 'integration-artifacts.json'), JSON.stringify({ sourceHash: bytesHash(original), sourceVersion: saved.version,
        first: { ...first, extractedTextHash: bytesHash(Buffer.from(firstText)), bytes: firstPdf.bytes.length },
        current: { ...second, extractedTextHash: bytesHash(Buffer.from(secondText)), bytes: secondPdf.bytes.length }, conversions,
        sourceUnchanged: true, privateForeignAuthorDenied: true, currentClientPermissionDenied: true,
        scope: 'One actual service/core/bundled-LibreOffice/PDF readback integration scenario. Synthetic PostgreSQL and memory storage; no HTTP/browser/raster/production signing proof.' }, null, 2) + '\n');
});

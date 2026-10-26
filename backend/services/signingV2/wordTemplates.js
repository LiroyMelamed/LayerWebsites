'use strict';

// Word libraries are private authoring aids. A preview is a new, immutable PDF
// for the incumbent one-off editor; it is never a published signing revision.
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { importDocx, createBinding, materializeDocx, WordTemplateError } = require('../../lib/wordTemplates');
const { clientDocumentValues } = require('../../lib/wordTemplates/clientValues');
const { bytesHash, digest } = require('../../lib/signingV2/canonical');
const { fail, expect } = require('../../lib/signingV2/errors');
const { assertClients, assertCases } = require('./access');
const { transaction } = require('./transaction');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;
const KEY = /^[A-Za-z0-9_-]{1,64}$/u;
const MAX_SOURCE = 20 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;
const OFFICE_ROLES = new Set(['Admin', 'Lawyer', 'Staff']);

function scopeCheck(scope) {
    if (!scope || scope.send !== true) fail('FORBIDDEN', 403);
    expect(UUID.test(scope.contextId || '') && Number.isSafeInteger(scope.userId) && scope.userId > 0, 'CONTEXT_REQUIRED');
    expect(scope.tenantId == null || UUID.test(scope.tenantId), 'CONTEXT_REQUIRED');
}
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function recordId(value, code) { expect(Number.isSafeInteger(value) && value > 0 && value <= 2147483647, code); return value; }
function version(value) { if (value == null) fail('PRECONDITION_REQUIRED', 428); expect(Number.isSafeInteger(value) && value > 0, 'INVALID_PRECONDITION'); }
function title(value) {
    expect(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 300 && !/[\u0000-\u001f\u007f]/u.test(value), 'INVALID_WORD_TEMPLATE');
    return value.trim();
}
function sourceView(row, model) {
    return { id: row.id, name: row.name, version: Number(row.version), sourceHash: row.source_sha256,
        bindingsHash: row.bindings_hash, roles: row.roles, bindings: row.bindings, ...(model ? { model } : {}), archived: row.archived };
}
function previewView(row) {
    return { id: row.id, name: row.name || `${row.source_name || 'Document'}.pdf`, sourceId: row.source_id,
        sourceVersion: Number(row.source_version), pdfHash: row.pdf_sha256, caseId: row.case_id || null,
        clientId: row.client_id || null, requiresFreshSigningGeometry: true };
}
function word(action) {
    try { return action(); } catch (error) {
        if (!(error instanceof WordTemplateError)) throw error;
        // Never expose paragraph contents, XML, field values or converter output.
        fail(error.code, 422);
    }
}
async function source(db, scope, id, { lock = false, archived = false } = {}) {
    scopeCheck(scope); expect(typeof id === 'string' && UUID.test(id), 'INVALID_WORD_TEMPLATE');
    const row = (await db.query(`/*word:source*/ SELECT * FROM signing_word_sources
        WHERE owner_context_id=$1 AND id=$2 AND created_by=$3 ${archived ? '' : 'AND NOT archived'} ${lock ? 'FOR UPDATE' : ''}`,
    [scope.contextId, id, scope.userId])).rows[0];
    if (!row) fail('NOT_FOUND', 404);
    return row;
}
async function sourceBytes(row, storage) {
    expect(storage && typeof storage.read === 'function', 'WORD_STORAGE_UNAVAILABLE');
    const count = Number(row.bytes);
    expect(Number.isSafeInteger(count) && count > 0 && count <= MAX_SOURCE && HASH.test(row.source_sha256), 'INVALID_SOURCE');
    const buffer = await storage.read(row.object_key, count);
    expect(Buffer.isBuffer(buffer) && buffer.length === count && bytesHash(buffer) === row.source_sha256, 'ARTIFACT_HASH_MISMATCH');
    return buffer;
}
async function writeVerified(storage, key, buffer) {
    expect(storage && typeof storage.write === 'function' && typeof storage.verify === 'function' && typeof storage.read === 'function', 'WORD_STORAGE_UNAVAILABLE');
    const hash = bytesHash(buffer);
    await storage.write(key, buffer);
    await storage.verify(key, buffer.length, hash);
    const readback = await storage.read(key, buffer.length);
    expect(Buffer.isBuffer(readback) && readback.length === buffer.length && bytesHash(readback) === hash, 'ARTIFACT_HASH_MISMATCH');
}
function rolesAndBindings(model, input, bytes) {
    expect(Array.isArray(input.roles) && input.roles.length <= 40 && Array.isArray(input.bindings) && input.bindings.length <= 1000, 'INVALID_WORD_TEMPLATE');
    const keys = new Set();
    const roles = input.roles.map(role => {
        expect(plain(role) && KEY.test(role.key || '') && !['__proto__', 'constructor', 'prototype'].includes(role.key) && !keys.has(role.key), 'INVALID_WORD_ROLE');
        keys.add(role.key);
        return { key: role.key, label: title(role.label) };
    });
    const bindings = input.bindings.map(spec => {
        expect(plain(spec), 'INVALID_BINDING');
        if (typeof spec.field === 'string' && spec.field.startsWith('role.')) expect(keys.has(spec.field.split('.')[1]), 'INVALID_WORD_ROLE');
        // Rebuild hashes and ranges using the freshly imported server model.
        return word(() => createBinding(model, { id: spec.id, field: spec.field, part: spec.part, paragraphId: spec.paragraphId,
            start: spec.start, end: spec.end, required: spec.required }));
    });
    if (bindings.length) word(() => materializeDocx(bytes, { sourceHash: model.sourceHash, bindings,
        values: Object.fromEntries(bindings.map(binding => [binding.field, 'x'])) }));
    return { roles, bindings, bindingsHash: digest({ roles, bindings }) };
}
async function list(db, scope) {
    scopeCheck(scope);
    const rows = (await db.query(`/*word:list*/ SELECT id,name,version,source_sha256,bindings_hash,roles,jsonb_array_length(bindings) AS binding_count,archived,updated_at
        FROM signing_word_sources WHERE owner_context_id=$1 AND created_by=$2 ORDER BY updated_at DESC,id LIMIT 200`, [scope.contextId, scope.userId])).rows;
    const executable = process.env.WORD_TEMPLATE_SOFFICE_PATH;
    return { sources: rows.map(row => ({ id: row.id, name: row.name, version: Number(row.version), sourceHash: row.source_sha256,
        bindingsHash: row.bindings_hash, roles: row.roles, bindingCount: Number(row.binding_count), archived: row.archived, updatedAt: row.updated_at })),
        converterAvailable: typeof executable === 'string' && path.isAbsolute(executable) && !executable.includes('\0') };
}
async function importSource(pool, scope, input, { storage } = {}) {
    scopeCheck(scope); expect(plain(input), 'INVALID_WORD_TEMPLATE');
    const name = title(input.name);
    const fileKey = input.fileKey;
    expect(typeof fileKey === 'string' && fileKey.length <= 1000 && fileKey.startsWith(`users/${scope.userId}/`)
        && fileKey.endsWith('.docx') && !/[\\\u0000-\u0020?#%]/u.test(fileKey)
        && !fileKey.split('/').some(segment => !segment || segment === '.' || segment === '..'), 'INVALID_SOURCE');
    expect(storage && typeof storage.readUpload === 'function', 'WORD_STORAGE_UNAVAILABLE');
    const bytes = await storage.readUpload(fileKey, MAX_SOURCE);
    expect(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_SOURCE, 'INVALID_SOURCE');
    const model = word(() => importDocx(bytes));
    const hash = bytesHash(bytes);
    const objectKey = `signing-v2/${scope.contextId}/word/${scope.userId}/sources/${hash}.docx`;
    await writeVerified(storage, objectKey, bytes);
    return transaction(pool, async db => {
        const emptyHash = digest({ roles: [], bindings: [] });
        const inserted = (await db.query(`/*word:import*/ INSERT INTO signing_word_sources
            (id,owner_context_id,created_by,source_sha256,object_key,bytes,name,bindings_hash)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_context_id,created_by,source_sha256) DO NOTHING RETURNING *`,
        [randomUUID(), scope.contextId, scope.userId, hash, objectKey, bytes.length, name, emptyHash])).rows[0];
        const row = inserted || (await db.query(`/*word:duplicate*/ SELECT * FROM signing_word_sources
            WHERE owner_context_id=$1 AND created_by=$2 AND source_sha256=$3 FOR UPDATE`, [scope.contextId, scope.userId, hash])).rows[0];
        if (!row || row.archived) fail('WORD_SOURCE_ARCHIVED', 409);
        if (inserted) await appendVersion(db, scope, row);
        return sourceView(row, model);
    });
}
async function load(db, scope, id, { storage } = {}) {
    const row = await source(db, scope, id);
    return sourceView(row, (await loadModel(row, storage)).model);
}
// Kept separate from transactions: only persisted source bytes can supply a model.
async function loadModel(row, storage) { const bytes = await sourceBytes(row, storage); return { bytes, model: word(() => importDocx(bytes)) }; }
async function appendVersion(db, scope, row) {
    await db.query(`/*word:version*/ INSERT INTO signing_word_source_versions
        (id,owner_context_id,source_id,version,name,bindings_hash,roles,bindings,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), scope.contextId, row.id, Number(row.version), row.name, row.bindings_hash, JSON.stringify(row.roles), JSON.stringify(row.bindings), scope.userId]);
}
async function save(pool, scope, id, input, { storage } = {}) {
    scopeCheck(scope); expect(plain(input), 'INVALID_WORD_TEMPLATE'); version(input.expectedVersion);
    expect(HASH.test(input.sourceHash || ''), 'INVALID_SOURCE');
    return transaction(pool, async db => {
        const row = await source(db, scope, id, { lock: true });
        if (Number(row.version) !== input.expectedVersion || row.source_sha256 !== input.sourceHash) fail('VERSION_CHANGED', 412);
        const { bytes, model } = await loadModel(row, storage);
        const checked = rolesAndBindings(model, input, bytes);
        const updated = (await db.query(`/*word:save*/ UPDATE signing_word_sources SET name=$4,roles=$5,bindings=$6,
            bindings_hash=$7,version=version+1,updated_at=clock_timestamp()
            WHERE owner_context_id=$1 AND id=$2 AND created_by=$3 AND version=$8 AND NOT archived RETURNING *`,
        [scope.contextId, id, scope.userId, title(input.name), JSON.stringify(checked.roles), JSON.stringify(checked.bindings), checked.bindingsHash, input.expectedVersion])).rows[0];
        if (!updated) fail('VERSION_CHANGED', 412);
        await appendVersion(db, scope, updated);
        return sourceView(updated, model);
    });
}
function inputsFor(row, input) {
    expect(plain(input.inputs) && plain(input.inputs.manualValues || {}) && plain(input.inputs.roleClientIds || {}), 'INVALID_WORD_INPUTS');
    const bound = new Set(row.bindings.map(binding => binding.field));
    const manualValues = {};
    for (const [key, value] of Object.entries(input.inputs.manualValues || {})) {
        expect(bound.has(key) && typeof value === 'string' && value.length <= 10000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r\n\t]/u.test(value), 'INVALID_WORD_INPUTS');
        manualValues[key] = value;
    }
    expect(Buffer.byteLength(JSON.stringify(manualValues)) <= 100000, 'INVALID_WORD_INPUTS');
    const roleKeys = new Set(row.roles.map(role => role.key));
    const roleClientIds = {};
    for (const [key, id] of Object.entries(input.inputs.roleClientIds || {})) {
        expect(roleKeys.has(key), 'INVALID_WORD_ROLE'); roleClientIds[key] = recordId(id, 'INVALID_CLIENT');
    }
    const clientId = input.inputs.clientId == null ? null : recordId(input.inputs.clientId, 'INVALID_CLIENT');
    const caseId = input.inputs.caseId == null ? null : recordId(input.inputs.caseId, 'INVALID_CASE');
    return { manualValues, roleClientIds, clientId, caseId };
}
async function clientRow(db, scope, id, role = false, lock = false) {
    // Repeat tenant/deleted predicates in the actual data read after authorization.
    const row = (await db.query(`/*word:person*/ SELECT userid,role
        FROM users WHERE userid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND role<>'Deleted' ${lock ? 'FOR SHARE' : ''}`, [id, scope.tenantId])).rows[0];
    if (!row) fail('NOT_FOUND', 404);
    if (OFFICE_ROLES.has(row.role)) {
        if (!role) fail('NOT_FOUND', 404);
        // Office assignments expose only identity/contact, never profile/authority.
        const contact = (await db.query(`/*word:office*/ SELECT userid,name,email,phonenumber FROM users
            WHERE userid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND role IN ('Admin','Lawyer','Staff') ${lock ? 'FOR SHARE' : ''}`, [id, scope.tenantId])).rows[0];
        if (!contact) fail('NOT_FOUND', 404);
        return { values: { 'client.fullName': contact.name || '', 'client.email': contact.email || '', 'client.phone': contact.phonenumber || '' }, office: true };
    }
    await assertClients(db, scope, [id], lock);
    const repeated = (await db.query(`/*word:client*/ SELECT userid,name,email,phonenumber,companyname,role,client_profile
        FROM users WHERE userid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND role NOT IN ('Admin','Lawyer','Staff','Deleted') ${lock ? 'FOR SHARE' : ''}`,  [id, scope.tenantId])).rows[0];
    if (!repeated) fail('NOT_FOUND', 404);
    return { values: clientDocumentValues(repeated), office: false };
}
async function resolveValues(db, scope, inputs, lock = false) {
    const values = {};
    if (inputs.clientId) Object.assign(values, (await clientRow(db, scope, inputs.clientId, false, lock)).values);
    for (const [key, id] of Object.entries(inputs.roleClientIds)) {
        const person = await clientRow(db, scope, id, true, lock);
        for (const field of ['fullName', 'companyName', 'identityNumber', 'companyNumber']) {
            const value = person.values[`client.${field}`];
            if (value !== undefined) values[`role.${key}.${field}`] = value;
        }
    }
    if (inputs.caseId) {
        await assertCases(db, scope, [inputs.caseId]);
        const row = (await db.query(`/*word:case*/ SELECT c.caseid,c.casename FROM cases c WHERE c.caseid=$1
            AND (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $2::text
            AND ($3::boolean OR EXISTS (SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$4)) ${lock ? 'FOR SHARE OF c' : ''}`,
        [inputs.caseId, scope.tenantId, scope.caseAll, scope.userId])).rows[0];
        if (!row) fail('NOT_FOUND', 404);
        values['case.reference'] = String(row.caseid); values['case.title'] = row.casename || '';
    }
    return { ...values, ...inputs.manualValues };
}
async function pdfBytes(row, storage) {
    const size = Number(row.bytes);
    expect(Number.isSafeInteger(size) && size > 0 && size <= MAX_PDF && HASH.test(row.pdf_sha256), 'INVALID_SOURCE');
    const bytes = await storage.read(row.object_key, size);
    expect(Buffer.isBuffer(bytes) && bytes.length === size && bytesHash(bytes) === row.pdf_sha256, 'ARTIFACT_HASH_MISMATCH');
    return bytes;
}
async function validatePdf(converted, filled) {
    expect(converted && Buffer.isBuffer(converted.buffer) && converted.buffer.length > 0 && converted.buffer.length <= MAX_PDF
        && converted.format === 'pdf' && converted.requiresFreshSigningGeometry === true
        && converted.sourceHash === filled.outputHash && converted.outputHash === bytesHash(converted.buffer), 'WORD_INVALID_CONVERSION');
    const { PDFDocument } = require('pdf-lib');
    let pdf;
    try { pdf = await PDFDocument.load(converted.buffer, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true }); }
    catch { fail('WORD_INVALID_CONVERSION'); }
    const pages = pdf.getPages();
    expect(pages.length > 0 && pages.length <= 200 && converted.pageCount === pages.length, 'WORD_INVALID_CONVERSION');
    for (const page of pages) {
        const { width, height } = page.getSize();
        expect(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 14400 && height <= 14400
            && page.getRotation().angle % 90 === 0, 'WORD_INVALID_CONVERSION');
    }
}
async function existingPreview(db, scope, key) {
    return (await db.query(`/*word:idempotency*/ SELECT p.*,v.name AS source_name FROM signing_word_previews p
        JOIN signing_word_sources s ON s.owner_context_id=p.owner_context_id AND s.id=p.source_id AND s.created_by=p.created_by
        JOIN signing_word_source_versions v ON v.owner_context_id=p.owner_context_id AND v.source_id=p.source_id
            AND v.version=p.source_version AND v.created_by=p.created_by
        WHERE p.owner_context_id=$1 AND p.created_by=$2 AND p.idempotency_key=$3`, [scope.contextId, scope.userId, key])).rows[0];
}
async function previewAccess(db, scope, row) {
    const current = await source(db, scope, row.source_id);
    expect(current.source_sha256 === row.source_sha256, 'SOURCE_CHANGED');
    const refs = row.converter?.accessRefs;
    expect(plain(refs) && plain(refs.roleClientIds), 'INVALID_SOURCE');
    // References are persisted, not raw values; every read rechecks current access.
    await resolveValues(db, scope, { clientId: row.client_id, caseId: row.case_id, roleClientIds: refs.roleClientIds, manualValues: {} });
    return row;
}
async function preview(pool, scope, id, input, { storage, convertDocxToPdf } = {}) {
    scopeCheck(scope); expect(plain(input), 'INVALID_WORD_INPUTS'); version(input.expectedVersion);
    expect(typeof input.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,128}$/u.test(input.idempotencyKey), 'INVALID_IDEMPOTENCY_KEY');
    const row = await source(pool, scope, id);
    if (Number(row.version) !== input.expectedVersion || row.bindings_hash !== input.bindingsHash) fail('VERSION_CHANGED', 412);
    expect(Array.isArray(row.bindings) && row.bindings.length > 0, 'WORD_BINDINGS_REQUIRED');
    const inputs = inputsFor(row, input);
    const inputsHash = digest({ sourceId: id, sourceHash: row.source_sha256, version: Number(row.version), bindingsHash: row.bindings_hash, inputs });
    const reuse = async (db, existing) => {
        if (existing.inputs_hash !== inputsHash || existing.source_id !== id) fail('IDEMPOTENCY_CONFLICT', 409);
        await previewAccess(db, scope, existing);
        if (digest(await resolveValues(db, scope, inputs)) !== existing.values_hash) fail('WORD_INPUTS_CHANGED', 412);
        await pdfBytes(existing, storage); return previewView(existing);
    };
    const existing = await existingPreview(pool, scope, input.idempotencyKey);
    if (existing) return transaction(pool, async db => {
        const current = await source(db, scope, id, { lock: true });
        if (Number(current.version) !== Number(row.version) || current.bindings_hash !== row.bindings_hash || current.source_sha256 !== row.source_sha256) fail('VERSION_CHANGED', 412);
        return reuse(db, existing);
    });
    const values = await resolveValues(pool, scope, inputs);
    const valuesHash = digest(values);
    const bytes = await sourceBytes(row, storage);
    const filled = word(() => materializeDocx(bytes, { sourceHash: row.source_sha256, bindings: row.bindings, values }));
    const convert = convertDocxToPdf || require('../../lib/wordTemplates/converter').convertDocxToPdf;
    // Operational conversion errors retain their type/code for the route's
    // HTTP classification and administrator alert pipeline.
    const converted = await convert(filled.buffer);
    await validatePdf(converted, filled);
    const pdfHash = bytesHash(converted.buffer);
    const objectKey = `signing-v2/${scope.contextId}/word/${scope.userId}/previews/${pdfHash}.pdf`;
    await writeVerified(storage, objectKey, converted.buffer);
    return transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`word-preview:${scope.contextId}:${scope.userId}:${input.idempotencyKey}`]);
        const current = await source(db, scope, id, { lock: true });
        if (Number(current.version) !== Number(row.version) || current.bindings_hash !== row.bindings_hash || current.source_sha256 !== row.source_sha256) fail('VERSION_CHANGED', 412);
        const concurrent = await existingPreview(db, scope, input.idempotencyKey);
        if (concurrent) return reuse(db, concurrent);
        if (digest(await resolveValues(db, scope, inputs, true)) !== valuesHash) fail('WORD_INPUTS_CHANGED', 412);
        const converter = { engine: 'libreoffice', accessRefs: { roleClientIds: inputs.roleClientIds } };
        const saved = (await db.query(`/*word:preview*/ INSERT INTO signing_word_previews
            (id,owner_context_id,source_id,source_version,created_by,idempotency_key,inputs_hash,values_hash,source_sha256,
            bindings_hash,filled_docx_sha256,pdf_sha256,object_key,bytes,page_count,client_id,case_id,converter)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [randomUUID(), scope.contextId, id, Number(row.version), scope.userId, input.idempotencyKey, inputsHash, valuesHash,
            row.source_sha256, row.bindings_hash, filled.outputHash, pdfHash, objectKey, converted.buffer.length,
            converted.pageCount, inputs.clientId, inputs.caseId, converter])).rows[0];
        return previewView({ ...saved, source_name: row.name });
    });
}
async function readPreview(db, scope, id) {
    scopeCheck(scope); expect(typeof id === 'string' && UUID.test(id), 'INVALID_WORD_PREVIEW');
    const row = (await db.query(`/*word:readPreview*/ SELECT p.*,v.name AS source_name FROM signing_word_previews p
        JOIN signing_word_sources s ON s.owner_context_id=p.owner_context_id AND s.id=p.source_id AND s.created_by=p.created_by
        JOIN signing_word_source_versions v ON v.owner_context_id=p.owner_context_id AND v.source_id=p.source_id
            AND v.version=p.source_version AND v.created_by=p.created_by
        WHERE p.owner_context_id=$1 AND p.id=$2 AND p.created_by=$3`, [scope.contextId, id, scope.userId])).rows[0];
    if (!row) fail('NOT_FOUND', 404);
    return previewAccess(db, scope, row);
}
async function previewInfo(db, scope, id) { return previewView(await readPreview(db, scope, id)); }
async function previewPdf(db, scope, id, { storage } = {}) {
    const row = await readPreview(db, scope, id); return { ...previewView(row), bytes: await pdfBytes(row, storage) };
}
async function archive(pool, scope, id, input) {
    scopeCheck(scope); expect(plain(input) && typeof input.archived === 'boolean', 'INVALID_WORD_TEMPLATE'); version(input.expectedVersion);
    return transaction(pool, async db => {
        const row = await source(db, scope, id, { lock: true, archived: true });
        if (Number(row.version) !== input.expectedVersion) fail('VERSION_CHANGED', 412);
        if (row.archived === input.archived) return { id, archived: row.archived, version: Number(row.version) };
        const changed = (await db.query(`/*word:archive*/ UPDATE signing_word_sources SET archived=$4,version=version+1,updated_at=clock_timestamp()
            WHERE owner_context_id=$1 AND id=$2 AND created_by=$3 AND version=$5 RETURNING *`, [scope.contextId, id, scope.userId, input.archived, input.expectedVersion])).rows[0];
        if (!changed) fail('VERSION_CHANGED', 412);
        await appendVersion(db, scope, changed);
        return { id, archived: changed.archived, version: Number(changed.version) };
    });
}

module.exports = { list, importSource, load, save, preview, previewInfo, previewPdf, archive };

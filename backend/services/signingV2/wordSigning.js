'use strict';

const { randomUUID } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect } = require('../../lib/signingV2/errors');
const { pageGeometryFromPdfLibPage } = require('../../lib/signingGeometry');
const limits = require('../../lib/signingV2/limits');
const wordDefault = require('./wordTemplates');
const templatesDefault = require('./templates');
const { versionView } = require('./authoring');

const HASH = /^[a-f0-9]{64}$/u;
const ROLE_LABEL = { he: 'חותם ראשון', ar: 'الموقّع الأول', en: 'First signer' };

// Word data roles never establish signing identity or authority. Start with an
// explicit, unassigned role and NO geometry; the native editor places fields on
// these immutable final PDF bytes. Publication still requires signing obligations.
function definitionFor(material, artifact, locale) {
    const name = String(material.preview.name || 'Document').replace(/\.(pdf|docx)$/iu, '').trim().slice(0, 200) || 'Document';
    return { schemaVersion: 2, name, locale, origin: material.origin, dataKeys: [],
        stages: [{ key: 'first', label: ROLE_LABEL[locale], after: null }],
        roles: [{ key: 'first', label: ROLE_LABEL[locale], capacity: 'personal', audience: 'each', stage: 0, min: 1, max: 1 }],
        documents: [{ key: 'wordFinal', name: `${name.slice(0, 196)}.pdf`, sourceArtifactId: artifact.id,
            sourceHash: material.origin.pdfHash, fields: [] }],
        policy: { otpRequired: true, deliveryMode: 'invite' } };
}

async function geometries(bytes) {
    let pdf;
    try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true }); }
    catch { expect(false, 'INVALID_SOURCE'); }
    expect(pdf.getPageCount() > 0 && pdf.getPageCount() <= limits.sourcePagesPerDocument, 'INVALID_SOURCE');
    return pdf.getPages().map(page => {
        const geometry = pageGeometryFromPdfLibPage(page);
        expect(Number.isFinite(geometry.visualWidth) && Number.isFinite(geometry.visualHeight)
            && geometry.visualWidth > 0 && geometry.visualHeight > 0, 'INVALID_SOURCE');
        return { width: geometry.visualWidth, height: geometry.visualHeight };
    });
}

async function createDraft(pool, scope, previewId, input, { storage, word = wordDefault, templates = templatesDefault } = {}) {
    expect(input && typeof input === 'object' && !Array.isArray(input)
        && Object.keys(input).every(key => ['expectedPdfHash', 'locale', 'idempotencyKey'].includes(key)), 'INVALID_WORD_INPUTS');
    expect(UUID.test(previewId) && UUID.test(input.idempotencyKey || '') && HASH.test(input.expectedPdfHash || '')
        && Object.hasOwn(ROLE_LABEL, input.locale), 'INVALID_WORD_INPUTS');
    expect(storage && typeof storage.write === 'function' && typeof storage.verify === 'function' && typeof storage.read === 'function', 'WORD_STORAGE_UNAVAILABLE');
    const material = await word.signingMaterial(pool, scope, previewId, { storage });
    expect(material.preview.id === previewId && material.origin.pdfHash === input.expectedPdfHash
        && Buffer.isBuffer(material.bytes) && bytesHash(material.bytes) === input.expectedPdfHash
        && material.bytes.length <= limits.sourceBytesPerDocument, 'SOURCE_CHANGED');
    const pages = await geometries(material.bytes);
    const inputsHash = digest({ wordSigningSource: 1, contextId: scope.contextId, userId: scope.userId, origin: material.origin });
    const key = `signing-v2/${scope.contextId}/sources/${inputsHash}.pdf`;
    // New immutable Word material is registered directly; the client neither
    // re-uploads nor supplies an object key or provenance. Readback proves bytes.
    await storage.write(key, material.bytes);
    await storage.verify(key, material.bytes.length, input.expectedPdfHash);
    const readback = await storage.read(key, material.bytes.length);
    expect(Buffer.isBuffer(readback) && readback.length === material.bytes.length
        && bytesHash(readback) === input.expectedPdfHash, 'ARTIFACT_HASH_MISMATCH');
    const result = await pool.query(`/*word:signingArtifact*/ INSERT INTO signing_artifacts
        (id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at,created_by)
        VALUES($1,$2,'source',$3,$4,$5,$6,'ready',$7,clock_timestamp(),$8)
        ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING RETURNING *`,
    [randomUUID(), scope.contextId, inputsHash, input.expectedPdfHash, key, material.bytes.length,
        { pages, wordOrigin: material.origin }, scope.userId]);
    const artifact = result.rows[0] || (await pool.query(`/*word:signingArtifactRead*/ SELECT * FROM signing_artifacts
        WHERE owner_context_id=$1 AND kind='source' AND inputs_hash=$2 AND state='ready' AND created_by=$3`,
    [scope.contextId, inputsHash, scope.userId])).rows[0];
    expect(artifact && artifact.created_by === scope.userId && artifact.content_sha256 === input.expectedPdfHash
        && artifact.object_key === key && Number(artifact.bytes) === material.bytes.length
        && artifact.metadata?.wordOrigin && digest(artifact.metadata.wordOrigin) === digest(material.origin), 'SOURCE_CHANGED');
    // The transactional native source boundary rechecks and locks Word origin
    // availability, including the exact source version. A concurrent edit cannot
    // create a usable draft for an obsolete mapping.
    const row = await templates.createDraft(pool, scope, { draftId: input.idempotencyKey,
        definition: definitionFor(material, artifact, input.locale) });
    return { version: versionView(row), source: { id: artifact.id, hash: artifact.content_sha256, pages }, origin: material.origin };
}

module.exports = { createDraft, definitionFor, geometries };

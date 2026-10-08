const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const limits = require('../../lib/signingV2/limits');
const templates = require('./templates');

function versionView(row) {
    return { id: row.id, templateId: row.template_id, version: row.version, editVersion: row.edit_version,
        baseVersionId: row.base_version_id || null, state: row.state, definition: row.definition,
        definitionHash: row.definition_hash, publishedAt: row.published_at, createdAt: row.created_at };
}

async function loadVersion(db, scope, id) {
    expect(UUID.test(id), 'INVALID_TEMPLATE');
    const row = (await db.query(`SELECT v.* FROM signing_template_versions v JOIN signing_templates t
        ON t.owner_context_id=v.owner_context_id AND t.id=v.template_id
        WHERE v.owner_context_id=$1 AND v.id=$2 AND NOT t.archived AND ($3::boolean OR t.owner_userid=$4)
        AND (v.state='published' OR v.created_by=$4)`, [scope.contextId, id, scope.all, scope.userId])).rows[0];
    if (!row) fail('NOT_FOUND', 404);
    return row;
}

async function catalog(db, scope) {
    const rows = (await db.query(`SELECT v.*,t.name AS template_name,t.owner_userid FROM signing_templates t
        JOIN LATERAL (SELECT * FROM signing_template_versions v WHERE v.owner_context_id=t.owner_context_id AND v.template_id=t.id
            AND ((v.state='draft' AND v.created_by=$3) OR (v.state='published' AND v.version=(SELECT max(p.version)
                FROM signing_template_versions p WHERE p.owner_context_id=t.owner_context_id AND p.template_id=t.id AND p.state='published')))) v ON TRUE
        WHERE t.owner_context_id=$1 AND NOT t.archived AND ($2::boolean OR t.owner_userid=$3)
        ORDER BY t.updated_at DESC,t.id LIMIT 200`, [scope.contextId, scope.all, scope.userId])).rows;
    return { templates: rows.map(row => ({ ...versionView(row), canEdit: row.state === 'draft' ? row.created_by === scope.userId : row.owner_userid === scope.userId || scope.manage })) };
}

// A guessed artifact ID is not access to another user's source PDF. References
// already in an accessible template may be retained when its owner changes.
async function assertSources(db, scope, definition) {
    expect(definition?.schemaVersion === 2, 'INVALID_TEMPLATE');
    const documents = definition.documents || [];
    expect(Array.isArray(documents) && documents.length <= limits.documentsPerPackage, 'INVALID_DEFINITION');
    const ids = [...new Set(documents.map(doc => doc?.sourceArtifactId))];
    expect(ids.every(id => typeof id === 'string' && UUID.test(id)), 'INVALID_SOURCE');
    if (!ids.length) return;
    const sources = (await db.query(`SELECT a.id,a.content_sha256 FROM signing_artifacts a
        WHERE a.owner_context_id=$1 AND a.id=ANY($2::uuid[]) AND a.kind='source' AND a.state='ready'
        AND ($3::boolean OR a.created_by=$4 OR EXISTS (SELECT 1 FROM signing_templates t
            JOIN signing_template_versions v ON v.owner_context_id=t.owner_context_id AND v.template_id=t.id
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v.definition->'documents','[]')) d
            WHERE t.owner_context_id=a.owner_context_id AND t.owner_userid=$4 AND NOT t.archived
            AND (v.state='published' OR v.created_by=$4) AND d->>'sourceArtifactId'=a.id::text))`,
    [scope.contextId, ids, scope.all, scope.userId])).rows;
    if (sources.length !== ids.length) fail('NOT_FOUND', 404);
    const hashes = new Map(sources.map(source => [source.id, source.content_sha256]));
    for (const doc of documents) expect(hashes.get(doc.sourceArtifactId) === doc.sourceHash, 'SOURCE_CHANGED', doc.key);
}

async function save(pool, scope, id, input) {
    expect(UUID.test(id), 'INVALID_TEMPLATE');
    expect(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 0, 'INVALID_PRECONDITION');
    await assertSources(pool, scope, input.definition);
    if (input.expectedVersion === 0) {
        if (input.templateId) {
            expect(UUID.test(input.templateId) && UUID.test(input.baseVersionId), 'PRECONDITION_REQUIRED');
        } else expect(input.baseVersionId == null, 'INVALID_PRECONDITION');
        return versionView(await templates.createDraft(pool, scope, { ...input, draftId: id }));
    }
    const current = await loadVersion(pool, scope, id);
    if (input.templateId && input.templateId !== current.template_id) fail('VERSION_CHANGED', 412);
    return versionView(await templates.saveDraft(pool, scope, current.template_id, id, input.definition, input.expectedVersion));
}

async function publish(pool, scope, id, input) {
    const current = await loadVersion(pool, scope, id);
    await assertSources(pool, scope, current.definition);
    // Publishing is explicit and hash-bound. It never starts delivery jobs.
    return versionView(await templates.publish(pool, scope, current.template_id, id, input.expectedVersion, input.definitionHash));
}

async function registerSource(pool, scope, fileKey, { readPdf, storage }) {
    expect(typeof fileKey === 'string' && fileKey.length <= 1000 && fileKey.startsWith(`users/${scope.userId}/`), 'INVALID_SOURCE');
    const file = await readPdf(fileKey, { maxBytes: limits.sourceBytesPerDocument });
    const hash = bytesHash(file.bytes);
    expect(file.sha256 === hash && file.bytes.length > 0 && file.bytes.length <= limits.sourceBytesPerDocument
        && file.geometries.length > 0 && file.geometries.length <= limits.sourcePagesPerDocument, 'INVALID_SOURCE');
    const inputsHash = digest({ authoringSource: 1, contextId: scope.contextId, userId: scope.userId, hash });
    const existing = (await pool.query("SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND kind='source' AND inputs_hash=$2", [scope.contextId, inputsHash])).rows[0];
    const publicSource = row => ({ id: row.id, hash: row.content_sha256, bytes: Number(row.bytes), pages: row.metadata.pages });
    if (existing) {
        await storage.verify(existing.object_key, Number(existing.bytes), existing.content_sha256);
        return publicSource(existing);
    }
    // Content-addressed immutable key: simultaneous identical imports write
    // identical bytes. Retrying after upload/DB failure cannot replace a PDF.
    const objectKey = `signing-v2/${scope.contextId}/sources/${inputsHash}.pdf`;
    await storage.write(objectKey, file.bytes);
    await storage.verify(objectKey, file.bytes.length, hash);
    const result = await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at,created_by)
        VALUES($1,$2,'source',$3,$4,$5,$6,'ready',$7,clock_timestamp(),$8)
        ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING RETURNING *`,
    [randomUUID(), scope.contextId, inputsHash, hash, objectKey, file.bytes.length, { pages: file.geometries }, scope.userId]);
    const row = result.rows[0] || (await pool.query("SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND kind='source' AND inputs_hash=$2", [scope.contextId, inputsHash])).rows[0];
    return publicSource(row);
}

async function documentFile(pool, scope, id, documentKey, storage) {
    const version = await loadVersion(pool, scope, id);
    const doc = version.definition.documents?.find(item => item.key === documentKey);
    if (!doc) fail('NOT_FOUND', 404);
    await assertSources(pool, scope, { schemaVersion: 2, documents: [doc] });
    const source = (await pool.query("SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND kind='source' AND state='ready'", [scope.contextId, doc.sourceArtifactId])).rows[0];
    const bytes = await storage.read(source.object_key, Number(source.bytes));
    expect(bytesHash(bytes) === doc.sourceHash, 'ARTIFACT_HASH_MISMATCH');
    return { bytes };
}

module.exports = { catalog, loadVersion, versionView, save, publish, registerSource, documentFile };

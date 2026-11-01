const { canonical } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');

const KEYS = ['kind', 'previewId', 'sourceId', 'sourceVersion', 'sourceHash', 'bindingsHash',
    'filledDocxHash', 'valuesHash', 'inputsHash', 'pdfHash', 'authorUserId'];
const HASHES = ['sourceHash', 'bindingsHash', 'filledDocxHash', 'valuesHash', 'inputsHash', 'pdfHash'];
const isWord = definition => definition?.origin?.kind === 'word_preview';
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;

function validateWordOrigin(origin) {
    expect(plain(origin) && Object.keys(origin).length === KEYS.length && KEYS.every(key => Object.hasOwn(origin, key)), 'INVALID_WORD_ORIGIN');
    expect(origin.kind === 'word_preview' && UUID.test(origin.previewId) && UUID.test(origin.sourceId), 'INVALID_WORD_ORIGIN');
    expect(Number.isSafeInteger(origin.sourceVersion) && origin.sourceVersion > 0
        && Number.isSafeInteger(origin.authorUserId) && origin.authorUserId > 0, 'INVALID_WORD_ORIGIN');
    expect(HASHES.every(key => typeof origin[key] === 'string' && /^[a-f0-9]{64}$/.test(origin[key])), 'INVALID_WORD_ORIGIN');
    return origin;
}

// Arguments below are trusted SQL identifiers/parameter placeholders from callers.
// Inspect source metadata too, so removing definition.origin cannot broaden access.
function wordTemplateScopeSql(user, definition = 'v.definition', author = 'v.created_by', owner = 't.owner_userid', context = 'v.owner_context_id') {
    return `(NOT (COALESCE(${definition}->'origin'->>'kind','')='word_preview' OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${definition}->'documents')='array'
            THEN ${definition}->'documents' ELSE '[]'::jsonb END) word_doc
        JOIN signing_artifacts word_asset ON word_asset.id::text=word_doc->>'sourceArtifactId'
            AND word_asset.owner_context_id=${context}
        WHERE word_asset.metadata ? 'wordOrigin')) OR (${author}=${user} AND ${owner}=${user}))`;
}

function wordArtifactScopeSql(user, alias = 'a') {
    return `(NOT COALESCE(${alias}.metadata ? 'wordOrigin',false) OR (${alias}.created_by=${user}
        AND ${alias}.metadata->'wordOrigin'->>'authorUserId'=${user}::text))`;
}

async function assertCurrentWordOrigin(db, scope, origin) {
    validateWordOrigin(origin);
    if (origin.authorUserId !== scope.userId) fail('NOT_FOUND', 404);
    const result = await db.query(`/*word-origin:current*/ SELECT s.id FROM signing_word_sources s
        JOIN signing_word_previews p ON p.owner_context_id=s.owner_context_id AND p.source_id=s.id AND p.created_by=s.created_by
        WHERE s.owner_context_id=$1 AND s.created_by=$2 AND s.id=$3 AND p.id=$4 AND NOT s.archived
            AND s.version=$5 AND p.source_version=s.version AND s.source_sha256=$6 AND p.source_sha256=s.source_sha256
            AND s.bindings_hash=$7 AND p.bindings_hash=s.bindings_hash AND p.filled_docx_sha256=$8
            AND p.values_hash=$9 AND p.inputs_hash=$10 AND p.pdf_sha256=$11 FOR SHARE OF s,p`,
    [scope.contextId, scope.userId, origin.sourceId, origin.previewId, origin.sourceVersion, origin.sourceHash,
        origin.bindingsHash, origin.filledDocxHash, origin.valuesHash, origin.inputsHash, origin.pdfHash]);
    if (!result.rowCount) fail('WORD_SOURCE_CHANGED', 412);
    // No storage read: permission revocation must apply to the persisted client,
    // case and role references even after a PDF became a native source artifact.
    await require('./wordTemplates').assertPreviewReferences(db, scope, origin.previewId);
    return origin;
}

async function assertWordDefinition(db, scope, definition, { previousDefinition, sources } = {}) {
    const documents = Array.isArray(definition?.documents) ? definition.documents : [];
    const previousDocuments = Array.isArray(previousDefinition?.documents) ? previousDefinition.documents : [];
    const ids = [...new Set([...documents, ...previousDocuments].map(doc => doc?.sourceArtifactId).filter(id => UUID.test(String(id))))];
    let rows;
    if (sources && !previousDefinition) rows = [...sources.values()].filter(row => Object.hasOwn(row.metadata || {}, 'wordOrigin'));
    else rows = ids.length ? (await db.query(`/*word-origin:sources*/ SELECT id,owner_context_id,created_by,content_sha256,metadata,kind,state
        FROM signing_artifacts WHERE owner_context_id=$1 AND id=ANY($2::uuid[]) AND metadata ? 'wordOrigin' FOR SHARE`, [scope.contextId, ids])).rows : [];
    if (!isWord(definition) && !isWord(previousDefinition) && !rows.length) return null;
    expect(isWord(definition), 'WORD_ORIGIN_REQUIRED');
    const origin = validateWordOrigin(definition.origin);
    if (origin.authorUserId !== scope.userId) fail('NOT_FOUND', 404);
    if (isWord(previousDefinition)) expect(canonical(origin) === canonical(validateWordOrigin(previousDefinition.origin)), 'WORD_ORIGIN_CHANGED');
    const byId = new Map(rows.map(row => [row.id, row]));
    let bound = 0;
    for (const document of documents) {
        const source = byId.get(document.sourceArtifactId);
        if (!source) continue;
        const stored = validateWordOrigin(source.metadata.wordOrigin);
        if (source.owner_context_id !== scope.contextId || source.created_by !== scope.userId || stored.authorUserId !== scope.userId) fail('NOT_FOUND', 404);
        expect(source.kind === 'source' && source.state === 'ready' && canonical(stored) === canonical(origin), 'WORD_ORIGIN_CHANGED');
        expect(source.content_sha256 === origin.pdfHash && document.sourceHash === origin.pdfHash, 'WORD_ORIGIN_CHANGED');
        bound += 1;
    }
    expect(bound > 0, 'WORD_ORIGIN_REQUIRED');
    await assertCurrentWordOrigin(db, scope, origin);
    return origin;
}

async function assertWordPackageContext(db, scope, definition, packages) {
    if (!isWord(definition)) return null;
    const origin = validateWordOrigin(definition.origin);
    if (origin.authorUserId !== scope.userId) fail('NOT_FOUND', 404);
    const preview = (await db.query(`/*word-origin:package-context*/ SELECT client_id,case_id FROM signing_word_previews
        WHERE owner_context_id=$1 AND created_by=$2 AND id=$3 FOR SHARE`, [scope.contextId, scope.userId, origin.previewId])).rows[0];
    if (!preview) fail('NOT_FOUND', 404);
    // These are associations used to fill this exact immutable PDF, not signer
    // identities. Representatives and additional signing roles remain explicit.
    for (const [column, key] of [['client_id', 'clientId'], ['case_id', 'caseId']]) {
        if (preview[column] != null && packages.some(item => item[key] !== Number(preview[column]))) fail('WORD_CONTEXT_CHANGED', 412);
    }
    return { clientId: preview.client_id ?? null, caseId: preview.case_id ?? null };
}

async function filterAvailableWordVersions(db, scope, rows) {
    const available = [];
    for (const row of rows) {
        if (isWord(row.definition)) {
            try { await assertWordDefinition(db, scope, row.definition); }
            catch (error) {
                if (['NOT_FOUND', 'FORBIDDEN', 'WORD_SOURCE_CHANGED', 'INVALID_WORD_ORIGIN', 'WORD_ORIGIN_CHANGED', 'WORD_ORIGIN_REQUIRED'].includes(error.errorCode || error.code)) continue;
                throw error;
            }
        }
        available.push(row);
    }
    return available;
}

module.exports = { validateWordOrigin, assertWordDefinition, assertCurrentWordOrigin, assertWordPackageContext,
    wordTemplateScopeSql, wordArtifactScopeSql, filterAvailableWordVersions };

const { digest } = require('../../lib/signingV2/canonical');

// A completed copy is bounded by the immutable recipient visibility, never by
// the office's broader access or a shared signer's other packages in the run.
async function completedDocuments(db, contextId, revisionId, personId) {
    return (await db.query(`SELECT d.id AS "documentId",d.name AS "documentName",
            d.final_artifact_id AS "artifactId",a.content_sha256 AS "contentHash",
            (d.state='final' AND a.state='ready') IS TRUE AS ready
        FROM signing_package_revisions r
        CROSS JOIN LATERAL jsonb_array_elements(r.snapshot->'documents') source
        JOIN signing_documents d ON d.owner_context_id=r.owner_context_id AND d.revision_id=r.id
            AND d.document_key=source->>'key'
        LEFT JOIN signing_artifacts a ON a.owner_context_id=d.owner_context_id AND a.id=d.final_artifact_id
        WHERE r.owner_context_id=$1 AND r.id=$2 AND source->'readPersonIds' ? $3
        ORDER BY d.id`, [contextId, revisionId, personId])).rows;
}

const documentManifest = documents => documents.map(({ documentId, artifactId, contentHash }) => ({ documentId, artifactId, contentHash }));
const manifestHash = documents => digest(documentManifest(documents));
const copiesReady = documents => documents.length > 0 && documents.every(document => document.ready);

module.exports = { completedDocuments, documentManifest, manifestHash, copiesReady };

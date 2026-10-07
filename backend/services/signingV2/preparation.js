const { randomUUID } = require('node:crypto');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { rendererAssets } = require('../../lib/signingV2/dataRenderer');
const { fail, expect } = require('../../lib/signingV2/errors');
const { complete } = require('./jobs');
const { SourceCache } = require('../../lib/signingV2/sourceCache');

function createPreparationService({ pool, renderer, storage, sourceCache = new SourceCache() }) {
    const rendererHash = rendererAssets().hash;
    return async function prepareDocument(lease) {
        expect(lease.kind === 'prepare_document', 'INVALID_JOB');
        const result = await pool.query(`SELECT d.*,r.snapshot,r.revision_hash,r.workflow_state,p.active_revision_id,
            a.object_key,a.content_sha256,a.bytes,a.metadata,a.kind AS source_kind,a.state AS source_state
            FROM signing_documents d
            JOIN signing_package_revisions r ON r.owner_context_id=d.owner_context_id AND r.id=d.revision_id
            JOIN signing_packages p ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
            JOIN signing_artifacts a ON a.owner_context_id=d.owner_context_id AND a.id=d.source_artifact_id
            JOIN signing_jobs j ON j.owner_context_id=d.owner_context_id AND j.subject_id=d.id
            WHERE d.owner_context_id=$1 AND d.id=$2 AND j.id=$3 AND j.fencing_token=$4 AND j.leased_by=$5
                AND j.state='running' AND j.lease_until > clock_timestamp()`,
        [lease.owner_context_id, lease.subject_id, lease.id, lease.fencing_token, lease.leased_by]);
        if (!result.rowCount) fail('WORKER_LEASE_LOST', 409);
        const document = result.rows[0];
        expect(document.active_revision_id === document.revision_id && ['authorized_preparing', 'active', 'attention'].includes(document.workflow_state), 'REVISION_INACTIVE');
        expect(document.source_state === 'ready' && document.source_kind === 'source', 'INVALID_SOURCE');
        expect(lease.input_hash === digest({ revision: document.revision_hash, document: document.document_key }), 'REVISION_CHANGED');
        const source = { id: document.source_artifact_id, content_sha256: document.content_sha256, object_key: document.object_key, bytes: document.bytes };
        const sourceBytes = await sourceCache.get(lease.owner_context_id, source, key => storage.read(key, Number(source.bytes)));
        const inputHash = digest({ revisionHash: document.revision_hash, documentKey: document.document_key, rendererHash });
        const prepared = await renderer.render({ sourceBytes, expectedSourceHash: document.content_sha256, fields: document.field_bindings, locale: document.snapshot.locale });
        expect(prepared.rendererHash === rendererHash && bytesHash(prepared.bytes) === prepared.contentHash, 'ARTIFACT_HASH_MISMATCH');
        const artifactId = randomUUID();
        // A unique object key prevents a stale worker overwriting the winner's file.
        const key = `signing-v2/${lease.owner_context_id}/prepared/${artifactId}.pdf`;
        await storage.write(key, prepared.bytes, { contentType: 'application/pdf', sha256: prepared.contentHash });
        await storage.verify(key, prepared.bytes.length, prepared.contentHash);
        return complete(pool, lease, async db => {
            const current = await db.query(`SELECT r.id FROM signing_package_revisions r JOIN signing_packages p
                ON p.owner_context_id=r.owner_context_id AND p.id=r.package_id
                WHERE r.owner_context_id=$1 AND r.id=$2 AND p.active_revision_id=r.id
                AND r.workflow_state IN ('authorized_preparing','active','attention') FOR UPDATE OF r`, [lease.owner_context_id, document.revision_id]);
            if (!current.rowCount) fail('REVISION_INACTIVE', 409);
            await db.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at)
                VALUES($1,$2,'prepared',$3,$4,$5,$6,'ready',$7,clock_timestamp())
                ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING`,
            [artifactId, lease.owner_context_id, inputHash, prepared.contentHash, key, prepared.bytes.length,
                { rendererHash, sourceHash: document.content_sha256, pages: prepared.geometry }]);
            const artifact = (await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND kind='prepared' AND inputs_hash=$2`, [lease.owner_context_id, inputHash])).rows[0];
            expect(artifact?.state === 'ready', 'ARTIFACT_NOT_READY');
            const updated = await db.query(`UPDATE signing_documents SET prepared_artifact_id=$1,state='ready'
                WHERE owner_context_id=$2 AND id=$3 AND (prepared_artifact_id IS NULL OR prepared_artifact_id=$1)`, [artifact.id, lease.owner_context_id, document.id]);
            expect(updated.rowCount === 1, 'ARTIFACT_CHANGED');
            return { artifactId: artifact.id, contentHash: artifact.content_sha256, bytes: Number(artifact.bytes) };
        });
    };
}

module.exports = { createPreparationService };

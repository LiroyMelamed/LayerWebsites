const { randomUUID } = require('node:crypto');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { UUID } = require('../../lib/signingV2/compiler');
const { signatureImage } = require('../../lib/signingV2/stamp');

const isCompletionMark = field => field.type === 'completionMark';
const view = row => ({ id: row.id, hash: row.content_sha256, kind: row.metadata.markKind, authorizedBy: row.created_by });

async function register(pool, scope, input, storage) {
    if (!scope.send || !scope.templateManage) fail('FORBIDDEN', 403);
    expect(input.authorized === true && ['office_stamp', 'lawyer_signature', 'combined'].includes(input.kind), 'COMPLETION_MARK_AUTHORIZATION_REQUIRED');
    expect(typeof input.image === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.image) && input.image.length <= 410000, 'INVALID_SIGNATURE');
    const bytes = Buffer.from(input.image.split(',')[1], 'base64');
    signatureImage(bytes);
    // Validate the complete PNG, not just its claimed dimensions.
    try { await require('pdf-lib').PDFDocument.create().then(pdf => pdf.embedPng(bytes)); }
    catch { fail('INVALID_SIGNATURE'); }
    const hash = bytesHash(bytes);
    const inputsHash = digest({ completionMark: 1, userId: scope.userId, hash, kind: input.kind });
    const objectKey = `signing-v2/${scope.contextId}/completion-marks/${inputsHash}.png`;
    await storage.write(objectKey, bytes, { contentType: 'image/png', sha256: hash });
    await storage.verify(objectKey, bytes.length, hash);
    const row = (await pool.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at,created_by)
        VALUES($1,$2,'signature',$3,$4,$5,$6,'ready',$7,clock_timestamp(),$8)
        ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING RETURNING *`,
    [randomUUID(), scope.contextId, inputsHash, hash, objectKey, bytes.length,
        { purpose: 'automatic_completion', markKind: input.kind, authorization: 'explicit_template_authorization_v1' }, scope.userId])).rows[0]
        || (await pool.query('SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND kind=\'signature\' AND inputs_hash=$2', [scope.contextId, inputsHash])).rows[0];
    return view(row);
}

async function assertAssets(db, scope, definition) {
    const fields = (definition.documents || []).flatMap(doc => doc.fields || []).filter(isCompletionMark);
    if (!fields.length) return;
    const ids = [...new Set(fields.map(field => field.assetId))];
    expect(ids.every(id => typeof id === 'string' && UUID.test(id)), 'INVALID_SIGNATURE');
    const rows = (await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=ANY($2::uuid[])
        AND kind='signature' AND state='ready' AND metadata->>'purpose'='automatic_completion'
        AND ($3::boolean OR created_by=$4)`, [scope.contextId, ids, scope.all && scope.templateManage === true, scope.userId])).rows;
    if (rows.length !== ids.length) fail('NOT_FOUND', 404);
    const assets = new Map(rows.map(row => [row.id, row]));
    for (const field of fields) expect(assets.get(field.assetId).content_sha256 === field.assetHash, 'ARTIFACT_HASH_MISMATCH');
}

async function read(db, scope, id, storage) {
    expect(typeof id === 'string' && UUID.test(id), 'INVALID_SIGNATURE');
    await assertAssets(db, scope, { documents: [{ fields: [{ type: 'completionMark', assetId: id, assetHash:
        (await db.query('SELECT content_sha256 FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2', [scope.contextId, id])).rows[0]?.content_sha256 }] }] });
    const row = (await db.query('SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2', [scope.contextId, id])).rows[0];
    const bytes = await storage.read(row.object_key, Number(row.bytes));
    expect(bytesHash(bytes) === row.content_sha256, 'ARTIFACT_HASH_MISMATCH');
    return { ...view(row), image: `data:image/png;base64,${bytes.toString('base64')}` };
}

async function applyMarks(db, document, kind, readArtifact, images, marks) {
    const fields = document.field_bindings.filter(isCompletionMark);
    if (!fields.length || kind !== 'final') return [];
    const open = (await db.query(`SELECT count(*)::integer AS count FROM signing_tasks
        WHERE owner_context_id=$1 AND revision_id=$2 AND required AND state<>'accepted'`, [document.owner_context_id, document.revision_id])).rows[0];
    expect(open.count === 0, 'SIGNATURES_INCOMPLETE');
    const ids = [...new Set(fields.map(field => field.assetId))];
    const rows = (await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=ANY($2::uuid[])
        AND kind='signature' AND state='ready' AND metadata->>'purpose'='automatic_completion'`, [document.owner_context_id, ids])).rows;
    const assets = new Map(rows.map(row => [row.id, row]));
    for (const field of fields) {
        const asset = assets.get(field.assetId);
        expect(asset && asset.content_sha256 === field.assetHash, 'ARTIFACT_HASH_MISMATCH');
        if (!images.has(asset.id)) images.set(asset.id, await readArtifact(asset));
        marks.push({ fieldId: field.id, type: field.type, value: asset.id });
    }
    return fields.map(field => ({ fieldId: field.id, hash: field.assetHash, kind: assets.get(field.assetId).metadata.markKind, authorizedBy: assets.get(field.assetId).created_by }));
}
module.exports = { register, read, assertAssets, applyMarks, isCompletionMark };

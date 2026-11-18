'use strict';
const { UUID } = require('../../lib/signingV2/compiler');
const { digest } = require('../../lib/signingV2/canonical');
const { fail, expect } = require('../../lib/signingV2/errors');
const { normalizeRecipe, assertReadyRecipe } = require('../../lib/signingV2/packageRecipe');
const { transaction } = require('./transaction');
function check(scope) {
    expect(scope && UUID.test(scope.contextId) && Number.isSafeInteger(scope.userId) && scope.userId > 0, 'CONTEXT_REQUIRED');
}
function canEdit(row, scope) { return scope.send === true && (row.owner_userid === scope.userId || row.visibility === 'office' && scope.templateManage === true); }
function view(row, scope) { return { id: row.id, version: row.version, name: row.name, visibility: row.visibility,
    definition: row.definition, definitionHash: row.definition_hash, updatedAt: row.updated_at, canEdit: canEdit(row, scope) }; }
async function load(db, scope, id, { lock = false } = {}) {
    check(scope); expect(UUID.test(id), 'INVALID_PACKAGE_RECIPE');
    const row = (await db.query(`SELECT * FROM signing_package_recipes WHERE owner_context_id=$1 AND id=$2
        AND NOT archived AND (owner_userid=$3 OR visibility='office') ${lock ? 'FOR UPDATE' : ''}`,
    [scope.contextId, id, scope.userId])).rows[0];
    if (!row) fail('NOT_FOUND', 404);
    return row;
}
async function list(db, scope) {
    check(scope);
    const rows = (await db.query(`SELECT * FROM signing_package_recipes WHERE owner_context_id=$1 AND NOT archived
        AND (owner_userid=$2 OR visibility='office') ORDER BY updated_at DESC,id LIMIT 200`, [scope.contextId, scope.userId])).rows;
    return rows.map(row => view(row, scope));
}
// A source already in this recipe can be retained by authorized office editors.
// A new reference must be owned by the actor; all-firm permission is not consent
// to publish someone else's private Word original or a filled generated PDF.
async function assertSources(db, scope, definition, previous) {
    for (const doc of definition.documents) {
        const retained = previous?.documents?.some(old => digest(old.source) === digest(doc.source));
        let source;
        if (doc.source.kind === 'word') {
            source = (await db.query(`SELECT s.*,v.bindings AS pinned_bindings,v.roles AS pinned_roles FROM signing_word_sources s
                JOIN signing_word_source_versions v ON v.owner_context_id=s.owner_context_id AND v.source_id=s.id AND v.version=$3
                WHERE s.owner_context_id=$1 AND s.id=$2 AND NOT s.archived AND ($4::boolean OR s.created_by=$5) FOR SHARE OF s,v`,
            [scope.contextId, doc.source.id, doc.source.version, !!retained, scope.userId])).rows[0];
            if (!source) fail('NOT_FOUND', 404);
            expect(source.source_sha256 === doc.source.hash, 'SOURCE_CHANGED');
            const mappings = new Map(doc.mappings.map(item => [item.bindingId, item.fieldKey]));
            expect(source.pinned_bindings.length === mappings.size && source.pinned_bindings.every(b => mappings.has(b.id)), 'INVALID_FIELD_MAPPING');
        } else {
            source = (await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND kind='source'
                AND state='ready' AND ($3::boolean OR created_by=$4) FOR SHARE`,
            [scope.contextId, doc.source.id, !!retained, scope.userId])).rows[0];
            if (!source) fail('NOT_FOUND', 404);
            expect(source.content_sha256 === doc.source.hash, 'SOURCE_CHANGED');
            expect(!source.metadata?.wordOrigin && !source.metadata?.packagePreparation, 'FILLED_DOCUMENT_NOT_REUSABLE');
        }
    }
}
async function save(pool, scope, id, input) {
    check(scope); if (!scope.send) fail('FORBIDDEN', 403);
    expect(UUID.test(id) && input && Object.keys(input).every(key => ['expectedVersion','definition','visibility','sharingReviewHash'].includes(key)), 'INVALID_PACKAGE_RECIPE');
    if (input.expectedVersion == null) fail('PRECONDITION_REQUIRED', 428);
    expect(Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0, 'INVALID_PRECONDITION');
    expect(['private','office'].includes(input.visibility), 'INVALID_PACKAGE_RECIPE');
    const definition = normalizeRecipe(input.definition), hash = digest(definition);
    expect(Buffer.byteLength(JSON.stringify(definition)) <= 1048576, 'CAPACITY_BUDGET_EXCEEDED');
    // The caller acknowledges exactly the source/mapping version shown in review.
    if (input.visibility === 'office') expect(input.sharingReviewHash === hash, 'PACKAGE_SHARING_REVIEW_REQUIRED');
    return transaction(pool, async db => {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`signing-recipe:${id}`]);
        const existing = (await db.query('SELECT * FROM signing_package_recipes WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (existing && (existing.owner_context_id !== scope.contextId || !canEdit(existing, scope))) fail('NOT_FOUND', 404);
        if (existing && existing.visibility !== input.visibility && existing.owner_userid !== scope.userId) fail('FORBIDDEN', 403);
        if (existing?.archived || (existing?.version || 0) !== input.expectedVersion) fail('VERSION_CHANGED', 412);
        await assertSources(db, scope, definition, existing?.definition);
        assertReadyRecipe(definition);
        let row;
        if (!existing) row = (await db.query(`INSERT INTO signing_package_recipes
            (id,owner_context_id,owner_userid,name,definition,definition_hash,visibility,sharing_review_hash)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id,scope.contextId,scope.userId,definition.name,definition,hash,input.visibility,input.visibility === 'office' ? hash : null])).rows[0];
        else row = (await db.query(`UPDATE signing_package_recipes SET version=version+1,name=$3,definition=$4,definition_hash=$5,
            visibility=$6,sharing_review_hash=$7,updated_at=clock_timestamp() WHERE owner_context_id=$1 AND id=$2 RETURNING *`,
        [scope.contextId,id,definition.name,definition,hash,input.visibility,input.visibility === 'office' ? hash : null])).rows[0];
        await db.query(`INSERT INTO signing_package_recipe_versions(owner_context_id,recipe_id,version,definition,definition_hash,created_by)
            VALUES($1,$2,$3,$4,$5,$6)`, [scope.contextId,id,row.version,definition,hash,scope.userId]);
        return view(row,scope);
    });
}
async function get(db,scope,id) { return view(await load(db,scope,id),scope); }
module.exports = { list, get, save, load, view, assertSources };

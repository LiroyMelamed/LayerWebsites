'use strict';
const { canonical } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');
const recipes = require('./packageRecipes');
const { resolveRecordValues } = require('./wordTemplates');
const isPrepared = definition => definition?.origin?.kind === 'package_preparation';
async function current(db,scope,origin) {
    expect(origin && UUID.test(origin.id), 'INVALID_PACKAGE_ORIGIN');
    if (origin.authorUserId !== scope.userId) fail('NOT_FOUND',404);
    const row = (await db.query(`SELECT * FROM signing_package_preparations WHERE owner_context_id=$1 AND id=$2 AND created_by=$3 FOR SHARE`,
    [scope.contextId,origin.id,scope.userId])).rows[0];
    if (!row) fail('NOT_FOUND',404);
    expect(canonical(row.origin) === canonical(origin),'PACKAGE_ORIGIN_CHANGED');
    const recipe = await recipes.load(db,scope,row.recipe_id);
    if (recipe.version !== row.recipe_version || recipe.definition_hash !== origin.recipeHash) fail('PACKAGE_SOURCE_CHANGED',412);
    // Permission checks only: client record edits do not silently alter reviewed
    // output bytes, but access revocation must prevent new reads or sends.
    await resolveRecordValues(db,{...scope,send:true},{ ...row.access_refs, manualValues:{} });
    return row;
}
async function assertDefinition(db,scope,definition,{previousDefinition}={}) {
    const docs = definition?.documents || [], previousDocs = previousDefinition?.documents || [];
    const ids = [...new Set([...docs,...previousDocs].map(doc=>doc.sourceArtifactId).filter(id=>UUID.test(id)))];
    const rows = ids.length ? (await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=ANY($2::uuid[]) AND metadata ? 'packagePreparation' FOR SHARE`,[scope.contextId,ids])).rows : [];
    if (!isPrepared(definition) && !isPrepared(previousDefinition) && !rows.length) return null;
    expect(isPrepared(definition),'PACKAGE_ORIGIN_REQUIRED');
    const row = await current(db,scope,definition.origin);
    if (isPrepared(previousDefinition)) expect(canonical(previousDefinition.origin) === canonical(definition.origin),'PACKAGE_ORIGIN_CHANGED');
    expect(docs.length === row.definition.documents.length,'PACKAGE_ORIGIN_CHANGED');
    for (const doc of docs) {
        const stored = row.definition.documents.find(item=>item.key===doc.key);
        const artifact = rows.find(item=>item.id===doc.sourceArtifactId);
        expect(stored && artifact && artifact.created_by === scope.userId && artifact.kind==='source' && artifact.state==='ready'
            && artifact.metadata.packagePreparation.id===row.id && artifact.metadata.packagePreparation.documentKey===doc.key
            && stored.sourceArtifactId===doc.sourceArtifactId && stored.sourceHash===doc.sourceHash && artifact.content_sha256===doc.sourceHash,'PACKAGE_ORIGIN_CHANGED');
    }
    expect(canonical(definition) === canonical(row.definition),'PACKAGE_REVIEW_CHANGED');
    return row;
}
async function assertContext(db,scope,definition,packages) {
    if (!isPrepared(definition)) return null;
    const row = await current(db,scope,definition.origin);
    for (const pkg of packages) {
        for (const key of ['clientId','caseId']) if (row.access_refs[key] != null && pkg[key] !== row.access_refs[key]) fail('PACKAGE_CONTEXT_CHANGED',412);
        for (const [key,value] of Object.entries(row.data_values)) if ((pkg.data || {})[key] !== value) fail('PACKAGE_INPUTS_CHANGED',412);
    }
    return row.access_refs;
}
module.exports = { isPrepared, current, assertDefinition, assertContext };

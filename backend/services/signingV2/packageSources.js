'use strict';
const { randomUUID } = require('node:crypto');
const { UUID } = require('../../lib/signingV2/compiler');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { transaction } = require('./transaction');
const recipes = require('./packageRecipes');
const word = require('./wordTemplates');
async function reference(db,scope,input,{edit=false}={}) {
    expect(input && UUID.test(input.source?.id) && ['word','pdf'].includes(input.source.kind)
        && Number.isSafeInteger(input.source.version) && input.source.version>0 && /^[a-f0-9]{64}$/.test(input.source.hash),'INVALID_SOURCE');
    let shared=false;
    if(input.recipeId) {
        const recipe=await recipes.load(db,scope,input.recipeId);
        if(edit && !recipes.view(recipe,scope).canEdit) fail('FORBIDDEN',403);
        if(recipe.version!==input.expectedVersion) fail('VERSION_CHANGED',412);
        const doc=recipe.definition.documents.find(doc=>doc.key===input.documentKey);
        expect(doc && digest(doc.source)===digest(input.source),'SOURCE_CHANGED');
        shared=true;
    }
    let row;
    if(input.source.kind==='word') row=(await db.query(`SELECT s.*,v.name AS pinned_name,v.bindings AS pinned_bindings,v.roles AS pinned_roles,v.bindings_hash AS pinned_hash
        FROM signing_word_sources s JOIN signing_word_source_versions v ON v.owner_context_id=s.owner_context_id AND v.source_id=s.id AND v.version=$3
        WHERE s.owner_context_id=$1 AND s.id=$2 AND NOT s.archived AND ($4::boolean OR s.created_by=$5) FOR SHARE OF s,v`,
    [scope.contextId,input.source.id,input.source.version,shared,scope.userId])).rows[0];
    else row=(await db.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND kind='source' AND state='ready'
        AND ($3::boolean OR created_by=$4) FOR SHARE`,[scope.contextId,input.source.id,shared,scope.userId])).rows[0];
    if(!row) fail('NOT_FOUND',404);
    expect((row.source_sha256||row.content_sha256)===input.source.hash,'SOURCE_CHANGED');
    expect(!row.metadata?.wordOrigin&&!row.metadata?.packagePreparation,'FILLED_DOCUMENT_NOT_REUSABLE');
    return row;
}
async function workingCopy(pool,scope,input,{storage}={}) {
    expect(scope.send===true && UUID.test(input?.copyId),'INVALID_PACKAGE_INPUTS');
    expect(input.source?.kind==='word','INVALID_SOURCE');
    const id=await transaction(pool,async db=>{
        const source=await reference(db,scope,input,{edit:true});
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`word-working-copy:${scope.contextId}:${scope.userId}:${input.copyId}`]);
        const existing=(await db.query(`SELECT * FROM signing_word_sources WHERE owner_context_id=$1 AND created_by=$2 AND working_copy_id=$3`,[scope.contextId,scope.userId,input.copyId])).rows[0];
        if(existing) {
            expect(existing.parent_source_id===source.id && existing.parent_source_version===input.source.version && !existing.archived,'IDEMPOTENCY_CONFLICT');
            return existing.id;
        }
        const newId=randomUUID();
        await db.query(`INSERT INTO signing_word_sources(id,owner_context_id,created_by,source_sha256,object_key,bytes,name,bindings_hash,roles,bindings,working_copy_id,parent_source_id,parent_source_version)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[newId,scope.contextId,scope.userId,source.source_sha256,source.object_key,source.bytes,
            source.pinned_name,source.pinned_hash,JSON.stringify(source.pinned_roles),JSON.stringify(source.pinned_bindings),input.copyId,source.id,input.source.version]);
        await db.query(`INSERT INTO signing_word_source_versions(id,owner_context_id,source_id,version,name,bindings_hash,roles,bindings,created_by)
            VALUES($1,$2,$3,1,$4,$5,$6,$7,$8)`,[randomUUID(),scope.contextId,newId,source.pinned_name,source.pinned_hash,JSON.stringify(source.pinned_roles),JSON.stringify(source.pinned_bindings),scope.userId]);
        return newId;
    });
    return word.load(pool,scope,id,{storage});
}
async function pdf(pool,scope,input,{storage}={}) {
    expect(input.source?.kind==='pdf' && input.source.version===1,'INVALID_SOURCE');
    const row=await reference(pool,scope,input);
    const bytes=await storage.read(row.object_key,Number(row.bytes));
    expect(bytes.length===Number(row.bytes)&&bytesHash(bytes)===input.source.hash,'ARTIFACT_HASH_MISMATCH');
    return bytes;
}
module.exports={workingCopy,pdf};

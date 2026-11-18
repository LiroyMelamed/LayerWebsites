'use strict';
const { UUID }=require('../../lib/signingV2/compiler');
const { expect,fail }=require('../../lib/signingV2/errors');
const { normalizeRecipe }=require('../../lib/signingV2/packageRecipe');
const { transaction }=require('./transaction');
const recipes=require('./packageRecipes');
const view=row=>({id:row.id,recipeId:row.recipe_id,baseVersion:row.base_version,version:row.version,visibility:row.visibility,definition:row.definition,updatedAt:row.updated_at});
async function list(db,scope){return (await db.query('SELECT * FROM signing_package_recipe_drafts WHERE owner_context_id=$1 AND created_by=$2 ORDER BY updated_at DESC LIMIT 100',[scope.contextId,scope.userId])).rows.map(view);}
async function save(pool,scope,id,input){
    expect(scope.send===true,'FORBIDDEN');expect(UUID.test(id)&&input&&Number.isSafeInteger(input.expectedVersion)&&input.expectedVersion>=0,'INVALID_PRECONDITION');
    expect(['office','private'].includes(input.visibility)&&Number.isSafeInteger(input.baseVersion)&&input.baseVersion>=0,'INVALID_PACKAGE_RECIPE');
    expect(input.recipeId?UUID.test(input.recipeId)&&input.baseVersion>0:input.baseVersion===0,'INVALID_PACKAGE_RECIPE');
    const definition=normalizeRecipe(input.definition,{draft:true});
    return transaction(pool,async db=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`recipe-draft:${id}`]);
        const current=(await db.query('SELECT * FROM signing_package_recipe_drafts WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(current&&(current.owner_context_id!==scope.contextId||current.created_by!==scope.userId))fail('NOT_FOUND',404);
        if((current?.version||0)!==input.expectedVersion)fail('VERSION_CHANGED',412);
        let previous;
        if(input.recipeId){const row=await recipes.load(db,scope,input.recipeId);if(!recipes.view(row,scope).canEdit)fail('FORBIDDEN',403);if(row.version!==input.baseVersion)fail('VERSION_CHANGED',412);previous=row.definition;}
        await recipes.assertSources(db,scope,definition,previous);
        const row=current?(await db.query(`UPDATE signing_package_recipe_drafts SET recipe_id=$2,base_version=$3,visibility=$4,definition=$5,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,[id,input.recipeId||null,input.baseVersion,input.visibility,definition])).rows[0]
            :(await db.query(`INSERT INTO signing_package_recipe_drafts(id,owner_context_id,created_by,recipe_id,base_version,visibility,definition) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[id,scope.contextId,scope.userId,input.recipeId||null,input.baseVersion,input.visibility,definition])).rows[0];
        return view(row);
    });
}
async function remove(db,scope,id,expectedVersion){expect(scope.send===true&&UUID.test(id)&&Number.isSafeInteger(expectedVersion),'INVALID_PRECONDITION');const result=await db.query('DELETE FROM signing_package_recipe_drafts WHERE id=$1 AND owner_context_id=$2 AND created_by=$3 AND version=$4',[id,scope.contextId,scope.userId,expectedVersion]);if(!result.rowCount)fail('VERSION_CHANGED',412);}
module.exports={list,save,remove};

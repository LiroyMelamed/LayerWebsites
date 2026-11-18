'use strict';
const { createAppError } = require('../utils/appError');
const { digest } = require('../lib/signingV2/canonical');
const { normalizeRecipe, assertReadyRecipe } = require('../lib/signingV2/packageRecipe');
const recipes = require('../services/signingV2/packageRecipes');
const preparation = require('../services/signingV2/packagePreparation');
const inputs = require('../services/signingV2/packageInputs');
const { createWordStorage, wordRouteError } = require('./signingWordRoutes');
module.exports = function createRouter({pool,actorScope,storage,enabled=()=>process.env.SIGNING_PACKAGE_RECIPES_ENABLED==='true'}={}) {
    const router = require('express').Router();
    router.use((_req,_res,next)=>enabled()?next():next(createAppError('NOT_FOUND',404)));
    const run=(action,permission='upload')=>async(req,res,next)=>{
        try {
            res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
            const scope=await actorScope(pool,req,permission);
            await action(req,res,scope);
        } catch(error) { next(wordRouteError(error)); }
    };
    router.post('/sources/word-working-copy',run(async(req,res,scope)=>res.json({source:await require('../services/signingV2/packageSources').workingCopy(pool,scope,req.body,{storage:storage||createWordStorage()})})));
    router.post('/sources/pdf',run(async(req,res,scope)=>res.type('application/pdf').set('Content-Disposition','inline; filename="source.pdf"').send(
        await require('../services/signingV2/packageSources').pdf(pool,scope,req.body,{storage:storage||createWordStorage()})),'view'));
    router.get('/drafts',run(async(_req,res,scope)=>res.json({drafts:await require('../services/signingV2/packageRecipeDrafts').list(pool,scope)}),'view'));
    router.put('/drafts/:id',run(async(req,res,scope)=>res.json({draft:await require('../services/signingV2/packageRecipeDrafts').save(pool,scope,req.params.id,req.body)})));
    router.delete('/drafts/:id',run(async(req,res,scope)=>{await require('../services/signingV2/packageRecipeDrafts').remove(pool,scope,req.params.id,Number(req.query.version));res.json({deleted:true});}));
    router.get('/',run(async(_req,res,scope)=>res.json({recipes:await recipes.list(pool,scope)}),'view'));
    router.get('/:id',run(async(req,res,scope)=>res.json({recipe:await recipes.get(pool,scope,req.params.id)}),'view'));
    router.post('/:id/review',run(async(req,res,scope)=>{
        const definition=normalizeRecipe(req.body?.definition);
        let previous;
        if(req.body?.expectedVersion>0) {
            const row=await recipes.load(pool,scope,req.params.id);
            if(!recipes.view(row,scope).canEdit) throw createAppError('FORBIDDEN',403);
            if(row.version!==req.body.expectedVersion) throw createAppError('VERSION_CHANGED',412);
            previous=row.definition;
        }
        await recipes.assertSources(pool,scope,definition,previous);
        assertReadyRecipe(definition);
        res.json({definition,definitionHash:digest(definition)});
    }));
    router.put('/:id',run(async(req,res,scope)=>res.json({recipe:await recipes.save(pool,scope,req.params.id,req.body)})));
    router.post('/:id/inputs',run(async(req,res,scope)=>{
        const row=await recipes.load(pool,scope,req.params.id);
        if(row.version!==req.body?.expectedVersion) throw createAppError('VERSION_CHANGED',412);
        const result=await inputs.resolve(pool,scope,row.definition,req.body.inputs);
        res.json({fields:result.fields,recipeVersion:row.version});
    }));
    router.post('/:id/preparations',run(async(req,res,scope)=>{
        const result=await preparation.prepare(pool,scope,req.params.id,{...req.body,idempotencyKey:req.get('Idempotency-Key')},{storage:storage||createWordStorage()});
        res.status(201).json({preparation:{...result,definitionHash:digest(result.definition)}});
    }));
    router.get('/preparations/:id/documents/:key',run(async(req,res,scope)=>{
        const row=(await pool.query('SELECT * FROM signing_package_preparations WHERE owner_context_id=$1 AND id=$2 AND created_by=$3',[scope.contextId,req.params.id,scope.userId])).rows[0];
        if(!row) throw createAppError('NOT_FOUND',404);
        await require('../services/signingV2/packagePreparationOrigin').assertDefinition(pool,scope,row.definition);
        const doc=row.definition.documents.find(item=>item.key===req.params.key);
        if(!doc) throw createAppError('NOT_FOUND',404);
        const artifact=(await pool.query('SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2',[scope.contextId,doc.sourceArtifactId])).rows[0];
        const bytes=await (storage||createWordStorage()).read(artifact.object_key,Number(artifact.bytes));
        if(require('../lib/signingV2/canonical').bytesHash(bytes)!==doc.sourceHash) throw createAppError('ARTIFACT_HASH_MISMATCH',422);
        res.type('application/pdf').set('Content-Disposition','inline; filename="document.pdf"').send(bytes);
    },'view'));
    router.post('/preparations/:id/native-draft',run(async(req,res,scope)=>res.status(201).json({version:await preparation.nativeDraft(pool,scope,req.params.id,
        {expectedHash:req.body?.expectedHash,idempotencyKey:req.get('Idempotency-Key')})})));
    return router;
};

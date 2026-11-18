'use strict';
const { randomUUID } = require('node:crypto');
const { UUID, validateDefinition } = require('../../lib/signingV2/compiler');
const { bytesHash, digest } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { importDocx, createBinding, materializeDocx } = require('../../lib/wordTemplates');
const { remapAnchor, locateAnchor } = require('../../lib/wordTemplates/signatureAnchors');
const visual = require('../../lib/wordTemplates/visual');
const { geometries } = require('./wordSigning');
const recipes = require('./packageRecipes');
const inputs = require('./packageInputs');
const { transaction } = require('./transaction');
const templates = require('./templates');
const { versionView } = require('./authoring');
async function read(storage,row,hash) {
    expect(Number(row.bytes)>0 && Number(row.bytes)<=20*1024*1024,'INVALID_SOURCE');
    const bytes = await storage.read(row.object_key,Number(row.bytes));
    expect(Buffer.isBuffer(bytes) && bytes.length===Number(row.bytes) && bytesHash(bytes)===hash,'ARTIFACT_HASH_MISMATCH');
    return bytes;
}
async function persist(storage,key,bytes) {
    await storage.write(key,bytes); await storage.verify(key,bytes.length,bytesHash(bytes));
    expect(bytesHash(await storage.read(key,bytes.length))===bytesHash(bytes),'ARTIFACT_HASH_MISMATCH');
}
function nativeField(field,geometry) {
    return { id:field.key,type:field.type,required:field.required,...geometry,...(field.label?{label:field.label}:{}),
        ...(field.type==='data' ? {dataKey:field.dataKey,overflow:'block',fontSize:field.fontSize||12,align:field.align||'start'}
            : {roleKey:field.roleKey,occurrence:field.occurrence,...(field.inactiveTreatment?{inactiveTreatment:field.inactiveTreatment}:{})}) };
}
async function prepare(pool,scope,recipeId,input,{storage,convertDocxToPdf,buildAuthoringMap=visual.buildAuthoringMapBounded,renderData}={}) {
    expect(scope.send===true,'FORBIDDEN');
    expect(input && Object.keys(input).every(key=>['idempotencyKey','expectedVersion','definitionHash','inputs'].includes(key))
        && UUID.test(input.idempotencyKey),'INVALID_PACKAGE_INPUTS');
    const recipe = await recipes.load(pool,scope,recipeId);
    if (recipe.version!==input.expectedVersion || recipe.definition_hash!==input.definitionHash) fail('VERSION_CHANGED',412);
    const resolved = await inputs.resolve(pool,scope,recipe.definition,input.inputs);
    expect(!resolved.fields.some(field=>field.required&&field.missing),'PACKAGE_REQUIRED_VALUES_MISSING');
    const values = Object.fromEntries(resolved.fields.map(field=>[field.key,field.value]));
    const requestHash = digest({recipeId,version:recipe.version,definitionHash:recipe.definition_hash,inputs:resolved.inputs});
    const valuesHash = digest(values);
    const existing = (await pool.query('SELECT * FROM signing_package_preparations WHERE id=$1',[input.idempotencyKey])).rows[0];
    const reuse = async row => {
        if (row.owner_context_id!==scope.contextId || row.created_by!==scope.userId) fail('NOT_FOUND',404);
        if (row.request_hash!==requestHash || row.origin.valuesHash!==valuesHash) fail('IDEMPOTENCY_CONFLICT',409);
        await require('./packagePreparationOrigin').assertDefinition(pool,scope,row.definition);
        return {id:row.id,definition:row.definition,origin:row.origin,data:row.data_values,accessRefs:row.access_refs};
    };
    if (existing) return reuse(existing);
    await recipes.assertSources(pool,scope,recipe.definition,recipe.definition);
    const definition = recipe.definition;
    const documents = [], artifacts = [];
    for (const doc of definition.documents) {
        let bytes, fields, provenance;
        if (doc.source.kind==='word') {
            const source = (await pool.query(`SELECT s.*,v.bindings AS pinned_bindings FROM signing_word_sources s
                JOIN signing_word_source_versions v ON v.owner_context_id=s.owner_context_id AND v.source_id=s.id AND v.version=$3
                WHERE s.owner_context_id=$1 AND s.id=$2 AND NOT s.archived`,[scope.contextId,doc.source.id,doc.source.version])).rows[0];
            if (!source) fail('NOT_FOUND',404);
            const originalBytes = await read(storage,source,doc.source.hash), original = importDocx(originalBytes);
            const bindings = source.pinned_bindings.map(binding=>{
                const field = definition.fields.find(f=>f.key===doc.mappings.find(m=>m.bindingId===binding.id)?.fieldKey);
                expect(field,'INVALID_FIELD_MAPPING');
                return createBinding(original,{...binding,field:`manual.${field.key}`,fieldLabel:field.label,required:field.required});
            });
            const wordValues = Object.fromEntries(Object.entries(values).map(([key,value])=>[`manual.${key}`,value]));
            const filled = bindings.length?materializeDocx(originalBytes,{sourceHash:doc.source.hash,bindings,values:wordValues}):{buffer:originalBytes,outputHash:doc.source.hash};
            const convert = convertDocxToPdf || require('../../lib/wordTemplates/converter').convertDocxToPdf;
            const result = await convert(filled.buffer);
            expect(Buffer.isBuffer(result.buffer) && result.sourceHash===filled.outputHash && result.outputHash===bytesHash(result.buffer),'WORD_INVALID_CONVERSION');
            bytes=result.buffer;
            const filledModel=importDocx(filled.buffer);
            const map=doc.signatureFields.length?await buildAuthoringMap(filledModel,bytes):null;
            fields=doc.signatureFields.map(field=>nativeField(field,locateAnchor(map,
                remapAnchor(original,filledModel,field.placement.anchor,bindings,wordValues),field.placement)));
            provenance={kind:'word',sourceId:doc.source.id,sourceVersion:doc.source.version,sourceHash:doc.source.hash,filledDocxHash:filled.outputHash};
        } else {
            const source=(await pool.query(`SELECT * FROM signing_artifacts WHERE owner_context_id=$1 AND id=$2 AND kind='source' AND state='ready'`,[scope.contextId,doc.source.id])).rows[0];
            if (!source || source.metadata?.wordOrigin || source.metadata?.packagePreparation) fail('FILLED_DOCUMENT_NOT_REUSABLE',422);
            bytes=await read(storage,source,doc.source.hash);
            fields=doc.signatureFields.map(field=>nativeField(field,{pageNum:field.placement.page,x:field.placement.x,y:field.placement.y,width:field.placement.width,height:field.placement.height}));
            provenance={kind:'pdf',sourceArtifactId:doc.source.id,sourceHash:doc.source.hash};
        }
        if(fields.some(field=>field.type==='data')) {
            const rendered=await (renderData||require('./packageData').renderData)({sourceBytes:bytes,expectedSourceHash:bytesHash(bytes),locale:definition.locale,
                fields:fields.filter(field=>field.type==='data').map(field=>({...field,value:values[field.dataKey]??''}))});
            expect(Buffer.isBuffer(rendered.bytes)&&bytesHash(rendered.bytes)===rendered.contentHash,'ARTIFACT_HASH_MISMATCH');
            bytes=rendered.bytes;
            // Values are already baked into the exact bytes shown for review.
            // The incumbent signing worker must not draw them a second time.
            fields=fields.filter(field=>field.type!=='data');
        }
        const pages=await geometries(bytes), hash=bytesHash(bytes);
        expect(bytes.length<=20*1024*1024,'CAPACITY_BUDGET_EXCEEDED');
        for (const field of fields) {
            const page=pages[field.pageNum-1];
            expect(page&&field.y+field.height<=800*page.height/page.width,'INVALID_GEOMETRY');
        }
        const artifactId=randomUUID(),objectKey=`signing-v2/${scope.contextId}/preparations/${scope.userId}/${input.idempotencyKey}/${doc.key}-${hash}.pdf`;
        await persist(storage,objectKey,bytes);
        artifacts.push({id:artifactId,hash,objectKey,bytes:bytes.length,pages,provenance,documentKey:doc.key});
        documents.push({key:doc.key,name:doc.name,sourceArtifactId:artifactId,sourceHash:hash,fields});
    }
    const conditionKeys=new Set();
    const visit=condition=>{if(!condition)return;if(condition.key)conditionKeys.add(condition.key);(condition.conditions||[]).forEach(visit);};
    definition.signing.roles.forEach(role=>visit(role.when));
    const dataKeys=definition.fields.filter(field=>conditionKeys.has(field.key)||documents.some(doc=>doc.fields.some(f=>f.type==='data'&&f.dataKey===field.key)))
        .map(field=>({key:field.key,label:field.label,type:'text',required:field.required,maxLength:2000}));
    const data=Object.fromEntries(dataKeys.map(field=>[field.key,values[field.key]]));
    const origin={kind:'package_preparation',id:input.idempotencyKey,recipeId,recipeVersion:recipe.version,recipeHash:recipe.definition_hash,
        authorUserId:scope.userId,inputsHash:requestHash,valuesHash};
    const native=validateDefinition({schemaVersion:2,name:definition.name,locale:definition.locale,origin,documents,dataKeys,...definition.signing});
    const accessRefs={clientId:resolved.inputs.clientId,caseId:resolved.inputs.caseId,roleClientIds:resolved.inputs.roleClientIds};
    return transaction(pool,async db=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`recipe-preparation:${input.idempotencyKey}`]);
        const current=await recipes.load(db,scope,recipeId,{lock:true});
        if(current.version!==recipe.version||current.definition_hash!==recipe.definition_hash) fail('VERSION_CHANGED',412);
        const recheck=await inputs.resolve(db,scope,definition,input.inputs,{lock:true});
        if(digest(Object.fromEntries(recheck.fields.map(field=>[field.key,field.value])))!==valuesHash) fail('PACKAGE_INPUTS_CHANGED',412);
        const concurrent=(await db.query('SELECT * FROM signing_package_preparations WHERE id=$1',[input.idempotencyKey])).rows[0];
        if(concurrent) {
            if(concurrent.owner_context_id!==scope.contextId||concurrent.created_by!==scope.userId) fail('NOT_FOUND',404);
            if(concurrent.request_hash!==requestHash||concurrent.origin.valuesHash!==valuesHash) fail('IDEMPOTENCY_CONFLICT',409);
            return {id:concurrent.id,definition:concurrent.definition,origin:concurrent.origin,data:concurrent.data_values,accessRefs:concurrent.access_refs};
        }
        await recipes.assertSources(db,scope,definition,definition);
        for(const asset of artifacts) await db.query(`INSERT INTO signing_artifacts
            (id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at,created_by)
            VALUES($1,$2,'source',$3,$4,$5,$6,'ready',$7,clock_timestamp(),$8)`,
        [asset.id,scope.contextId,digest({preparation:origin.id,document:asset.documentKey,requestHash}),asset.hash,asset.objectKey,asset.bytes,
            {pages:asset.pages,packagePreparation:{id:origin.id,authorUserId:scope.userId,documentKey:asset.documentKey,source:asset.provenance}},scope.userId]);
        await db.query(`INSERT INTO signing_package_preparations(id,owner_context_id,recipe_id,recipe_version,created_by,request_hash,origin,definition,access_refs,data_values)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[origin.id,scope.contextId,recipeId,recipe.version,scope.userId,requestHash,origin,native,accessRefs,data]);
        return {id:origin.id,definition:native,origin,data,accessRefs};
    });
}
async function nativeDraft(pool,scope,id,input) {
    const row=(await pool.query('SELECT * FROM signing_package_preparations WHERE owner_context_id=$1 AND id=$2 AND created_by=$3',[scope.contextId,id,scope.userId])).rows[0];
    if(!row) fail('NOT_FOUND',404);
    expect(input?.expectedHash===digest(row.definition) && UUID.test(input.idempotencyKey),'PACKAGE_REVIEW_CHANGED');
    await require('./packagePreparationOrigin').assertDefinition(pool,scope,row.definition);
    return versionView(await templates.createDraft(pool,scope,{draftId:input.idempotencyKey,definition:row.definition}));
}
module.exports={prepare,nativeDraft};

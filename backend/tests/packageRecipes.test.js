'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { normalizeRecipe } = require('../lib/signingV2/packageRecipe');
const { digest } = require('../lib/signingV2/canonical');
const service = require('../services/signingV2/packageRecipes');
const contextId = randomUUID(),defaultSourceId=randomUUID();
const scope = { contextId, userId: 1, send: true, templateManage: true };
const recipe = () => ({ schemaVersion: 3, name: 'Synthetic reusable package', locale: 'he', dataRoles: [{ key: 'tenant', label: 'שוכר' }],
    fields: [{ key: 'plot', label: 'גוש', required: true, source: { kind: 'manual' } },
        { key: 'plot2', label: 'גוש', required: true, source: { kind: 'manual' } },
        { key: 'identity', label: 'מספר זיהוי', required: true, source: { kind: 'role', roleKey: 'tenant', property: 'identityNumber' } }],
    signing: { roles: [{ key: 'first', label: 'חותם ראשון', capacity: 'personal', min: 1, max: 1, stage: 0 }],
        stages: [{ key: 'first', label: 'חתימה', after: null }], policy: { otpRequired: true, deliveryMode: 'invite' } }, documents: [{key:'base',name:'Base',source:{kind:'pdf',id:defaultSourceId,version:1,hash:'f'.repeat(64)},mappings:[],signatureFields:[{key:'sign',type:'signature',roleKey:'first',occurrence:0,required:true,placement:{kind:'pdf',page:1,x:10,y:10,width:100,height:40}}]}] });
const error = code => caught => { assert.equal(caught.errorCode, code); return true; };
async function fixture(t) {
    const pg = new PGlite(); t.after(() => pg.close());
    await pg.exec(`CREATE TABLE signing_owner_contexts(id uuid PRIMARY KEY); CREATE TABLE users(userid integer PRIMARY KEY);
        CREATE TABLE signingfiles(id integer); CREATE TABLE signing_artifacts(id uuid,owner_context_id uuid,created_by integer,kind text,state text,content_sha256 text,metadata jsonb);`);
    await pg.query('INSERT INTO signing_owner_contexts VALUES($1),($2)', [contextId, randomUUID()]);
    await pg.exec('INSERT INTO users VALUES(1),(2),(3)');
    await pg.query("INSERT INTO signing_artifacts VALUES($1,$2,1,'source','ready',$3,'{}')",[defaultSourceId,contextId,'f'.repeat(64)]);
    await pg.exec(fs.readFileSync(path.join(__dirname, '../migrations/2026-11-18_01_signing_package_recipes.sql'), 'utf8'));
    const pool = { query: (...args) => pg.query(...args), connect: async () => ({ query: (...args) => pg.query(...args), release() {} }) };
    return { pg, pool };
}
function input(definition, expectedVersion = 0, visibility = 'office') {
    return { definition, expectedVersion, visibility, sharingReviewHash: digest(normalizeRecipe(definition)) };
}
test('recipe retains distinct equal titles, excludes values and never infers signer roles from data roles', () => {
    const definition = recipe(); const result = normalizeRecipe(definition);
    assert.equal(result.fields[0].label, result.fields[1].label);
    assert.notEqual(result.fields[0].key, result.fields[1].key);
    assert.equal(result.signing.roles.length, 1);
    assert.notEqual(result.signing.roles[0].key, result.dataRoles[0].key);
    for (const change of [d => { d.clientId = 31; }, d => { d.fields[0].value = '12345'; }, d => { d.fields[0].source.clientId = 31; }, d => { d.signing.roles[0].personId = randomUUID(); }]) {
        const value = recipe(); change(value);
        assert.throws(() => normalizeRecipe(value), error('INVALID_PACKAGE_RECIPE'));
    }
});
test('office recipe sharing is exact-review-bound; private packages never become visible through all-firm privilege', async t => {
    const { pool } = await fixture(t), id = randomUUID(), privateId = randomUUID();
    const definition = recipe();
    await assert.rejects(service.save(pool, scope, id, { ...input(definition), sharingReviewHash: '0'.repeat(64) }), error('PACKAGE_SHARING_REVIEW_REQUIRED'));
    const saved = await service.save(pool, scope, id, input(definition));
    assert.equal(saved.visibility, 'office');
    const viewer = { ...scope, userId: 2, send: false, templateManage: false, all: true };
    assert.equal((await service.get(pool, viewer, id)).canEdit, false);
    await service.save(pool, scope, privateId, input(definition, 0, 'private'));
    assert.equal((await service.list(pool, viewer)).length, 1);
    await assert.rejects(service.get(pool, viewer, privateId), error('NOT_FOUND'));
    await assert.rejects(service.save(pool, viewer, id, input(definition, 1)), error('FORBIDDEN'));
    await assert.rejects(service.get(pool, { ...scope, contextId: randomUUID() }, id), error('NOT_FOUND'));
});
test('expected versions prevent concurrent overwrites and revision history cannot be changed', async t => {
    const { pg, pool } = await fixture(t), id = randomUUID();
    await service.save(pool, scope, id, input(recipe()));
    const changed = { ...recipe(), name: 'Changed once' };
    const updated = await service.save(pool, scope, id, input(changed, 1));
    assert.equal(updated.version, 2);
    await assert.rejects(service.save(pool, scope, id, input(recipe(), 1)), error('VERSION_CHANGED'));
    assert.equal((await service.get(pool, scope, id)).name, 'Changed once');
    const history = (await pg.query('SELECT version,definition FROM signing_package_recipe_versions ORDER BY version')).rows;
    assert.equal(history.length, 2); assert.equal(history[0].definition.name, recipe().name);
    await assert.rejects(pg.query('UPDATE signing_package_recipe_versions SET definition=$1', [recipe()]), /Immutable package source version/);
});
test('generated Word PDFs and other authors private originals cannot be laundered into a shared recipe', async t => {
    const { pg, pool } = await fixture(t), sourceId = randomUUID();
    await pg.query("INSERT INTO signing_artifacts VALUES($1,$2,1,'source','ready',$3,$4)", [sourceId, contextId, 'a'.repeat(64), { wordOrigin: { kind: 'word_preview' } }]);
    const definition = recipe(); definition.documents = [{ key: 'pdf', name: 'Synthetic', source: { kind: 'pdf', id: sourceId, hash: 'a'.repeat(64), version: 1 }, mappings: [], signatureFields: [] }];
    await assert.rejects(service.save(pool, scope, randomUUID(), input(definition)), error('FILLED_DOCUMENT_NOT_REUSABLE'));
    await pg.query("UPDATE signing_artifacts SET created_by=2,metadata='{}'");
    await assert.rejects(service.save(pool, scope, randomUUID(), input(definition)), error('NOT_FOUND'));
    assert.equal((await service.list(pool, scope)).length, 0);
});

test('prepared PDF packages use the incumbent compiler, remain actor-private and reject changes after review', async t => {
    const { pool, pg } = await fixture(t);
    await pg.exec(`ALTER TABLE signing_artifacts ADD COLUMN inputs_hash text, ADD COLUMN object_key text, ADD COLUMN bytes integer, ADD COLUMN ready_at timestamptz;
        CREATE UNIQUE INDEX artifact_identity ON signing_artifacts(id);
        CREATE UNIQUE INDEX artifact_input ON signing_artifacts(owner_context_id,kind,inputs_hash);`);
    const { PDFDocument } = require('pdf-lib');
    const { bytesHash } = require('../lib/signingV2/canonical');
    const preparation = require('../services/signingV2/packagePreparation');
    const gate = require('../services/signingV2/packagePreparationOrigin');
    const pdf = await PDFDocument.create(); pdf.addPage([600,800]); const bytes = Buffer.from(await pdf.save());
    const hash = bytesHash(bytes), artifactId = randomUUID(), recipeId = randomUUID();
    await pg.query(`INSERT INTO signing_artifacts(id,owner_context_id,created_by,kind,state,content_sha256,metadata,object_key,bytes)
        VALUES($1,$2,1,'source','ready',$3,$4,'original.pdf',$5)`,[artifactId,contextId,hash,{pages:[{width:600,height:800}]},bytes.length]);
    const definition = recipe(); definition.fields=[]; definition.dataRoles=[];
    definition.documents=[{key:'one',name:'Synthetic PDF',source:{kind:'pdf',id:artifactId,version:1,hash},mappings:[],signatureFields:[
        {key:'sign',type:'signature',roleKey:'first',occurrence:0,required:true,placement:{kind:'pdf',page:1,x:50,y:50,width:100,height:40}}]}];
    const saved=await service.save(pool,scope,recipeId,input(definition));
    const objects = new Map([['original.pdf',bytes]]);
    const storage={async read(key,size){const value=objects.get(key);assert.equal(value?.length,size);return value;},
        async write(key,value){objects.set(key,value);},async verify(key,size,hash){assert.equal(objects.get(key).length,size);assert.equal(bytesHash(objects.get(key)),hash);}};
    const request={idempotencyKey:randomUUID(),expectedVersion:saved.version,definitionHash:saved.definitionHash,inputs:{values:{},roleClientIds:{}}};
    const prepared=await preparation.prepare(pool,scope,recipeId,request,{storage});
    assert.equal(prepared.definition.schemaVersion,2);
    assert.notEqual(prepared.definition.documents[0].sourceArtifactId,artifactId);
    assert.equal(prepared.definition.documents[0].sourceHash,hash);
    assert.equal((await preparation.prepare(pool,scope,recipeId,request,{storage})).id,prepared.id);
    await gate.assertDefinition(pool,scope,prepared.definition);
    await assert.rejects(gate.assertDefinition(pool,{...scope,userId:2},prepared.definition),error('NOT_FOUND'));
    const stripped=structuredClone(prepared.definition); delete stripped.origin;
    await assert.rejects(gate.assertDefinition(pool,scope,stripped),error('PACKAGE_ORIGIN_REQUIRED'));
    const changed=structuredClone(prepared.definition); changed.documents[0].sourceHash='0'.repeat(64);
    await assert.rejects(gate.assertDefinition(pool,scope,changed),error('PACKAGE_ORIGIN_CHANGED'));
    const moved=structuredClone(prepared.definition);moved.documents[0].fields[0].x+=10;
    await assert.rejects(gate.assertDefinition(pool,scope,moved),error('PACKAGE_REVIEW_CHANGED'));
    await service.save(pool,scope,recipeId,input({...definition,name:'Changed recipe'},1));
    await assert.rejects(gate.assertDefinition(pool,scope,prepared.definition),error('PACKAGE_SOURCE_CHANGED'));
});

test('mixed recipe reuses one explicit manual key across two Word originals and a PDF without storing filled values', async t => {
    const {pool,pg}=await fixture(t);
    await pg.exec(`CREATE TABLE cases(caseid integer PRIMARY KEY);
        ALTER TABLE signing_artifacts ADD COLUMN inputs_hash text, ADD COLUMN object_key text, ADD COLUMN bytes integer, ADD COLUMN ready_at timestamptz;
        CREATE UNIQUE INDEX artifact_identity ON signing_artifacts(id);
        CREATE UNIQUE INDEX artifact_input ON signing_artifacts(owner_context_id,kind,inputs_hash);`);
    await pg.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-10-23_01_signing_word_sources.sql'),'utf8'));
    await pg.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-11-18_02_signing_word_working_copies.sql'),'utf8'));
    const {PDFDocument}=require('pdf-lib');
    const AdmZip=require('adm-zip');
    const word=require('../services/signingV2/wordTemplates');
    const core=require('../lib/wordTemplates');
    const visual=require('../lib/wordTemplates/visual');
    const prep=require('../services/signingV2/packagePreparation');
    const {bytesHash}=require('../lib/signingV2/canonical');
    const objects=new Map(),uploads=new Map();
    const storage={async read(key,size){const value=objects.get(key);assert.equal(value?.length,size);return value;},
        async write(key,value){objects.set(key,value);},async verify(key,size,hash){assert.equal(objects.get(key).length,size);assert.equal(bytesHash(objects.get(key)),hash);},
        async readUpload(key){return uploads.get(key);}};
    const definition=recipe();definition.fields=[definition.fields[0]];definition.dataRoles=[];definition.documents=[];
    for(const [index,text] of ['Plot ____ signature','Parcel ____ signature'].entries()) {
        const zip=new AdmZip();
        zip.addFile('[Content_Types].xml',Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
        zip.addFile('_rels/.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
        zip.addFile('word/document.xml',Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`));
        const fileKey=`users/1/source${index}.docx`;uploads.set(fileKey,zip.toBuffer());
        let source=await word.importSource(pool,scope,{name:`Synthetic ${index}`,fileKey},{storage});
        const binding=core.createBinding(source.model,{id:'value',field:'manual.original',fieldLabel:'Original',part:'word/document.xml',paragraphId:'p0',start:text.indexOf('____'),end:text.indexOf('____')+4});
        source=await word.save(pool,scope,source.id,{expectedVersion:source.version,sourceHash:source.sourceHash,name:source.name,roles:[],bindings:[binding]},{storage});
        const selected=core.createBinding(source.model,{id:'signature',field:'manual.anchor',fieldLabel:'Anchor',part:'word/document.xml',paragraphId:'p0',start:text.indexOf('signature'),end:text.length});
        const anchor=Object.fromEntries(['part','paragraphId','paragraphHash','start','end','selectedTextHash','sourceHash'].map(key=>[key,selected[key]]));
        definition.documents.push({key:`word${index}`,name:source.name,source:{kind:'word',id:source.id,version:source.version,hash:source.sourceHash},
            mappings:[{bindingId:'value',fieldKey:'plot'}],signatureFields:[{key:'signature',type:'signature',roleKey:'first',occurrence:0,required:true,
                placement:{kind:'word-anchor',anchor,offsetX:0,offsetY:24,width:100,height:40}}]});
    }
    const pdf=await PDFDocument.create();pdf.addPage([600,800]);const pdfBytes=Buffer.from(await pdf.save());
    const artifactId=randomUUID();objects.set('original.pdf',pdfBytes);
    await pg.query(`INSERT INTO signing_artifacts(id,owner_context_id,created_by,kind,state,content_sha256,metadata,object_key,bytes)
        VALUES($1,$2,1,'source','ready',$3,$4,'original.pdf',$5)`,[artifactId,contextId,bytesHash(pdfBytes),{pages:[{width:600,height:800}]},pdfBytes.length]);
    definition.documents.push({key:'pdf',name:'Synthetic PDF',source:{kind:'pdf',id:artifactId,version:1,hash:bytesHash(pdfBytes)},mappings:[],signatureFields:[
        {key:'sign',type:'signature',roleKey:'first',occurrence:0,required:true,placement:{kind:'pdf',page:1,x:50,y:50,width:100,height:40}}]});
    definition.documents[2].signatureFields.push({key:'plotValue',type:'data',dataKey:'plot',required:true,fontSize:12,placement:{kind:'pdf',page:1,x:50,y:100,width:180,height:40}});
    const recipeId=randomUUID(),saved=await service.save(pool,scope,recipeId,input(definition));
    const converted=[],renderedValues=[];
    const renderData=async args=>{renderedValues.push(args.fields.map(f=>f.value));const out=await PDFDocument.load(args.sourceBytes);out.getPage(0).drawText(args.fields[0].value,{x:50,y:600,size:12});const bytes=Buffer.from(await out.save());return {bytes,contentHash:bytesHash(bytes)};};
    const convertDocxToPdf=async bytes=>{converted.push(core.importDocx(bytes).parts[0].paragraphs[0].text);return {buffer:pdfBytes,sourceHash:bytesHash(bytes),outputHash:bytesHash(pdfBytes)};};
    const buildAuthoringMap=async model=>visual.buildAuthoringMap(model,[{pageNum:1,width:600,height:800,rotation:0,viewportTransform:[1,0,0,-1,0,800],
        items:[{id:'p',text:model.parts[0].paragraphs[0].text,dir:'ltr',transform:[12,0,0,12,50,700],width:400,height:12,hasEOL:true}]}]);
    const request=value=>({idempotencyKey:randomUUID(),expectedVersion:1,definitionHash:saved.definitionHash,inputs:{roleClientIds:{},values:{plot:{value}}}});
    const actor={...scope,userId:2};
    const first=await prep.prepare(pool,actor,recipeId,request('00123'),{storage,convertDocxToPdf,buildAuthoringMap,renderData});
    assert.equal(first.definition.documents.length,3);assert.ok(converted[0].includes('00123'));assert.ok(converted[1].includes('00123'));
    assert.equal(first.origin.authorUserId,2);
    assert.deepEqual(renderedValues,[['00123']]);assert.notEqual(first.definition.documents[2].sourceHash,bytesHash(pdfBytes));
    assert.equal(first.definition.documents[2].fields.some(f=>f.type==='data'),false);
    assert.deepEqual(first.data,{});
    const second=await prep.prepare(pool,actor,recipeId,request('00999'),{storage,convertDocxToPdf,buildAuthoringMap,renderData});
    assert.notEqual(first.id,second.id);assert.notEqual(first.origin.valuesHash,second.origin.valuesHash);
    assert.ok(converted[2].includes('00999'));assert.ok(converted[3].includes('00999'));
    const persisted=(await service.get(pool,scope,recipeId)).definition;
    assert.deepEqual(persisted,normalizeRecipe(definition));assert.ok(!JSON.stringify(persisted).includes('00123'));
    assert.equal((await pg.query('SELECT count(*)::int n FROM signing_word_sources')).rows[0].n,2);
    const sources=require('../services/signingV2/packageSources');
    const document=definition.documents[0];
    const copyRequest={recipeId,expectedVersion:1,documentKey:document.key,source:document.source,copyId:randomUUID()};
    const copy=await sources.workingCopy(pool,actor,copyRequest,{storage});
    assert.notEqual(copy.id,document.source.id);assert.equal(copy.sourceHash,document.source.hash);
    assert.equal((await sources.workingCopy(pool,actor,copyRequest,{storage})).id,copy.id);
    await word.save(pool,actor,copy.id,{expectedVersion:copy.version,sourceHash:copy.sourceHash,name:'Independent edit',roles:[],bindings:[]},{storage});
    assert.equal((await word.load(pool,scope,document.source.id,{storage})).bindings.length,1);
    await assert.rejects(word.load(pool,actor,document.source.id,{storage}),error('NOT_FOUND'));
    await assert.rejects(sources.workingCopy(pool,{...actor,templateManage:false},{...copyRequest,copyId:randomUUID()},{storage}),error('FORBIDDEN'));
    assert.equal((await sources.pdf(pool,actor,{recipeId,expectedVersion:1,documentKey:'pdf',source:definition.documents[2].source},{storage})).length,pdfBytes.length);
    await assert.rejects(sources.pdf(pool,actor,{source:definition.documents[2].source},{storage}),error('NOT_FOUND'));

});

test('private drafts retain incomplete authoring work, reject concurrent overwrites, and never expose to office managers',async t=>{
    const {pool,pg}=await fixture(t),drafts=require('../services/signingV2/packageRecipeDrafts'),id=randomUUID();
    await pg.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-11-18_03_signing_package_recipe_drafts.sql'),'utf8'));
    const definition=recipe();definition.name='';definition.fields[0].label='';definition.documents=[];
    const body={expectedVersion:0,baseVersion:0,visibility:'office',definition};
    const saved=await drafts.save(pool,scope,id,body);assert.equal(saved.version,1);assert.equal(saved.definition.name,'');
    assert.equal((await drafts.list(pool,{...scope,userId:2,all:true})).length,0);
    assert.equal((await drafts.list(pool,scope))[0].definition.fields[0].label,'');
    await assert.rejects(drafts.save(pool,scope,id,body),error('VERSION_CHANGED'));
    await assert.rejects(drafts.save(pool,{...scope,userId:2},id,{...body,expectedVersion:1}),error('NOT_FOUND'));
    await assert.rejects(service.save(pool,scope,randomUUID(),input({...recipe(),documents:[]})),error('INVALID_DEFINITION'));
    await drafts.remove(pool,scope,id,1);assert.equal((await drafts.list(pool,scope)).length,0);
});

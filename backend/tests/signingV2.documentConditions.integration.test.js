const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { syntheticPdf, fakeProvider } = require('./helpers/signingV2Delivery');
const { previewCreation, createFromRows } = require('../services/signingV2/creation');
const templates = require('../services/signingV2/templates');
const { bytesHash } = require('../lib/signingV2/canonical');

test('authored defaults and document conditions publish immutably, explain every count and prepare only included real PDFs',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 90000 }, async t => {
    const pool = require('../config/db'); t.after(() => pool.end());
    const source = await syntheticPdf('SYNTHETIC CONDITIONAL PACK');
    const f = await databaseFixture(pool, { sourceBytes: source, documentCount: 4 });
    const definition = structuredClone(f.definition);
    definition.dataKeys[1].defaultValue = '9007199254740993.123456';
    definition.dataKeys.push({key:'flag',type:'boolean',defaultValue:false}, {key:'category',type:'enum',options:['א','ب','C'],defaultValue:'א'}, {key:'note',type:'text'});
    definition.documents[1].when = {key:'flag',operator:'equals',value:false};
    definition.documents[2].when = {key:'category',operator:'in',values:['א','ب']};
    definition.documents[3].when = {key:'note',operator:'present'};
    const draft = await templates.createDraft(pool, f.scope, {templateId:f.templateId,definition});
    const published = await templates.publish(pool, f.scope, f.templateId, draft.id, draft.edit_version, draft.definition_hash);
    assert.equal(published.definition.dataKeys[1].defaultValue, '9007199254740993.123456');
    const input = {name:'Conditions',templateVersionId:published.id,shared:{},rows:[
        {key:'one',data:{employeeId:'000001',note:'Required annex'}},
        {key:'two',data:{employeeId:'000002',flag:true,category:'C',salary:'0.00',note:'Another annex'}},
        {key:'three',data:{employeeId:'000003',flag:true,category:'ب'}},
    ].map(row=>({...row,recipients:{employee:{name:row.key,email:`${row.key}@example.invalid`}}}))};
    const preview = await previewCreation(pool, f.scope, input);
    assert.equal(preview.valid,true,JSON.stringify(preview));
    assert.equal(preview.documentCount,8);
    assert.deepEqual(preview.documentSummary.map(item=>[item.includedCount,item.excludedCount]),[[3,0],[1,2],[2,1],[2,1]]);
    assert.deepEqual(preview.sample.map(row=>row.exclusions.map(item=>item.documentKey)),[[],['document1','document2'],['document1','document3']]);
    assert.ok(preview.sample[1].exclusions.every(item=>item.name&&item.reason==='condition'));
    const changed = structuredClone(input); changed.rows[1].data.flag=false;
    await assert.rejects(createFromRows(pool,f.scope,{...changed,idempotencyKey:randomUUID(),previewHash:preview.previewHash},{reserveCapacity:async()=>{}}),{errorCode:'PREVIEW_CHANGED'});
    const created = await createFromRows(pool,f.scope,{...input,idempotencyKey:randomUUID(),previewHash:preview.previewHash},{reserveCapacity:async()=>{}});
    assert.equal(created.documentCount,8);
    const snapshots = (await pool.query('SELECT snapshot FROM signing_package_revisions WHERE owner_context_id=$1 ORDER BY snapshot->\'data\'->>\'employeeId\'',[f.contextId])).rows.map(row=>row.snapshot);
    assert.equal(snapshots[0].data.salary,'9007199254740993.123456');assert.equal(snapshots[1].data.salary,'0.00');
    assert.equal(snapshots[0].data.flag,false); assert.equal(snapshots[2].data.note,null);
    assert.deepEqual(snapshots[0].provenance.salary,{source:'default'});
    assert.deepEqual(snapshots[1].provenance.salary,{source:'manual'});
    assert.deepEqual(snapshots.map(item=>item.documents.length),[4,2,2]);
    assert.deepEqual(snapshots.map(item=>item.tasks.length),[4,2,2]);
    const old = (await pool.query('SELECT definition FROM signing_template_versions WHERE id=$1',[f.versionId])).rows[0].definition;
    assert.equal(old.documents[1].when,undefined);assert.equal(old.dataKeys[1].defaultValue,undefined);
    const invalid=structuredClone(definition);invalid.dataKeys[1].defaultValue=9007199254740993;
    await assert.rejects(templates.createDraft(pool,f.scope,{definition:invalid}),{errorCode:'INVALID_DATA'});
    const none=structuredClone(definition); none.documents.forEach(doc=>{doc.when={key:'flag',operator:'equals',value:true};});
    const noneDraft=await templates.createDraft(pool,f.scope,{definition:none});
    const nonePublished=await templates.publish(pool,f.scope,noneDraft.template_id,noneDraft.id,noneDraft.edit_version,noneDraft.definition_hash);
    const empty=await previewCreation(pool,f.scope,{...input,templateVersionId:nonePublished.id,rows:[input.rows[0]]});
    assert.equal(empty.valid,false); assert.equal(empty.documentSummary.length,0);
    const missing=structuredClone(input);missing.rows[0].data.flag=null;
    const unknown=await previewCreation(pool,f.scope,missing);
    assert.equal(unknown.valid,false);assert.equal(unknown.errors[0].path,'rows.0.data.flag');assert.equal(unknown.errors[0].code,'DATA_REQUIRED');

    process.env.SIGNING_V2_ENABLED='true';t.after(()=>delete process.env.SIGNING_V2_ENABLED);
    const {createRuntime}=require('../services/signingV2/runtime');
    const {RenderPool}=require('../services/signingV2/renderPool');
    const renderer=new RenderPool({concurrency:2});t.after(()=>renderer.close());
    const objects=new Map([[`synthetic/${f.contextId}/source.pdf`,source]]);
    const storage={read:async key=>Buffer.from(objects.get(key)),write:async(key,bytes)=>objects.set(key,Buffer.from(bytes)),verify:async(key,size,hash)=>{assert.equal(objects.get(key)?.length,size);assert.equal(bytesHash(objects.get(key)),hash);}};
    const runtime=createRuntime({pool,renderer,storage,provider:fakeProvider(),contextIds:[f.contextId],env:{SIGNING_V2_GRANT_KEY:Buffer.alloc(32,22).toString('base64'),WEBSITE_DOMAIN:'qa.example.invalid'},log:{log(){},error(){}}});
    t.after(()=>runtime.stop());await runtime.drain();
    const docs=(await pool.query(`SELECT r.snapshot->'data'->>'employeeId' AS person,d.document_key,a.object_key FROM signing_documents d
        JOIN signing_package_revisions r ON r.id=d.revision_id JOIN signing_artifacts a ON a.id=d.prepared_artifact_id WHERE d.owner_context_id=$1`,[f.contextId])).rows;
    assert.equal(docs.length,8);
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    for(const doc of docs){
        const pdf=await pdfjs.getDocument({data:new Uint8Array(objects.get(doc.object_key)),useSystemFonts:false,isEvalSupported:false,standardFontDataUrl:`${require('node:path').resolve(__dirname,'../node_modules/pdfjs-dist/standard_fonts')}/`}).promise;
        try{const text=(await(await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join('');assert.ok(text.includes(doc.person));
            for(const other of ['000001','000002','000003'].filter(value=>value!==doc.person))assert.ok(!text.includes(other));
        }finally{await pdf.destroy();}
    }
});

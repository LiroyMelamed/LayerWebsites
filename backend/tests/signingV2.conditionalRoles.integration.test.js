const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { syntheticPdf, fakeProvider } = require('./helpers/signingV2Delivery');
const { previewCreation, createFromRows } = require('../services/signingV2/creation');
const templates = require('../services/signingV2/templates');
const { digest, bytesHash } = require('../lib/signingV2/canonical');

test('conditional shared participants, empty first stages and mixed nested PDF rules use reviewed immutable snapshots',
    {skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const source=await syntheticPdf('SYNTHETIC ROLE RULES');
    const f=await databaseFixture(pool,{sourceBytes:source,documentCount:3});
    const definition=structuredClone(f.definition),originalHash=digest(f.definition);
    definition.dataKeys.push({key:'needsCounsel',type:'boolean',defaultValue:false});
    definition.stages=[{key:'counsel',label:'Counsel',after:null},{key:'client',label:'Client',after:'counsel'}];
    definition.roles[0].stage=1;
    definition.roles.push({key:'counsel',label:'Counsel',capacity:'professional',audience:'shared',min:1,max:1,stage:0,
        when:{operator:'all',conditions:[{key:'needsCounsel',operator:'equals',value:true},{key:'salary',operator:'equals',value:'1.00'}]}});
    definition.documents[0].when={operator:'any',conditions:[{key:'needsCounsel',operator:'equals',value:false},{key:'salary',operator:'equals',value:'1.00'}]};
    for(let i=1;i<3;i++)definition.documents[i].fields.push({...definition.documents[i].fields[1],id:'counsel',roleKey:'counsel',y:220,
        inactiveTreatment:i===1?'exclude_document':'authored_inactive'});
    const draft=await templates.createDraft(pool,f.scope,{templateId:f.templateId,definition});
    const published=await templates.publish(pool,f.scope,f.templateId,draft.id,draft.edit_version,draft.definition_hash);
    const body={templateVersionId:published.id,name:'Conditional parties',shared:{counsel:{name:'Shared counsel',email:'counsel@example.invalid'}},rows:[
        {key:'one',data:{employeeId:'000001'}},
        {key:'two',data:{employeeId:'000002',needsCounsel:true,salary:'1.000000'}},
        {key:'three',data:{employeeId:'000003',needsCounsel:true,salary:'2.00'}},
    ].map(row=>({...row,recipients:{employee:{name:row.key,email:`${row.key}@example.invalid`}}}))};
    const preview=await previewCreation(pool,f.scope,body);
    assert.equal(preview.valid,true,JSON.stringify(preview));assert.equal(preview.documentCount,6);assert.equal(preview.recipientCount,4);
    assert.deepEqual(preview.documentSummary.map(doc=>doc.includedCount),[2,1,3]);
    assert.deepEqual(preview.roleSummary.map(role=>[role.key,role.includedCount,role.excludedCount]),[['employee',3,0],['counsel',1,2]]);
    assert.equal(preview.shared[0].packageCount,1);
    const unknown=structuredClone(body);unknown.rows[0].data.needsCounsel=true;
    const blocked=await previewCreation(pool,f.scope,unknown);
    assert.equal(blocked.valid,false);assert.ok(blocked.errors.some(error=>error.path==='rows.0.data.salary'&&error.code==='DATA_REQUIRED'));
    const onlyInactive={...body,shared:{counsel:{name:'IGNORED',email:'invalid'}},rows:[body.rows[0]]};
    const inactive=await previewCreation(pool,f.scope,onlyInactive);
    assert.equal(inactive.valid,true,JSON.stringify(inactive));assert.equal(inactive.recipientCount,1);assert.deepEqual(inactive.shared,[]);
    const flipped=structuredClone(body);flipped.rows[0].data={employeeId:'000001',needsCounsel:true,salary:'1'};
    await assert.rejects(createFromRows(pool,f.scope,{...flipped,previewHash:preview.previewHash,idempotencyKey:randomUUID()},{reserveCapacity:async()=>{}}),{errorCode:'PREVIEW_CHANGED'});
    const create={...body,previewHash:preview.previewHash,idempotencyKey:randomUUID()};
    const [first,retry]=await Promise.all([createFromRows(pool,f.scope,create,{reserveCapacity:async()=>{}}),createFromRows(pool,f.scope,create,{reserveCapacity:async()=>{}})]);
    assert.equal(first.submissionId,retry.submissionId);assert.equal(first.documentCount,6);
    const revisions=(await pool.query("SELECT id,snapshot,revision_hash FROM signing_package_revisions WHERE owner_context_id=$1 ORDER BY snapshot->'data'->>'employeeId'",[f.contextId])).rows;
    assert.equal(revisions.length,3);assert.deepEqual(revisions.map(row=>row.snapshot.participants.length),[1,2,1]);
    assert.equal(revisions[1].snapshot.data.salary,'1.000000');
    assert.deepEqual(revisions[0].snapshot.exclusions,[{documentKey:'document1',reason:'inactive_role'}]);
    assert.equal(revisions[0].snapshot.documents[1].fields.find(field=>field.id==='counsel').active,false);
    assert.equal(digest((await pool.query('SELECT definition FROM signing_template_versions WHERE id=$1',[f.versionId])).rows[0].definition),originalHash);
    process.env.SIGNING_V2_ENABLED='true';t.after(()=>delete process.env.SIGNING_V2_ENABLED);
    const {createRuntime}=require('../services/signingV2/runtime'),{RenderPool}=require('../services/signingV2/renderPool');
    const renderer=new RenderPool({concurrency:2});t.after(()=>renderer.close());
    const objects=new Map([[`synthetic/${f.contextId}/source.pdf`,source]]),provider=fakeProvider();
    const storage={read:async key=>Buffer.from(objects.get(key)),write:async(key,bytes)=>objects.set(key,Buffer.from(bytes)),verify:async(key,size,hash)=>{assert.equal(objects.get(key)?.length,size);assert.equal(bytesHash(objects.get(key)),hash);}};
    const runtime=createRuntime({pool,renderer,storage,provider,contextIds:[f.contextId],env:{SIGNING_V2_GRANT_KEY:Buffer.alloc(32,23).toString('base64'),WEBSITE_DOMAIN:'qa.example.invalid'},log:{log(){},error(){}}});
    t.after(()=>runtime.stop());await runtime.drain();
    const tasks=(await pool.query('SELECT revision_id,stage,state FROM signing_tasks WHERE owner_context_id=$1',[f.contextId])).rows;
    for(const revision of [revisions[0],revisions[2]])assert.ok(tasks.filter(task=>task.revision_id===revision.id).every(task=>task.stage===1&&task.state==='ready'));
    assert.ok(tasks.filter(task=>task.revision_id===revisions[1].id&&task.stage===0).every(task=>task.state==='ready'));
    assert.ok(tasks.filter(task=>task.revision_id===revisions[1].id&&task.stage===1).every(task=>task.state==='blocked'));
    const docs=(await pool.query('SELECT d.revision_id,a.object_key FROM signing_documents d JOIN signing_artifacts a ON a.id=d.prepared_artifact_id WHERE d.owner_context_id=$1',[f.contextId])).rows;
    assert.equal(docs.length,6);
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    for(const doc of docs){const pdf=await pdfjs.getDocument({data:new Uint8Array(objects.get(doc.object_key)),useSystemFonts:false,isEvalSupported:false,standardFontDataUrl:`${require('node:path').resolve(__dirname,'../node_modules/pdfjs-dist/standard_fonts')}/`}).promise;
        try {assert.equal(pdf.numPages,f.directory.sources.get(f.sourceId).metadata.pages.length);const contents=(await(await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join('');assert.ok(contents.includes(revisions.find(row=>row.id===doc.revision_id).snapshot.data.employeeId));}
        finally{await pdf.destroy();}}
    for(const row of revisions)assert.equal(digest(row.snapshot),row.revision_hash);
});

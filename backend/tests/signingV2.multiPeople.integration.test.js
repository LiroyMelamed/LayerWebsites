const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { databaseFixture } = require('./helpers/signingV2Fixture');
const { previewCreation, createFromRows, listTemplates } = require('../services/signingV2/creation');
const { resolveRecipient } = require('../lib/signingV2/recipientBindings');
const person = index => ({ name: `Synthetic ${index}`, email: `person-${index}@example.invalid` });

test('explicit occurrence links are required for multi-person roles; cycles and unavailable positions never guess', () => {
    const roles = [{ key:'buyer', max:2, audience:'each' },{key:'closing',max:1,audience:'each'}];
    const input = { rows:[{recipients:{buyer:{people:[person(1),person(2)]},closing:{sameAsRole:'buyer'}}}] };
    const errors=[];resolveRecipient(roles,input,roles[1],0,'closing',errors);
    assert.equal(errors[0].code,'RECIPIENT_LINK_UNAVAILABLE');
    input.rows[0].recipients.closing.sameAsOccurrence=1;
    assert.deepEqual(resolveRecipient(roles,input,roles[1],0,'closing',[]),{...person(2),bindingKey:'0:buyer:1'});
    input.rows[0].recipients.buyer.people[1]={sameAsRole:'closing'};
    const cycle=[];resolveRecipient(roles,input,roles[1],0,'closing',cycle);
    assert.equal(cycle[0].code,'RECIPIENT_LINK_CYCLE');
    input.rows[0].recipients.buyer.people.pop();
    const missing=[];resolveRecipient(roles,input,roles[1],0,'closing',missing);
    assert.equal(missing[0].code,'RECIPIENT_LINK_UNAVAILABLE');
});

test('multiple people use fixed PDF positions and bounded durable writes; retries, optional slots and later-person links preserve identity',
    {skip:process.env.LEGAL_DB_QA!=='true',timeout:90000},async t=>{
    const pool=require('../config/db');t.after(()=>pool.end());
    const f=await databaseFixture(pool,{documentCount:2,configure:({definition,packages})=>{
        definition.roles[0].min=1;definition.roles[0].max=3;
        definition.stages.push({key:'closing',label:'Closing',after:'employee'});
        definition.roles.push({key:'closing',label:'Closing',capacity:'personal',min:1,max:1,stage:1});
        definition.signingRules=[];
        for(const pkg of packages) pkg.roles.closing=[{...pkg.roles.employee[0]}];
        for(const doc of definition.documents) {
            const original=doc.fields[1];
            doc.fields.push({...original,id:'second',occurrence:1,y:220,inactiveTreatment:'authored_inactive'},
                {...original,id:'third',occurrence:2,y:340,inactiveTreatment:'authored_inactive'},
                {...original,id:'closing',roleKey:'closing',y:460});
        }
        return definition;
    }});
    const roles=(await listTemplates(pool,f.scope)).templates[0].roles;
    assert.deepEqual(roles.map(role=>[role.min,role.max,role.capacity]),[[1,3,'personal'],[1,1,'personal']]);
    const input={templateVersionId:f.versionId,name:'Multiple buyers',shared:{},rows:[{key:'one',data:{employeeId:'00001'},recipients:{
        employee:{people:[person(1),person(2)]},closing:{sameAsRole:'employee',sameAsOccurrence:1}}}]};
    const preview=await previewCreation(pool,f.scope,input);
    assert.equal(preview.valid,true,JSON.stringify(preview.errors));assert.equal(preview.recipientCount,2);
    assert.deepEqual(preview.sample[0].recipients.map(item=>[item.roleKey,item.occurrence,item.name]),[['employee',0,'Synthetic 1'],['employee',1,'Synthetic 2'],['closing',0,'Synthetic 2']]);
    const request={...input,previewHash:preview.previewHash,idempotencyKey:randomUUID()};
    const options={reserveCapacity:async()=>{}};
    const [first,second]=await Promise.all([createFromRows(pool,f.scope,request,options),createFromRows(pool,f.scope,request,options)]);
    assert.equal(first.submissionId,second.submissionId);
    const revision=(await pool.query('SELECT snapshot FROM signing_package_revisions WHERE owner_context_id=$1',[f.contextId])).rows[0].snapshot;
    assert.equal(revision.participants.length,3);assert.equal(new Set(revision.participants.map(item=>item.personId)).size,2);
    assert.equal(revision.participants[1].personId,revision.participants[2].personId);
    assert.deepEqual(revision.participants.map(item=>item.stage),[0,0,1]);
    assert.deepEqual(revision.documents[0].fields.filter(item=>item.type!=='data').map(item=>[item.occurrence,item.y,item.active]),[[0,100,true],[1,220,true],[2,340,false],[0,460,true]]);
    const fewer=structuredClone(input);fewer.rows[0].recipients.employee.people.pop();fewer.rows[0].recipients.closing.sameAsOccurrence=0;
    assert.equal((await previewCreation(pool,f.scope,fewer)).valid,true);
    const changed=structuredClone(input);changed.rows[0].recipients.employee.people.reverse();
    await assert.rejects(createFromRows(pool,f.scope,{...changed,previewHash:preview.previewHash,idempotencyKey:randomUUID()},options),{errorCode:'PREVIEW_CHANGED'});
    const tooMany=structuredClone(input);tooMany.rows[0].recipients.employee.people.push(person(3),person(4));
    assert.ok((await previewCreation(pool,f.scope,tooMany)).errors.some(item=>item.code==='ROLE_CARDINALITY'));
    const gap=structuredClone(input);gap.rows[0].recipients.employee.people=[person(1),{},person(3)];
    assert.ok((await previewCreation(pool,f.scope,gap)).errors.some(item=>item.path==='rows.0.employee.people.1.name'));
    const duplicate=structuredClone(input);duplicate.rows[0].recipients.employee.people[1]={sameAsRole:'employee',sameAsOccurrence:0};
    assert.ok((await previewCreation(pool,f.scope,duplicate)).errors.some(item=>item.code==='DISTINCT_PEOPLE_REQUIRED'));
    const before=(await pool.query('SELECT count(*) AS count FROM signing_submissions WHERE owner_context_id=$1',[f.contextId])).rows[0].count;
    assert.equal(before,'1','invalid previews never create packages');
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const records=require('../services/signingV2/wordTemplates');
const inputs=require('../services/signingV2/packageInputs');
const definition={dataRoles:[{key:'tenant',label:'שוכר'}],fields:[
    {key:'plot',label:'גוש',required:true,source:{kind:'manual'}},
    {key:'identity',label:'תעודת זהות',required:true,source:{kind:'role',roleKey:'tenant',property:'identityNumber'}},
    {key:'name',label:'שם',required:true,source:{kind:'role',roleKey:'tenant',property:'fullName'}},
]};
test('missing linked values are local overrides bound to the selected person; manual titles are never profile warnings',async t=>{
    const original=records.resolveRecordValues,scope={userId:7};
    t.after(()=>{records.resolveRecordValues=original;});
    const calls=[];
    records.resolveRecordValues=async(_db,actual,input)=>{
        assert.equal(actual,scope);calls.push(input);
        return {'role.tenant.fullName':input.roleClientIds.tenant===12?'Second person':'First person','role.tenant.identityNumber':''};
    };
    const first=await inputs.resolve(null,scope,definition,{roleClientIds:{tenant:11},values:{plot:{value:'123'}}});
    assert.equal(first.fields[0].linked,false);assert.equal(first.fields[0].missing,false);
    assert.equal(first.fields[1].linked,true);assert.equal(first.fields[1].recordId,11);assert.equal(first.fields[1].missing,true);
    const override={value:'000012345',recordId:11};
    const filled=await inputs.resolve(null,scope,definition,{roleClientIds:{tenant:11},values:{identity:override}});
    assert.equal(filled.fields[1].value,'000012345');assert.equal(filled.fields[1].overridden,true);
    await assert.rejects(inputs.resolve(null,scope,definition,{roleClientIds:{tenant:12},values:{identity:override}}),e=>e.errorCode==='PACKAGE_INPUT_PERSON_CHANGED');
    const second=await inputs.resolve(null,scope,definition,{roleClientIds:{tenant:12},values:{}});
    assert.equal(second.fields[1].value,'');assert.equal(second.fields[2].value,'Second person');
    assert.ok(calls.every(call=>Object.keys(call.manualValues).length===0));
});

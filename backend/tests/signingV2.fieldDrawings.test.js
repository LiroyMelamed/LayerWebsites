const test = require('node:test'), assert = require('node:assert/strict');
const { fieldDrawings } = require('../services/signingV2/fieldDrawings');
const png = require('./helpers/completionMarkPng');
const fixture = () => ({ items: [{ taskId: 'a', documentId: 'one', fieldIds: ['sign','initial','stamp'] }], documents: new Map([['one', {field_bindings:[
    {id:'sign',type:'signature',required:true},{id:'initial',type:'initials',required:true},{id:'stamp',type:'lawyerStamp',required:false},
    {id:'auto',type:'completionMark',required:false},
]}]]) });
const record = (color, ...ids) => ({image:png(color).toString('base64'),fields:ids.map(fieldId=>({taskId:'a',fieldId}))});
test('malformed drawing records and field references return a validation error instead of an operational failure',()=>{
    const f=fixture();
    for(const input of [[null],[0],[[]],[{...record(0x2244B8FF,'sign'),fields:[null]}],[{...record(0x2244B8FF,'sign'),fields:[{taskId:1,fieldId:'sign'}]}]]) {
        assert.throws(()=>fieldDrawings(f.items,f.documents,input),{errorCode:'INVALID_VALUES',httpStatus:422});
    }
});
test('per-field drawings dedupe bytes without merging distinct signature/initial/stamp images',()=>{
    const f=fixture(), result=fieldDrawings(f.items,f.documents,[record(0x2244B8FF,'sign'),record(0x554455FF,'initial'),record(0x22B844FF,'stamp')]);
    assert.equal(result.missing,false);assert.equal(result.images.size,3);
    assert.notEqual(result.bindings['a.sign'],result.bindings['a.stamp']);
    const duplicate=fieldDrawings(f.items,f.documents,[record(0x2244B8FF,'sign'),record(0x2244B8FF,'initial')]);
    assert.equal(duplicate.images.size,1);assert.equal(duplicate.missing,false,'an optional manual stamp can stay empty');
});
test('future/foreign/text/automatic fields and duplicate assignments cannot receive a drawing',()=>{
    const f=fixture();
    for(const input of [[record(0x2244B8FF,'auto')],[record(0x2244B8FF,'sign','sign')],[{...record(0x2244B8FF,'sign'),fields:[{taskId:'future',fieldId:'sign'}]}]]){
        assert.throws(()=>fieldDrawings(f.items,f.documents,input),{errorCode:'INVALID_VALUES'});
    }
    assert.throws(()=>fieldDrawings(f.items,f.documents,[{image:'invalid',fields:[{taskId:'a',fieldId:'sign'}]}]),{errorCode:'INVALID_SIGNATURE'});
    assert.equal(fieldDrawings(f.items,f.documents,[]).missing,true);
    assert.equal(fieldDrawings(f.items,f.documents,undefined).missing,true,'the incumbent single-image request remains supported');
});

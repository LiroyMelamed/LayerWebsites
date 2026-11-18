'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const {bytesHash}=require('../lib/signingV2/canonical');
const {renderData}=require('../services/signingV2/packageData');
const {extractPdfPagesBounded}=require('../lib/wordTemplates/visual');
test('review PDF contains actual entered data through the existing renderer, with overflow rejected', {timeout:90000},async()=>{
    const source=await PDFDocument.create();source.addPage([600,800]);const bytes=Buffer.from(await source.save());
    const input={sourceBytes:bytes,expectedSourceHash:bytesHash(bytes),locale:'he',fields:[
        {id:'plot',type:'data',value:'12345',pageNum:1,x:50,y:50,width:150,height:40,fontSize:12,align:'start',overflow:'block'},
    ]};
    const result=await renderData(input);
    assert.notEqual(result.contentHash,input.expectedSourceHash);assert.equal(bytesHash(result.bytes),result.contentHash);
    const pages=await extractPdfPagesBounded(result.bytes);assert.ok(pages[0].items.some(item=>item.text.includes('12345')));
    assert.equal(bytesHash(bytes),input.expectedSourceHash);
    await assert.rejects(renderData({...input,fields:[{...input.fields[0],value:'0123456789'.repeat(100),width:20}]}),e=>e.errorCode==='TEXT_OVERFLOW');
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {importDocx,createBinding,materializeDocx}=require('../lib/wordTemplates');
const {normalizePassiveLinks}=require('../lib/wordTemplates/passiveLinks');
const {convertDocxToPdf}=require('../lib/wordTemplates/converter');
const {buildAuthoringMapBounded}=require('../lib/wordTemplates/visual');
const {remapAnchor,locateAnchor}=require('../lib/wordTemplates/signatureAnchors');
test('supplied Hebrew rental uses verified signature anchor after actual long-value conversion changes pagination',{
    skip:!process.env.WORD_RENTAL_QA_FILE||!process.env.WORD_REAL_CONVERTER,timeout:180000,
},async()=>{
    const source=normalizePassiveLinks(fs.readFileSync(process.env.WORD_RENTAL_QA_FILE));
    const original=importDocx(source),part=original.parts.find(p=>p.name==='word/document.xml');
    const property=part.paragraphs.find(p=>p.id==='p23'),signature=part.paragraphs.find(p=>p.id==='p123');
    assert.ok(property.text.includes('8868'));assert.ok(signature.text.includes('המשכירה'));
    const start=property.text.indexOf('8868');
    const binding=createBinding(original,{id:'plot',field:'manual.plot',fieldLabel:'גוש',part:part.name,paragraphId:property.id,start,end:start+4});
    const anchorBinding=createBinding(original,{id:'signature',field:'manual.signature',fieldLabel:'חתימה',part:part.name,paragraphId:signature.id,start:signature.text.indexOf('המשכירה'),end:signature.text.indexOf('המשכירה')+'המשכירה'.length});
    const anchor=Object.fromEntries(['part','paragraphId','paragraphHash','start','end','selectedTextHash','sourceHash'].map(key=>[key,anchorBinding[key]]));
    const convert=bytes=>convertDocxToPdf(bytes,{executablePath:process.env.WORD_REAL_CONVERTER,timeoutMs:60000});
    const before=await convert(source),beforeMap=await buildAuthoringMapBounded(original,before.buffer);
    const out='/Users/liroymelamed/.cache/melamedia-builds/document-workflow-20261117/unified-rental-anchor';fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'source-map.json'),JSON.stringify(beforeMap));
    const placement={offsetX:0,offsetY:24,width:100,height:40};
    const oldPosition=locateAnchor(beforeMap,anchor,placement);
    const values={'manual.plot':'12345 '+('נתון בדיקה ארוך לשינוי פריסת העמוד בלבד ').repeat(120)};
    const filled=materializeDocx(source,{sourceHash:original.sourceHash,bindings:[binding],values});
    const model=importDocx(filled.buffer),after=await convert(filled.buffer),afterMap=await buildAuthoringMapBounded(model,after.buffer);
    const position=locateAnchor(afterMap,remapAnchor(original,model,anchor,[binding],values),placement);
    assert.ok(after.pageCount>before.pageCount);assert.ok(position.pageNum>oldPosition.pageNum);
    assert.ok(Number.isFinite(position.x)&&Number.isFinite(position.y));
    assert.equal(model.parts[0].paragraphs.find(p=>p.id==='p123').text,signature.text);
    fs.writeFileSync(path.join(out,'source.pdf'),before.buffer);fs.writeFileSync(path.join(out,'long-value.pdf'),after.buffer);
    fs.writeFileSync(path.join(out,'positions.json'),JSON.stringify({beforePages:before.pageCount,afterPages:after.pageCount,oldPosition,position},null,2));
});

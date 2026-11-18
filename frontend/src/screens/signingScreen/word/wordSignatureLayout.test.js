import {signatureSpots} from './wordSignatureLayout';
const anchor={id:'signature-one',part:'word/document.xml',paragraphId:'p1',start:0,end:3,fieldLabel:'Tenant',placement:{offsetX:5,offsetY:24,width:120,height:48}};
const page={pageNum:1,width:600,height:800,rotation:0,viewportTransform:[1,0,0,-1,0,800],items:[{transform:[12,0,0,12,100,700],height:12,segments:[{part:'word/document.xml',paragraphId:'p1',sourceStart:0,sourceEnd:3}]}]};
test('Word signature preview shares the server run-boundary coordinates and native PDF field shape',()=>{
 const spots=signatureSpots({pages:[page]},[anchor],{1:'verified'});
 expect(spots).toHaveLength(1);expect(spots[0].x).toBeCloseTo(100*800/600+5);expect(spots[0].y).toBeCloseTo(88*800/600+24);
 expect(spots[0]).toMatchObject({id:anchor.id,width:120,height:48,pageNum:1,fieldType:'signature',signerName:'Tenant'});
});
test('Unverified pages, cross-page and unsupported transforms never show a misleading field placement',()=>{
 expect(signatureSpots({pages:[page]},[anchor],{})).toEqual([]);
 expect(signatureSpots({pages:[page,{...page,pageNum:2}]},[anchor],{1:'verified',2:'verified'})).toEqual([]);
 expect(signatureSpots({pages:[{...page,rotation:90}]},[anchor],{1:'verified'})).toEqual([]);
});

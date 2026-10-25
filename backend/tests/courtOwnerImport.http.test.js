'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const request=require('supertest');
const {createAppError}=require('../utils/appError');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const DOC='33333333-3333-4333-8333-333333333333';
const actionId='44444444-4444-4444-8444-444444444444';
function setup(t,{gate=true}={}) {
    const saved=[],calls=[],prior={...process.env};
    Object.assign(process.env,{COURT_OWNER_IMPORT_ENABLED:String(gate),RUNTIME_TENANT:'melamedia'});
    function stub(name,exports){const id=require.resolve(name);saved.push([id,require.cache[id]]);require.cache[id]={id,filename:id,loaded:true,exports};}
    const result={ok:true,imported:true,replayed:false,deduplicated:false,documentId:DOC,updateId:DOC,sha256:'a'.repeat(64),caseId:101,courtNumber:'67104-01-20',sourceKind:'owner_file',automaticConnected:false};
    stub('../config/db',{query:async(sql,args)=>({rows:sql.includes('case_whatsapp_groups')?[]:[{id:DOC,title:'Synthetic',is_demo:false,source_kind:'owner_file',document_id:DOC}]})});
    stub('../services/settingsService',{isPlatformAdmin:async id=>id===1,getSetting:async()=> 'Synthetic'});
    stub('../lib/tenant/tenantContext',{isMultiTenantMode:()=>false});
    stub('../middlewares/authMiddleware',(req,_res,next)=>{
        const identity=req.headers['x-test-identity'];if(!identity)return next(createAppError('UNAUTHORIZED',401));
        req.user={UserId:identity==='platform'?1:11,Role:identity==='client'?'Client':identity==='staff'?'Lawyer':'Admin'};
        req.firmTenantId=identity==='platform'?null:A;
        req.isOfficeOwner=identity==='owner'||identity==='unvalidated';req.isPlatformAdminUser=identity==='platform';
        req.firmPermissionContextValidated=identity!=='unvalidated';req.firmPermissionMode=identity==='platform'?'platform_admin':'legacy';next();
    });
    stub('../lib/firmPermissions/caseAccess',{assertCaseRecordAccess:async(req,id)=>req.headers['x-deny-case']==='true'?createAppError('FORBIDDEN',403):null});
    const core=require('../services/integrations/courtOwnerImport');
    stub('../services/integrations/courtOwnerImport',{...core,createCourtOwnerImport:()=>({
        capability:async args=>{calls.push(['capability',args]);return{enabled:gate,canImport:gate&&args.policyAllowed,mode:'owner_file',automaticConnected:false,maxBytes:5242880,courtNumber:'67104-01-20'};},
        importFile:async args=>{calls.push(['import',args]);return result;},
        document:async args=>{calls.push(['document',args]);if(args.caseId!==101||args.documentId!==DOC)throw createAppError('COURT_DOCUMENT_NOT_FOUND',404);return{buffer:Buffer.from('%PDF-Synthetic'),filename:'החלטה.pdf',sha256:'a'.repeat(64)};},
    })});
    stub('../services/integrations/runtime',{service:{},worker:{},runOffice:(_id,fn)=>fn()});
    for(const name of ['../routes/officeIntegrationsRoutes','../middlewares/requirePlatformAdmin']){const id=require.resolve(name);saved.push([id,require.cache[id]]);delete require.cache[id];}
    const app=express();app.use(express.json());app.use('/office-integrations',require('../routes/officeIntegrationsRoutes'));
    app.use((err,_req,res,_next)=>res.status(err.httpStatus||500).json({errorCode:err.errorCode||'INTERNAL_ERROR'}));
    t.after(()=>{for(const[id,old]of saved.reverse()){if(old)require.cache[id]=old;else delete require.cache[id];}for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);});
    const upload=(identity='owner',bytes=Buffer.from('%PDF-Synthetic'))=>{
        let q=request(app).post('/office-integrations/court/import-file');if(identity)q=q.set('x-test-identity',identity);
        return q.field('caseId','101').field('courtNumber','67104-01-20').field('issuedOn','2026-10-21').field('title','Synthetic decision').field('actionId',actionId).field('sourceConfirmed','true').attach('file',bytes,'Synthetic.pdf');
    };
    return{app,calls,upload};
}
test('import upload is owner-only, rejects clients/staff/unvalidated identities and foreign office selectors',async t=>{
    const{app,calls,upload}=setup(t);
    await upload(null).expect(401);
    for(const who of ['client','staff','unvalidated'])await upload(who).expect(403);
    await request(app).post('/office-integrations/court/import-file?officeId='+B).set('x-test-identity','owner').expect(403);
    assert.equal(calls.filter(c=>c[0]==='import').length,0);
});
test('real multipart parsing passes exact source fields and current authenticated actor/office to the service',async t=>{
    const{calls,upload}=setup(t);const response=await upload().expect(201);
    assert.equal(response.body.automaticConnected,false);assert.equal(response.body.sourceKind,'owner_file');
    const args=calls.find(c=>c[0]==='import')[1];assert.equal(args.officeId,A);assert.equal(args.actorUserId,11);
    assert.equal(args.input.actionId,actionId);assert.equal(args.input.courtNumber,'67104-01-20');assert.equal(args.input.sourceConfirmed,'true');assert.deepEqual(args.file.buffer,Buffer.from('%PDF-Synthetic'));
});
test('disabled QA capture and oversized uploads never reach the import service',async t=>{
    const a=setup(t,{gate:false});await a.upload().expect(503);assert.equal(a.calls.length,0);
});
test('multipart byte limits fail before importing a file',async t=>{
    const{calls,upload}=setup(t);const r=await upload('owner',Buffer.alloc(5*1024*1024+1)).expect(413);
    assert.equal(r.body.errorCode,'COURT_IMPORT_TOO_LARGE');assert.equal(calls.length,0);
});
test('case-read access and client denial protect original PDF downloads and keep private cache headers',async t=>{
    const{app,calls}=setup(t);const url='/office-integrations/cases/101/court-documents/'+DOC;
    await request(app).get(url).expect(401);await request(app).get(url).set('x-test-identity','client').expect(403);
    await request(app).get(url).set('x-test-identity','staff').set('x-deny-case','true').expect(403);
    assert.equal(calls.length,0);
    const response=await request(app).get(url).set('x-test-identity','staff').expect(200);
    assert.equal(response.headers['content-type'],'application/pdf');assert.equal(response.headers['cache-control'],'private, no-store');
    assert.equal(response.headers['x-content-type-options'],'nosniff');assert.match(response.headers['content-disposition'],/^attachment;/);assert.equal(response.headers['x-content-sha256'],'a'.repeat(64));
    assert.deepEqual(response.body,Buffer.from('%PDF-Synthetic'));
});
test('case projection exposes manual capability only to a validated owner and honors record access before queries',async t=>{
    const{app,calls}=setup(t);
    const owner=await request(app).get('/office-integrations/cases/101').set('x-test-identity','owner').expect(200);
    assert.equal(owner.body.courtImport.canImport,true);assert.equal(owner.body.courtImport.automaticConnected,false);
    const staff=await request(app).get('/office-integrations/cases/101').set('x-test-identity','staff').expect(200);assert.equal(staff.body.courtImport.canImport,false);
    const before=calls.length;await request(app).get('/office-integrations/cases/101').set('x-test-identity','owner').set('x-deny-case','true').expect(403);assert.equal(calls.length,before);
});

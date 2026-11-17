'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const request=require('supertest');const express=require('express');
const pool=require('../config/db');const service=require('../services/caseDocumentRequests');
const routes=require('../routes/caseRoutes');
const {normalizeRolePermissions}=require('../lib/firmRolePermissions');
test('document request HTTP routes enforce roles, ownership and read-only client projection',async t=>{
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{req.user={UserId:Number(req.headers['x-user']||2),Role:req.headers['x-role']||'Client'};req.firmPermissionMode=req.headers['x-mode']||'legacy';req.firmPermissions=normalizeRolePermissions({areas:{cases:{visible:true,actions:['view'],dataScope:'all_firm'}}});next();});
 for(const layer of routes.stack.filter(layer=>layer.route?.path.includes('document-requests'))){
  const route=layer.route;app[Object.keys(route.methods)[0]](route.path,...route.stack.slice(1).map(layer=>layer.handle));
 }
 app.use((error,req,res,next)=>res.status(error.httpStatus||500).json({errorCode:error.errorCode}));
 let saved=0,acted=0,projection;
 t.mock.method(pool,'query',async(sql,params)=>{
  if(sql.includes('FROM case_users'))return{rows:params[0]===10&&params[1]===2?[{}]:[]};
  if(sql.includes('SELECT 1 FROM cases'))return{rows:params[0]===10?[{}]:[]};
  throw Error('Unexpected query in access test');
 });
 t.mock.method(service,'list',async(db,id,options)=>{projection=options;return{requests:[]};});
 t.mock.method(service,'save',async()=>{saved++;return{};});t.mock.method(service,'action',async()=>{acted++;});
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal((await request(app).get('/10/document-requests')).status,200);assert.deepEqual(projection,{client:true});
 assert.equal((await request(app).get('/20/document-requests')).status,403);
 assert.equal((await request(app).put('/10/document-requests').send({items:[]})).status,403);
 assert.equal((await request(app).post(`/10/document-requests/${id}/action`).send({action:'send'})).status,403);
 assert.equal((await request(app).put('/10/document-requests').set('x-role','Lawyer').send({items:[]})).status,403);
 assert.equal((await request(app).put('/10/document-requests').set('x-role','Staff').set('x-mode','role').send({items:[]})).status,403);
 assert.equal(saved,0);assert.equal(acted,0);
 assert.equal((await request(app).put('/10/document-requests').set('x-role','Admin').send({items:[]})).status,200);assert.equal(saved,1);
 assert.equal((await request(app).post('/10/document-requests/not-a-uuid/action').set('x-role','Admin').send({action:'send'})).status,400);
 assert.equal((await request(app).get('/20/document-requests').set('x-role','Admin')).status,404);
});

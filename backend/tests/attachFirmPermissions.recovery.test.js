const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function middleware(query) {
 const filename = path.resolve(__dirname,'../middlewares/attachFirmPermissions.js');
 const mod = {exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'), {module:mod, require(id){
  if(id==='../config/db')return {query};
  return require(path.resolve(path.dirname(filename),id));
 }});
 return mod.exports;
}
async function invoke(query, jwtRole='Admin') {
 const req={user:{UserId:1,Role:jwtRole}};let error;
 await middleware(query)(req,{},e=>{error=e});return {req,error};
}
for(const code of ['ECONNREFUSED','ETIMEDOUT','57P01','08006','42P01','42703']) test(`permission DB ${code} must block request`,async()=>{
 const {error}=await invoke(async()=>{throw Object.assign(new Error('database unavailable'),{code})});
 assert.ok(error,'must forward DB error instead of allowing legacy permissions');
});
test('legacy user retains role mode',async()=>{
 const {req,error}=await invoke(async()=>({rows:[{role:'Lawyer',firm_staff_role_id:null}]}),'Lawyer');
 assert.equal(error,undefined);assert.equal(req.firmPermissionMode,'legacy');
});
test('inactive assigned role denies',async()=>{
 const {error}=await invoke(async()=>({rows:[{firm_staff_role_id:'x',role_id:'x',role_is_active:false}]}));
 assert.equal(error.httpStatus,403);
});
test('cross tenant assigned role denies',async()=>{
 const {error}=await invoke(async()=>({rows:[{firm_staff_role_id:'x',role_id:'x',role_is_active:true,law_firm_tenant_id:'A',role_tenant_id:'B'}]}));
 assert.equal(error.httpStatus,403);
});
test('permission edits are loaded on every request, without stale grants',async()=>{
 const {requireAreaAction}=require('../lib/firmPermissions/accessPure');
 let actions=['view','edit'];let queries=0;
 const query=async()=>{queries++;return {rows:[{firm_staff_role_id:'x',role_id:'x',role_is_active:true,law_firm_tenant_id:'A',role_tenant_id:'A',role_permissions:{areas:{cases:{visible:true,actions}}}}]}};
 const before=await invoke(query);assert.equal(requireAreaAction(before.req,'cases','edit'),null);
 actions=['view'];const after=await invoke(query);assert.equal(requireAreaAction(after.req,'cases','edit').httpStatus,403);assert.equal(queries,2);
});
test('database outage returns an error response, not a successful handler',async()=>{
 const errorHandler=require('../middlewares/errorHandler');
 const {error}=await invoke(async()=>{throw Object.assign(new Error('database unavailable'),{code:'ECONNREFUSED'})});
 let status,body;const res={headersSent:false,status(s){status=s;return this},json(b){body=b;return this}};
 errorHandler(error,{},res,()=>{throw new Error('must not continue')});
 assert.equal(status,500);assert.equal(body.success,false);assert.equal(body.errorCode,'INTERNAL_ERROR');
});
test('platform administrator retains platform mode',async()=>{
 const {req,error}=await invoke(async()=>({rows:[{is_platform_admin:true}]}));
 assert.equal(error,undefined);assert.equal(req.firmPermissionMode,'platform_admin');
});

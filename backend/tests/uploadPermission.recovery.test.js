const test=require('node:test');const assert=require('node:assert/strict');
const requireUploadPermission=require('../middlewares/requireUploadPermission');
function check(mode,area,action){let result;requireUploadPermission({firmPermissionMode:mode,firmPermissions:{areas:area?{[area]:{visible:true,actions:[action]}}:{}}},{},err=>{result=err?.httpStatus||200;});return result;}
test('read-only office role cannot obtain upload credentials',()=>{assert.equal(check('role','cases','view'),403);assert.equal(check('role'),403);assert.equal(check('unknown'),403);});
test('explicit write/upload actions permit upload',()=>{assert.equal(check('role','cases','edit'),200);assert.equal(check('role','signing','upload'),200);assert.equal(check('role','signing','view'),403);assert.equal(check('platform_admin'),200);assert.equal(check('legacy'),200);});

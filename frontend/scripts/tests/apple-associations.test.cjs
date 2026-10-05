const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');
const frontend=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(frontend,'scripts/apply-tenant-branding.js'),'utf8');
const block=source.slice(source.indexOf('const tenantAppleAssociation'),source.indexOf('console.log(`[apply-tenant-branding] applied'));
for(const [tenant,bundle] of Object.entries({melamedlaw:'MelamedLaw',morlevy:'MorLevy',ashrafessa:'AshrafEssa',melamedia:'MelamediaShowcase'})) {
 test(tenant+' publishes only its own Apple app identifier to both paths',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'law-aasa-'));
  try {vm.runInNewContext(block,{fs,path,root,src:path.join(frontend,'public/tenants',tenant)});
   for(const name of ['apple-app-site-association','.well-known/apple-app-site-association']) {
    const json=JSON.parse(fs.readFileSync(path.join(root,'public',name)));assert.equal(json.applinks.details[0].appID,'A38RHM586C.com.melamedia.'+bundle);assert.ok(json.applinks.details[0].paths.includes('/s/*'));
   }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
 });
}
test('tenant without an app cannot inherit the previous tenant association',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'law-aasa-'));try {
  fs.mkdirSync(path.join(root,'public/.well-known'),{recursive:true});for(const f of ['apple-app-site-association','.well-known/apple-app-site-association'])fs.writeFileSync(path.join(root,'public',f),'stale');
  vm.runInNewContext(block,{fs,path,root,src:path.join(root,'absent-tenant')});assert.ok(!fs.existsSync(path.join(root,'public/apple-app-site-association')));assert.ok(!fs.existsSync(path.join(root,'public/.well-known/apple-app-site-association')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

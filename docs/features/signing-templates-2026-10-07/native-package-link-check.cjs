const fs=require('node:fs');const vm=require('node:vm');const crypto=require('node:crypto');const assert=require('node:assert/strict');
const results=[];
for(const repo of ['LawyerApp-MelamedLaw','LawyerApp-MorLevi','LawyerApp']){
 const path=`/Users/liroymelamed/Projects/${repo}/utils/publicBrowserLinks.js`;const source=fs.readFileSync(path,'utf8');
 const context={Linking:{parse:raw=>{const u=new URL(raw);return{path:u.pathname,queryParams:Object.fromEntries(u.searchParams)}}},WebBrowser:{},console};
 vm.runInNewContext(source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nthis.check={isPublicBrowserUrl,isNativePublicSignUrl};',context);
 const url='https://qa.example.invalid/ViewSignedDocument/Package?batch=synthetic-only';
 assert.equal(context.check.isPublicBrowserUrl(url),true);assert.equal(context.check.isNativePublicSignUrl(url),false);
 results.push({repository:repo,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),packagePathHandledByExistingBrowserSheet:true,verification:'Executed current URL classification source with a standard HTTPS parser; not device UI automation.'});
}
fs.writeFileSync('../../outputs/signing-templates-20261006/native-link-compatibility.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));

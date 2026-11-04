const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function load(file,deps,env={}){const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8'),{module,exports:module.exports,require:id=>{if(!(id in deps))throw Error(id);return deps[id];},process:{env},console});return module.exports;}
test('automatic pricing opens signing despite commercial plan flag; explicit operational disable and OTP remain intact',async()=>{
 const plan={featureFlags:{signing_enabled:false,signing_auto_tier_enabled:true,signing_client_otp_required:true}};
 const deps={'../plan/resolveFirmPlan':{resolveFirmPlan:async()=>plan}};
 const policy=await load('../lib/firm/resolveFirmSigningPolicy',deps).resolveFirmSigningPolicy();
 assert.equal(policy.signingEnabled,true);assert.equal(policy.signingClientOtpRequired,true);
 assert.equal((await load('../lib/firm/resolveFirmSigningPolicy',deps,{SIGNING_ENABLED:'false'}).resolveFirmSigningPolicy()).signingEnabled,false);
 plan.featureFlags.signing_auto_tier_enabled=false;
 assert.equal((await load('../lib/firm/resolveFirmSigningPolicy',deps).resolveFirmSigningPolicy()).signingEnabled,false);
});
test('automatic tier bypasses only document quota, retaining storage and SMS blocks',async()=>{
 const limits={featureFlags:{signing_auto_tier_enabled:true},quotas:{documentsMonthlyQuota:500,storageMbQuota:1,otpSmsMonthlyQuota:1}};
 const lib=load('../lib/limits/enforceFirmLimits',{
 './getLimitsForFirm':{getLimitsForFirm:async()=>limits},'./getUsageForFirm':{getUsageForFirm:async()=>({documents:{createdThisMonth:500},storage:{bytesTotal:0},seats:{used:1},sms:{sentThisMonth:1}})},
 '../billing/firmBillingService':{getBillingSnapshot:async()=>({billingEnabled:true})}});
 assert.equal((await lib.checkFirmLimitsOrNull({action:'upload_signing_file',increments:{documentsCreatedThisMonth:1}})).blocks.length,0);
 assert.deepEqual(Array.from((await lib.checkFirmLimitsOrNull({action:'upload_signing_file',increments:{documentsCreatedThisMonth:1,storageBytesTotal:2*1024*1024}})).blocks),['Storage quota exceeded']);
 assert.equal((await lib.checkFirmLimitsOrNull({action:'send_otp_sms',increments:{otpSmsThisMonth:1}})).blocks.length,1);
 limits.featureFlags.signing_auto_tier_enabled=false;
 assert.equal((await lib.checkFirmLimitsOrNull({action:'upload_signing_file',increments:{documentsCreatedThisMonth:1}})).blocks.length,1);
});

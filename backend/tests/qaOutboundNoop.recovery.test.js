const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { qaOutboundNoop } = require('../lib/qaOutboundNoop');
const previous = { ...process.env };
function setQa() { process.env.QA_OUTBOUND_MODE='noop';process.env.DB_NAME='melamedia';process.env.PORT='3003';delete process.env.DATABASE_URL; }
test.after(() => { for(const key of ['QA_OUTBOUND_MODE','QA_OUTBOUND_ALLOW','DB_NAME','PORT','DATABASE_URL','IS_PRODUCTION','FORCE_SEND_SMS_ALL','FORCE_SEND_EMAIL_ALL']) { if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]; } });
test('disabled mode preserves normal transports; guard rejects other tenants', () => {
 delete process.env.QA_OUTBOUND_MODE;assert.equal(qaOutboundNoop('sms'),null);
 setQa();process.env.DB_NAME='morlevy';assert.throws(()=>qaOutboundNoop('sms'),/isolated/);
 setQa();process.env.PORT='3001';assert.throws(()=>qaOutboundNoop('sms'),/isolated/);
 setQa();process.env.DATABASE_URL='postgres://local/other';assert.throws(()=>qaOutboundNoop('sms'),/isolated/);
 setQa();process.env.QA_OUTBOUND_MODE='typo';assert.throws(()=>qaOutboundNoop('sms'),/isolated/);
 setQa();process.env.QA_OUTBOUND_ALLOW='0500000000';
 assert.equal(qaOutboundNoop('sms','+972500000000'),null);
 assert.equal(qaOutboundNoop('sms','+972501111111').mode,'qa-noop');
 delete process.env.QA_OUTBOUND_ALLOW;
});
function loadUtility(file) {
 const mod={exports:{}}; const forbidden=()=>{throw new Error('Provider or DB IO attempted');};
 const req=(id)=>{
  if(id==='../lib/qaOutboundNoop')return {qaOutboundNoop};
  if(id==='dotenv')return {config(){}};
  if(id==='axios')return {post:forbidden,request:forbidden};
  if(id==='nodemailer')return {createTransport:forbidden};
  if(id==='./sendMessage')return {COMPANY_NAME:'QA',WEBSITE_DOMAIN:'qa.invalid',isProduction:true};
  // Imported helpers must never be used during a no-op.
  return new Proxy({}, {get(){return forbidden;}});
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils',file),'utf8'),{require:req,module:mod,exports:mod.exports,process,console,Buffer});return mod.exports;
}
test('all public SMS/email/push entry points stop before provider, DB, templates, or attachment IO', async () => {
 setQa();process.env.IS_PRODUCTION='true';process.env.FORCE_SEND_SMS_ALL='true';process.env.FORCE_SEND_EMAIL_ALL='true';
 const sms=loadUtility('sendMessage.js');const mail=loadUtility('smooveEmailCampaignService.js');const push=loadUtility('sendAndStoreNotification.js');
 const results=await Promise.all([
 sms.sendMessage('synthetic message','+972509999999',{fast:true}),
 mail.sendEmailCampaign({toEmail:'qa@example.invalid',campaignKey:'DOC_SIGNED',attachments:[{filename:'qa.pdf'}]}),
 mail.sendTransactionalCustomHtmlEmail({toEmail:'qa@example.invalid',subject:'QA',htmlBody:'QA'}),
 mail.sendEmailWithAttachments({toEmail:'qa@example.invalid',attachments:[{filename:'qa.pdf'}]}),
 push(999999,'QA','QA',{}, {sendPush:true}),
 push(999999,'QA','QA',{}, {sendPush:false})
 ]);for(const result of results)assert.equal(result.mode,'qa-noop');
});
test('QA email opt-in requires every addressed recipient and reaches normal transport only for allowed recipients', async () => {
 setQa();process.env.QA_OUTBOUND_ALLOW='allowed@example.invalid,second@example.invalid';
 assert.equal(qaOutboundNoop('email','ALLOWED@example.invalid'),null);
 assert.equal(qaOutboundNoop('email',['allowed@example.invalid','second@example.invalid']),null);
 for(const recipients of [[],['allowed@example.invalid',undefined],['allowed@example.invalid','other@example.invalid']]) {
  assert.equal(qaOutboundNoop('email',recipients).suppressed,true);
 }
 const mail=loadUtility('smooveEmailCampaignService.js');
 const blocked=await mail.sendEmailWithAttachments({toEmail:'allowed@example.invalid',ccEmails:['other@example.invalid']});
 assert.equal(blocked.suppressed,true);
 await assert.rejects(mail.sendTransactionalCustomHtmlEmail({toEmail:'allowed@example.invalid',subject:'QA',htmlBody:'QA'}),/Provider or DB IO attempted/);
 await assert.rejects(mail.sendEmailWithAttachments({toEmail:'allowed@example.invalid',ccEmails:['second@example.invalid']}),/Provider or DB IO attempted/);
 await assert.rejects(mail.sendEmailCampaign({toEmail:'allowed@example.invalid',campaignKey:'SIGN_INVITE'}),/Provider or DB IO attempted/);
 delete process.env.QA_OUTBOUND_ALLOW;
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=require.resolve('../lib/calendarReminderDispatch'),req=createRequire(file);
function fixture({smsError=false,emailOk=true,pushError=false}={}){const calls=[];const module={exports:{}};const stub=id=>{
 if(id==='../config/db')return{query:async()=>({rows:[{userid:1,name:'Synthetic',email:'recipient@example.invalid',phonenumber:'0500000021'}]})};
 if(id==='../utils/sendAndStoreNotification')return async(...p)=>{calls.push(['inbox',...p]);if(pushError&&p[4]?.throwOnError)throw Error('synthetic_push_failure')};
 if(id==='../utils/sendMessage')return{sendMessage:async()=>{calls.push(['sms']);if(smsError)throw Error('synthetic_sms_failure');return{ok:true}}};
 if(id==='../utils/smooveEmailCampaignService')return{sendTransactionalCustomHtmlEmail:async()=>{calls.push(['email']);return{ok:emailOk,errorCode:'synthetic_email_failure'}}};
 return req(id);
};vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:stub,module,console:{error(){}}});return{api:module.exports,calls};}
test('inbox history does not disguise all external channels failing',async()=>{
 const f=fixture({smsError:true,emailOk:false});const r=await f.api.dispatchCalendarReminder({userId:1,title:'Synthetic',body:'Body',eventChannels:{sms:true,email:true,push:false}});assert.equal(r.sent,false);assert.equal(r.reason,'all_channels_failed');assert.equal(f.calls.filter(x=>x[0]==='inbox').length,1);
});
test('partial channels report actual accepted channels and incomplete result',async()=>{
 const f=fixture({emailOk:false});const r=await f.api.dispatchCalendarReminder({userId:1,title:'Synthetic',body:'Body',eventChannels:{sms:true,email:true,push:false}});assert.equal(r.sent,true);assert.equal(r.complete,false);assert.deepEqual(JSON.parse(JSON.stringify(r.deliveredChannels)),['sms']);assert.equal(r.channels.email,false);
});
test('strict push rejection is observable and no missing-contact channel pretends to deliver',async()=>{
 const f=fixture({pushError:true});assert.equal((await f.api.dispatchCalendarReminder({userId:1,eventChannels:{push:true},title:'Synthetic',body:'Body'})).sent,false);
 const r=await f.api.dispatchCalendarReminder({eventChannels:{email:true},title:'Synthetic',body:'Body'});assert.equal(r.sent,false);assert.equal(r.reason,'no_channels_or_contact');
});

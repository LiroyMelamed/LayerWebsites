const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const file=require.resolve('../lib/calendarEventReminders');
const source=fs.readFileSync(file,'utf8');
const mod={exports:{}};const req=createRequire(file);
vm.runInNewContext(source,{module:mod,require:n=>n.includes('config/db')?{}:n.includes('settingsService')?{}:req(n),console,process});
const {parseStoredChannels,normalizeReminderChannels,channelsToJson}=mod.exports;
test('new audience choices survive storage and allowlist filtering; legacy events keep their exact channels',()=>{
 const stored=JSON.parse(channelsToJson({lawyer:{email:true},client:{sms:true}}));
 assert.equal(stored.email,true);assert.equal(stored.sms,true);
 assert.deepEqual(stored.lawyer,{push:false,sms:false,email:true});
 assert.deepEqual(stored.client,{push:false,sms:true,email:false});
 assert.equal(normalizeReminderChannels(stored,['email']).client.sms,false);
 assert.deepEqual(JSON.parse(channelsToJson({sms:true,push:false,email:false})),{push:false,sms:true,email:false});
 assert.equal(parseStoredChannels(JSON.stringify(stored)).lawyer.email,true);
});
test('scheduler selects only the current audience channels, including an explicit empty selection',async()=>{
 const file=require.resolve('../tasks/calendarReminders/scheduler');const s=fs.readFileSync(file,'utf8');
 const start=s.indexOf('async function _dispatchRecipient('),end=s.indexOf('async function _resolveLawyerRecipients',start);
 const sent=[];const current={event_status:'scheduled',reminders_sent_offsets:[],start_time:'2026-11-04T10:00:00Z'};
 const dispatch=vm.runInNewContext(s.slice(start,end)+';_dispatchRecipient',{
  parseStoredChannels,require:req,console,isEventCancelled:()=>false,_parseSentKeys:x=>new Set(x),
  pool:{query:async()=>({rows:[current]})},dispatchCalendarReminder:async p=>{sent.push(p.eventChannels);return{sent:true};},
 });
 const ev={id:1,role:'lawyer',start_time:current.start_time,sent_key:'lawyer:30',reminder_channels:{lawyer:{email:true},client:{sms:true}}};
 await dispatch(ev,{userId:1},{title:'Test',body:'Test'},{});assert.equal(sent.length,1);assert.equal(sent[0].email,true);assert.equal(sent[0].sms,false);
 sent.length=0;await dispatch({...ev,role:'client'}, {userId:2},{title:'Test',body:'Test'},{});assert.equal(sent[0].sms,true);assert.equal(sent[0].email,false);
 sent.length=0;await dispatch({...ev,reminder_channels:{lawyer:{},client:{sms:true}}},{userId:1},{title:'Test',body:'Test'},{});assert.equal(sent.length,0);
});

test('cleared available choices do not re-enable reminder channels or timings', async()=>{
 for(const raw of ['', [], '[]', {}, '{"email":false,"sms":false,"push":false}']) {
  const allowed=await mod.exports.loadAllowedReminderChannels({getSetting:async()=>raw});
  assert.deepEqual(Array.from(allowed),[]);
  assert.equal(mod.exports.hasAnyReminderChannel(normalizeReminderChannels({sms:true,email:true,push:true},allowed)),false);
 }
 assert.deepEqual(Array.from(await mod.exports.loadAllowedReminderChannels({getSetting:async()=> '["sms","email"]'})),['sms','email']);
 assert.deepEqual(Array.from(await mod.exports.loadAllowedReminderChannels({getSetting:async(_c,_k,fallback)=>fallback})),['push','sms','email']);
 assert.deepEqual(Array.from(await mod.exports.loadAllowedReminderOffsets({getSetting:async()=>''})),[]);
});

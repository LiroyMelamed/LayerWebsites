const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const filename=require.resolve('../tasks/calendarReminders/scheduler'),req=createRequire(filename),pool=require('../config/db');
const owned=[];test.afterEach(async()=>{for(const id of owned)await pool.query('DELETE FROM calendar_events WHERE id=$1',[id]);owned.length=0;});test.after(async()=>{await pool.end();});
function fixture(dispatch){
 const module={exports:{}};
 const stub=name=>{
  if(name==='node-cron')return{schedule:()=>({})};
  if(name==='../../services/settingsService')return{getSetting:async(_c,k)=>k==='CALENDAR_REMINDERS_ENABLED'?'true':60};
  if(name==='../../lib/shabbatDeferral')return{effectiveFireAt:d=>d,describeQuietDeferral:()=>null,warmShabbatCache:async()=>{}};
  if(name==='../../lib/calendarReminderDispatch')return{dispatchCalendarReminder:dispatch};
  return req(name);
 };
 vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports.revert=_revertSentKey;', {require:stub,module,process:{env:{}},Date,console:{log(){},error(){}}});return module.exports;
}
async function event(overrides={}){
 const {rows}=await pool.query(`INSERT INTO calendar_events(owner_id,title,start_time,end_time,event_type,lawyer_reminder_offsets,client_reminder_offsets,reminder_channels,reminder_targets) VALUES(1017,'Synthetic reminder release',$1,$2,'appointment','[0]'::jsonb,'[0]'::jsonb,'{"sms":true,"email":true,"push":false}', '{"managers":true,"client":true}') RETURNING *`,[new Date(Date.now()+3600000),new Date(Date.now()+7200000)]);
 const ev=rows[0];owned.push(ev.id);await pool.query('INSERT INTO calendar_event_managers(event_id,user_id) VALUES($1,1088),($1,1092)',[ev.id]);
 for(const id of [1088,1092])await pool.query('INSERT INTO calendar_event_clients(event_id,user_id) VALUES($1,$2)',[ev.id,id]);
 if(Object.keys(overrides).length){const entries=Object.entries(overrides);await pool.query(`UPDATE calendar_events SET ${entries.map(([k],i)=>k+'=$'+(i+2)).join(',')} WHERE id=$1`,[ev.id,...entries.map(([,v])=>v)]);}
 return ev.id;
}
async function sent(id){return (await pool.query('SELECT reminders_sent_offsets FROM calendar_events WHERE id=$1',[id])).rows[0].reminders_sent_offsets;}
test('partial recipient/channel failures retain successes and retry only failures',async()=>{
 const id=await event(),calls=[];let fail=true;
 const api=fixture(async p=>{const c=Object.keys(p.eventChannels).find(k=>p.eventChannels[k]);calls.push([p.recipientRole,p.userId,c]);return{sent:!(fail&&p.userId===1092&&c==='email')};});
 const first=await api.fireImmediateRemindersForEvent(id);assert.equal(first.attempted,2);assert.equal(first.sent,0);assert.equal(calls.length,8);assert.equal((await sent(id)).filter(x=>x.startsWith('receipt:')).length,6);assert.ok(!(await sent(id)).includes('lawyer:0'));
 fail=false;const second=await api.fireImmediateRemindersForEvent(id);assert.equal(second.sent,2);assert.equal(calls.length,10);assert.deepEqual(calls.slice(8),[['lawyer',1092,'email'],['client',1092,'email']]);
 assert.equal((await api.fireImmediateRemindersForEvent(id)).attempted,0);assert.equal(calls.length,10);
});
test('claim rollback cannot erase another audience receipt or successful role',async()=>{
 const id=await event({reminders_sent_offsets:JSON.stringify(['lawyer:30','client:30','receipt:lawyer:30:user1088:sms'])});await fixture(async()=>({sent:true})).revert(id,'client:30',['old']);assert.deepEqual(await sent(id),['lawyer:30','receipt:lawyer:30:user1088:sms']);
});
test('concurrent immediate workers claim each role once and successful deliveries dedupe',async()=>{
 const id=await event(),calls=[];const api=fixture(async p=>{calls.push(p);await new Promise(r=>setTimeout(r,8));return{sent:true};});await Promise.all([api.fireImmediateRemindersForEvent(id),api.fireImmediateRemindersForEvent(id)]);assert.equal(calls.length,8);assert.equal(new Set(calls.map(p=>p.recipientRole+':'+p.userId+':'+Object.keys(p.eventChannels).find(k=>p.eventChannels[k]))).size,8);
});
test('hourly poll catches due40minutes-old jobs rather than losing them in five-minute grace',async()=>{
 const id=await event({start_time:new Date(Date.now()+20*60000),end_time:new Date(Date.now()+80*60000),lawyer_reminder_offsets:'[60]',client_reminder_offsets:'[]',reminder_targets:'{"managers":true,"client":false}'}),calls=[];const api=fixture(async p=>{calls.push(p);return{sent:true};});await api.processCalendarReminders();assert.equal(calls.length,4);assert.ok((await sent(id)).includes('lawyer:60'));await api.processCalendarReminders();assert.equal(calls.length,4);
});
test('lead JSON-only audience receives selected channels with repeated exact contacts deduped',async()=>{
 const id=await event({lawyer_reminder_offsets:'[]',lead_participants:JSON.stringify([{name:'Synthetic lead',email:'lead@example.invalid',phone:'0500000022'},{name:'Synthetic lead duplicate',email:'lead@example.invalid',phone:'0500000022'}])});await pool.query('DELETE FROM calendar_event_clients WHERE event_id=$1',[id]);const calls=[],api=fixture(async p=>{calls.push(p);return{sent:true};});const result=await api.fireImmediateRemindersForEvent(id);assert.equal(result.sent,1);assert.equal(calls.length,2);assert.ok(calls.every(p=>p.email==='lead@example.invalid'));
});
test('legacy numeric completion suppresses both audience sends',async()=>{
 const id=await event({reminders_sent_offsets:'[0]'}),calls=[];assert.equal((await fixture(async p=>{calls.push(p);return{sent:true};}).fireImmediateRemindersForEvent(id)).attempted,0);assert.equal(calls.length,0);
});
test('immediate zero-offset reminders are due at creation, not a future meeting start',async()=>{
 const id=await event({start_time:new Date(Date.now()+30*86400000),end_time:new Date(Date.now()+30*86400000+3600000)}),calls=[],api=fixture(async p=>{calls.push(p);return{sent:true};});await api.processCalendarReminders();assert.equal(calls.length,8);assert.ok((await sent(id)).includes('lawyer:0'));assert.ok((await sent(id)).includes('client:0'));
});
test('quiet immediate reminders persist individual deferred deadlines without sending',async()=>{
 const id=await event();const module={exports:{}},until=new Date(Date.now()+3600000),calls=[];
 const stub=name=>{if(name==='../../services/settingsService')return{getSetting:async(_c,k)=>k==='CALENDAR_REMINDERS_ENABLED'?'true':5};if(name==='../../lib/shabbatDeferral')return{effectiveFireAt:()=>until,describeQuietDeferral:()=>({reason:'night',until})};if(name==='../../lib/calendarReminderDispatch')return{dispatchCalendarReminder:async p=>{calls.push(p);return{sent:true}}};return req(name)};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:stub,module,process:{env:{}},Date,console:{log(){},error(){}}});const result=await module.exports.fireImmediateRemindersForEvent(id);assert.equal(result.deferred,true);assert.equal(calls.length,0);const row=(await pool.query('SELECT reminder_deferred_until FROM calendar_events WHERE id=$1',[id])).rows[0];assert.equal(row.reminder_deferred_until['lawyer:0'],until.toISOString());assert.equal(row.reminder_deferred_until['client:0'],until.toISOString());
});

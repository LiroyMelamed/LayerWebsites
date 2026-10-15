const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');const {createRequire}=require('node:module');
const filename=require.resolve('../tasks/calendarReminders/scheduler');
const localRequire=createRequire(filename);
function fixture(){
 let enabled='false',minutes=5,now=1000000,callback,queries=0;
 const module={exports:{}};
 const requireStub=name=>{
  if(name==='node-cron')return{schedule:(expression,fn)=>{assert.equal(expression,'* * * * *');callback=fn;return{};}};
  if(name==='../../config/db')return{query:async()=>{queries++;return{rows:[]};}};
  if(name==='../../services/settingsService')return{getSetting:async(_c,k)=>k==='CALENDAR_REMINDERS_ENABLED'?enabled:minutes};
  if(name==='../../lib/shabbatDeferral')return{effectiveFireAt:d=>d,warmShabbatCache:async()=>{}};
  return localRequire(name);
 };
 class Clock extends Date{static now(){return now;}}
 vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports.offsetsForRole=_offsetsForRole;', {require:requireStub,module,process:{env:{}},Date:Clock,console:{log(){},error(){}}});
 return{api:module.exports,get queries(){return queries;},setEnabled(v){enabled=v;},setMinutes(v){minutes=v;},advance(v){now+=v;},async tick(){callback();for(let i=0;i<25;i++)await Promise.resolve();}};
}
test('disabled scheduler stays subscribed, activates without restart, then stops when disabled',async()=>{
 const f=fixture();const started=await f.api.initCalendarReminderScheduler();assert.equal(started.taskStarted,true);assert.equal(f.queries,0);
 await f.api.processCalendarReminders();await f.api.fireImmediateRemindersForEvent(1);assert.equal(f.queries,0);
 f.setEnabled('true');await f.tick();const after=f.queries;assert.ok(after>0);
 f.advance(60000);await f.tick();assert.equal(f.queries,after);
 f.setMinutes(1);await f.tick();assert.ok(f.queries>after);
 f.setEnabled('false');const before=f.queries;f.advance(600000);await f.tick();await f.api.fireImmediateRemindersForEvent(1);assert.equal(f.queries,before);
 f.setEnabled('true');await f.tick();assert.ok(f.queries>before);
});
test('explicitly empty audience offsets cannot inherit another audience reminders',()=>{
 const f=fixture();const row={lawyer_reminder_offsets:[],client_reminder_offsets:[30],reminder_offsets:[30]};
 assert.equal(f.api.offsetsForRole(row,'lawyer').length,0);
 assert.deepEqual(f.api.offsetsForRole(row,'client'),[30]);
 assert.deepEqual(f.api.offsetsForRole({reminder_offsets:[60]},'lawyer'),[60]);
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
function load(path,mocks){const file=require.resolve(path),original=createRequire(file),module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:id=>Object.hasOwn(mocks,id)?mocks[id]:original(id),console,Date,process:{env:{}}});return module.exports;}
test('PG calendar delivery owner: no timings sends nothing, selected timing sends once, legacy queue remains independent', {skip:process.env.CALENDAR_OWNER_PG_TEST!=='1'},async()=>{
 require('dotenv').config();const {Client,Pool}=require('pg');const config={host:process.env.DB_HOST||'localhost',database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
 const admin=new Client(config),schema=`calendar_owner_test_${process.pid}`;await admin.connect();let pool;
 try{
  await admin.query(`CREATE SCHEMA ${schema}; SET search_path=${schema};
   CREATE TABLE users(userid int primary key,name text,email text,phonenumber text);
   INSERT INTO users VALUES(1,'Synthetic','synthetic@example.invalid','0500000000');
   CREATE TABLE calendar_events(LIKE public.calendar_events INCLUDING DEFAULTS);
   CREATE SEQUENCE event_ids; ALTER TABLE calendar_events ALTER COLUMN id SET DEFAULT nextval('event_ids');
   CREATE TABLE scheduled_email_reminders(LIKE public.scheduled_email_reminders INCLUDING DEFAULTS);
   CREATE SEQUENCE reminder_ids; ALTER TABLE scheduled_email_reminders ALTER COLUMN id SET DEFAULT nextval('reminder_ids');
   CREATE TABLE calendar_event_clients(event_id int,user_id int,sort_order int);
   CREATE TABLE calendar_event_managers(event_id int,user_id int);`);
  await admin.query(fs.readFileSync(require.resolve('../migrations/2026-11-04_04_calendar_reminder_delivery_owner.sql'),'utf8'));
  pool=new Pool({...config,options:`-c search_path=${schema}`});
  const sync=load('../lib/reminderCalendarSync',{'../config/db':pool});
  const ids=[];
  for(let i=0;i<3;i++){
   const {rows:[event]}=await pool.query(`INSERT INTO calendar_events(owner_id,title,event_type,start_time,end_time,lead_name,lead_email,lawyer_reminder_offsets,client_reminder_offsets,reminder_offsets,reminder_channels,reminder_targets) VALUES(1,'Synthetic weekly','reminder',date_trunc('milliseconds',NOW())-INTERVAL '1 minute',date_trunc('milliseconds',NOW())+INTERVAL '14 minutes','Synthetic','synthetic@example.invalid','[]','[]','[]','{"email":true,"sms":true}','{"managers":false,"client":true}') RETURNING *`);
   ids.push(event.id);await sync.createReminderForCalendarEvent(event,{templateData:{body:`Occurrence ${i}`}}, {client:pool});
  }
  assert.equal((await pool.query('SELECT count(*)::int n FROM scheduled_email_reminders WHERE calendar_managed')).rows[0].n,3);
  const external=[];
  const emailWorker=load('../tasks/emailReminders/service',{
   '../../config/db':pool,'../../utils/smooveEmailCampaignService':{sendTransactionalCustomHtmlEmail:async p=>{external.push(p);return{ok:true}}},
   '../../services/settingsService':{getSetting:async()=>''},'../../lib/firmBranding':{getLawFirmNameHe:async()=>'Synthetic',getFirmNameEn:async()=>''},
   '../../controllers/templateAttachmentController':{getAttachmentBuffers:async()=>[]},
  });
  assert.equal((await emailWorker.processEmailReminders()).sent,0);assert.equal(external.length,0);
  const calls=[];
  const helpers={parseStoredOffsets:v=>typeof v==='string'?JSON.parse(v):v||[],parseStoredChannels:v=>typeof v==='string'?JSON.parse(v):v||{},parseReminderTargets:v=>typeof v==='string'?JSON.parse(v):v||{},composeClientReminderMessage:async()=>({title:'Test',body:'Test'}),composeLawyerReminderMessage:async()=>({title:'Test',body:'Test'})};
  const scheduler=load('../tasks/calendarReminders/scheduler',{
   '../../config/db':pool,'../../services/settingsService':{getSetting:async(_c,k)=>k==='CALENDAR_REMINDERS_ENABLED'?'true':5},
   '../../lib/calendarEventReminders':helpers,'../../lib/shabbatDeferral':{effectiveFireAt:d=>d,describeQuietDeferral:()=>null},
   '../../lib/calendarReminderDispatch':{dispatchCalendarReminder:async p=>{calls.push(p);return{sent:true}}},
   '../../utils/appDeepLinks':{getAppScheme:()=>'synthetic'},
  });
  for(const id of ids)assert.equal((await scheduler.fireImmediateRemindersForEvent(id)).attempted,0);
  assert.equal(calls.length,0);
  await pool.query("UPDATE calendar_events SET client_reminder_offsets='[0]' WHERE id=$1",[ids[0]]);
  const delivery=await scheduler.fireImmediateRemindersForEvent(ids[0]);assert.equal(delivery.sent,1,JSON.stringify(delivery));assert.equal(calls.length,2);
  assert.ok(calls.every(p=>p.emailEvent.calendar_managed_reminder));assert.equal(calls[0].emailEvent.reminder_template_data.body,'Occurrence 0');
  assert.equal((await scheduler.fireImmediateRemindersForEvent(ids[0])).attempted,0);assert.equal(calls.length,2);
  await emailWorker.processEmailReminders();assert.equal(external.length,0);
  await pool.query(`INSERT INTO scheduled_email_reminders(client_name,to_email,subject,template_key,template_data,scheduled_for,status) VALUES('Independent','independent@example.invalid','Independent','GENERAL','{"body":"Body"}',NOW()-INTERVAL '1 minute','PENDING')`);
  assert.equal((await emailWorker.processEmailReminders()).sent,1);assert.equal(external.length,1);assert.equal(external[0].toEmail,'independent@example.invalid');
  assert.equal((await emailWorker.processEmailReminders()).sent,0);
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});

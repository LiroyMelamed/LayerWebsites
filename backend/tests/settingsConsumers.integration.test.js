const test=require('node:test'),assert=require('node:assert/strict');
const pool=require('../config/db'),settings=require('../services/settingsService');
const branding=require('../lib/firmBranding');const reminders=require('../lib/calendarEventReminders');
const {loadWorkingSchedule}=require('../lib/calendarWorkingHours');
const express=require('express'),request=require('supertest');const app=express();app.get('/public',require('../controllers/platformSettingsController').getPublicSettings);
test('saved settings reach branding, reminder choices, hours and public contact consumers',async t=>{
 assert.equal(process.env.DB_NAME,'codex_readiness_20261005');const originals=new Map();
 const save=async(category,key,value)=>{const id=category+':'+key;if(!originals.has(id))originals.set(id,(await pool.query('SELECT * FROM platform_settings WHERE category=$1 AND setting_key=$2',[category,key])).rows[0]||null);await settings.bulkUpsert([{category,key,value}]);};
 t.after(async()=>{for(const [id,row] of originals){const [c,k]=id.split(':');if(row)await settings.upsertSetting(c,k,row.setting_value,{valueType:row.value_type});else await pool.query('DELETE FROM platform_settings WHERE category=$1 AND setting_key=$2',[c,k]);}settings.invalidateCache();await pool.end();});
 await t.test('firm and email identity update without process restart',async()=>{
  await save('firm','LAW_FIRM_NAME','משרד בדיקה');await save('firm','COMPANY_NAME','SyntheticQA');await save('messaging','SMTP_FROM_NAME','QA Sender');await save('messaging','SMTP_FROM_EMAIL','qa@example.invalid');
  assert.equal(await branding.getLawFirmNameHe(),'משרד בדיקה');assert.equal(await branding.getFirmNameEn(),'SyntheticQA');assert.equal(await branding.getEmailFromName(),'QA Sender');assert.equal(await branding.getEmailFromEmail(),'qa@example.invalid');
  await save('messaging','SMTP_FROM_NAME','Updated Sender');assert.equal(await branding.getEmailFromName(),'Updated Sender');
 });
 await t.test('calendar allowed offsets and channels change the normalized event payload',async()=>{
  await save('calendar','CALENDAR_REMINDER_OPTIONS','15,60');await save('calendar','CALENDAR_REMINDER_CHANNELS','email');
  const offsets=await reminders.loadAllowedReminderOffsets();assert.deepEqual(reminders.normalizeReminderOffsets([15,30,60,1440],offsets),[60,15]);
  const channels=await reminders.loadAllowedReminderChannels();assert.deepEqual(reminders.normalizeReminderChannels({push:true,sms:true,email:true},channels),{push:false,sms:false,email:true});
 });
 await t.test('legacy working hours and per-day schedule reach the calendar consumer',async()=>{
  await save('calendar','WORKING_HOURS_BY_DAY',null);await save('calendar','WORKING_DAYS','0,2');await save('calendar','WORKING_HOURS_START','09:00');await save('calendar','WORKING_HOURS_END','16:00');
  const schedule=await loadWorkingSchedule(settings);assert.equal(schedule[0].open,true);assert.equal(schedule[1].open,false);assert.equal(schedule[2].start,'09:00');assert.equal(schedule[2].end,'16:00');
  await save('calendar','WORKING_HOURS_BY_DAY',JSON.stringify({0:{open:true,start:'10:00',end:'14:00'}}));assert.equal((await loadWorkingSchedule(settings))[0].start,'10:00');
 });
 await t.test('public phone and logo settings expose updated values without private settings',async()=>{
  for(const [category,key,value] of [['contact','OFFICE_PHONE','qa-office'],['contact','SMS_PHONE','qa-sms'],['contact','WHATSAPP_PHONE','qa-whatsapp'],['messaging','WHATSAPP_DEFAULT_PHONE','qa-default'],['firm','FIRM_LOGO_URL','https://example.invalid/qa.svg']])await save(category,key,value);
  const res=await request(app).get('/public');assert.equal(res.status,200);assert.equal(res.body.OFFICE_PHONE,'qa-office');assert.equal(res.body.SMS_PHONE,'qa-sms');assert.equal(res.body.WHATSAPP_PHONE,'qa-whatsapp');assert.equal(res.body.WHATSAPP_DEFAULT_PHONE,'qa-default');assert.equal(res.body.FIRM_LOGO_URL,'https://example.invalid/qa.svg');assert.equal(res.body.SMTP_FROM_EMAIL,undefined);
 });
});

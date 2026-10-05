const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const ids = require('./helpers/identityFixture').useTestIdentities();
const pool = require('../config/db');
const reminders = require('../controllers/reminderController');
// Notification providers are stubbed, while HTTP handlers and PostgreSQL are real.
require('../utils/sendMessage').sendMessage = async()=>({ok:true});
require('../utils/smooveEmailCampaignService').sendTransactionalCustomHtmlEmail=async()=>({ok:true});
const app=require('../app');
const asAdmin = () => 'Bearer '+jwt.sign({userid:ids.admin,role:'Admin'},process.env.JWT_SECRET);
const own=[];


test('real calendar meeting/hearing reminders appear, track edits and cancellation, and disappear on delete', async t=>{
 t.after(async()=>{ for(const id of own) await pool.query('DELETE FROM calendar_events WHERE id=$1',[id]); });
 const created=[];
 for(const type of ['appointment','hearing']){
  const response=await request(app).post('/api/calendar').set('Authorization',asAdmin()).send({
   title:'Synthetic reminders QA '+type,event_type:type,start_time:'2026-11-02T10:00:00Z',end_time:'2026-11-02T11:00:00Z',
   client_user_ids:[ids.client,ids.outsider],manager_user_ids:[ids.admin],
   lawyer_reminder_offsets:[], client_reminder_offsets:[30,1440], reminder_targets:{client:true,managers:true},
   reminder_channels:{sms:true,email:true,push:false},
  });
  assert.equal(response.status,201,JSON.stringify(response.body));own.push(response.body.event.id);created.push(response.body.event.id);
 }
 const list=async(status)=>{
  const res=await request(app).get('/api/reminders').query({limit:100,...(status?{status}:{})}).set('Authorization',asAdmin());
  assert.equal(res.status,200,JSON.stringify(res.body));return res.body;
 };
 let all=await list('PENDING');
 let rows=all.reminders.filter(r=>created.includes(r.calendar_event_id));
 assert.equal(rows.length,4);
 assert.ok(rows.every(r=>r.source==='calendar'&&r.audience==='client'&&r.managed_in_calendar));
 assert.ok(rows.every(r=>r.client_name.includes('client')&&r.client_name.includes('outsider')));
 assert.equal(rows.find(r=>r.id.endsWith('-30')).scheduled_for,'2026-11-02T09:30:00.000Z');
 const row=rows[0];
 assert.equal((await request(app).get('/api/reminders/'+row.id).set('Authorization',asAdmin())).status,200);
 for(const [method,suffix] of [['put','/cancel'],['put',''],['delete','']]) {
  const res=await request(app)[method]('/api/reminders/'+row.id+suffix).set('Authorization',asAdmin()).send({scheduled_for:'2026-11-02T09:00:00Z'});
  assert.equal(res.status,409);
 }
 // Read permissions for reminders must not leak calendar rows to a role without calendar access.
 const restricted=express();restricted.use((req,res,next)=>{req.firmPermissionMode='role';req.firmPermissions={areas:{reminders:{visible:true,actions:['view']}}};next();});
 restricted.get('/',reminders.listReminders);restricted.get('/:id',reminders.getReminderById);
 const hidden=await request(restricted).get('/');assert.equal(hidden.status,200);assert.equal(hidden.body.reminders.some(r=>r.source==='calendar'),false);
 assert.equal((await request(restricted).get('/'+row.id)).status,403);
 const changed=await request(app).put('/api/calendar/'+created[0]).set('Authorization',asAdmin()).send({start_time:'2026-11-02T12:00:00Z',end_time:'2026-11-02T13:00:00Z'});
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 rows=(await list('PENDING')).reminders.filter(r=>r.calendar_event_id===created[0]);
 assert.equal(rows.find(r=>r.id.endsWith('-30')).scheduled_for,'2026-11-02T11:30:00.000Z');
 // Use the scheduler's legacy and role-specific completion format.
 await pool.query("UPDATE calendar_events SET reminders_sent_offsets='[\"client:30\"]' WHERE id=$1",[created[0]]);
 assert.equal((await list('SENT')).reminders.filter(r=>r.calendar_event_id===created[0]).length,1);
 const cancelled=await request(app).post('/api/calendar/'+created[0]+'/cancel').set('Authorization',asAdmin()).send({});
 assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));
 assert.equal((await list('CANCELLED')).reminders.filter(r=>r.calendar_event_id===created[0]).length,1);
 for(const id of created) assert.equal((await request(app).delete('/api/calendar/'+id).set('Authorization',asAdmin())).status,200);
 assert.equal((await list()).reminders.some(r=>created.includes(r.calendar_event_id)),false);
});

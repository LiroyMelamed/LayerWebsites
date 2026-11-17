'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const service=require('../services/caseDocumentRequests');
const settings=require('../services/settingsService');
const {transaction}=require('../services/signingV2/transaction');
const socket='/tmp/codex-word-service-55489-socket';
test('document collection lifecycle on socket-only synthetic database',{skip:process.env.WORD_SERVICE_TEST_SOCKET!==socket},async t=>{
 const db=new Pool({host:socket,port:55489,user:'word_service_test_owner',database:'document_workflow_test',max:8});t.after(()=>db.end());
 assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,'document_workflow_test');
 await db.query(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;
 CREATE TABLE users(userid integer PRIMARY KEY,name text,role text,email text,phonenumber text,law_firm_tenant_id uuid,firm_staff_role_id integer);
 CREATE TABLE cases(caseid integer PRIMARY KEY,casename text,currentstage integer,isclosed boolean DEFAULT false,casetypeid integer,casemanagerid integer,law_firm_tenant_id uuid);
 CREATE TABLE case_users(caseid integer,userid integer,PRIMARY KEY(caseid,userid));
 CREATE TABLE casedescriptions(descriptionid integer PRIMARY KEY,caseid integer,stage integer,text text);
 CREATE TABLE casetypedescriptions(casetypedescriptionid integer PRIMARY KEY,casetypeid integer,stage integer,text text);
 CREATE TABLE stage_files(id integer PRIMARY KEY,caseid integer,stage integer);
 CREATE TABLE platform_settings(category text,setting_key text,setting_value text,value_type text,label text,description text,PRIMARY KEY(category,setting_key));
 CREATE TABLE notification_channel_config(notification_type text PRIMARY KEY,label text,push_enabled boolean,email_enabled boolean,sms_enabled boolean,admin_cc boolean,manager_cc boolean);
 CREATE TABLE email_templates(template_key text PRIMARY KEY,label text,subject_template text,available_vars jsonb,html_body text);
 CREATE TABLE firm_staff_roles(id integer PRIMARY KEY,is_active boolean,permissions jsonb,law_firm_tenant_id uuid);
 INSERT INTO users VALUES(1,'Lawyer','Admin',NULL,NULL,NULL,NULL),(2,'Client A','User','a@example.invalid','0001',NULL,NULL),(3,'Client B','Client','b@example.invalid','0002',NULL,NULL);
 INSERT INTO cases VALUES(10,'Synthetic case',1,false,1,1,NULL),(20,'Other case',1,false,2,1,NULL);
 INSERT INTO case_users VALUES(10,2),(10,3);
 INSERT INTO casedescriptions VALUES(101,10,1,'Stage one'),(102,10,2,'Stage two'),(201,20,1,'Other stage');
 INSERT INTO casetypedescriptions VALUES(1,1,1,'Stage one'),(2,1,2,'Stage two');
 INSERT INTO stage_files VALUES(1,10,1),(2,20,1);`);
 const migration=fs.readFileSync(path.join(__dirname,'../migrations/2026-11-17_01_case_document_requests.sql'),'utf8');
 await db.query(migration);await db.query(migration);
 const values={DOCUMENT_REQUEST_AUTO_ENABLED:'true',DOCUMENT_REQUEST_FIRST_HOURS:'24',DOCUMENT_REQUEST_REPEAT_HOURS:'48',DOCUMENT_REQUEST_CHANNELS:'email,sms,push',DOCUMENT_REQUEST_DEFAULT_CHANNELS:'email,sms'};
 t.mock.method(settings,'getSetting',async(category,key,fallback)=>values[key]??fallback);
 let row;
 await t.test('create one shared list, optimistic updates, and file ownership',async()=>{
  row=await service.save(db,1,10,{descriptionId:101,items:[{title:'ID card',status:'missing'},{title:'Contract',status:'missing'}]});
  assert.equal((await service.list(db,10)).requests.length,1);
  await assert.rejects(service.save(db,1,10,{descriptionId:101,version:0,items:row.items}),e=>e.errorCode==='DOCUMENT_REQUEST_CHANGED');
  await assert.rejects(service.save(db,1,10,{descriptionId:101,version:row.version,items:[{...row.items[0],fileId:2}]}),e=>e.errorCode==='INVALID_DOCUMENT_FILE');
  const view=await service.list(db,10,{client:true});assert.equal(view.requests[0].items[0].status,'missing');assert.equal(view.requests[0].history,undefined);assert.equal(view.policy,undefined);
 });
 let calls=[];const notify=async payload=>{calls.push(payload);const channel=payload.email?'email':payload.sms?'sms':'push';return{outcomes:{[channel]:{attempted:true,ok:true}}};};
 await t.test('concurrent manual requests and workers send once per recipient/channel',async()=>{
  const outcomes=await Promise.allSettled([1,2].map(()=>service.action(db,1,10,row.id,{version:row.version,action:'send',channels:['email','sms']})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  await Promise.all([service.processDue(db,{now:new Date(Date.now()+1000),notify}),service.processDue(db,{now:new Date(Date.now()+1000),notify})]);
  assert.equal(calls.length,4);assert.equal(new Set(calls.map(call=>`${call.recipientUserId}:${!!call.email}`)).size,4);
  row=(await service.list(db,10)).requests[0];assert.equal(row.state,'active');assert.ok(row.next_due);assert.equal(row.deliveries.filter(job=>job.status==='SENT').length,4);
  const hours=(new Date(row.next_due)-new Date(row.first_sent_at))/3600000;assert.ok(Math.abs(hours-24)<0.1);
 });
 await t.test('reminder recalculates missing documents and repeats without stage change',async()=>{
  row=await service.save(db,1,10,{descriptionId:101,version:row.version,items:row.items.map((item,index)=>index?item:{...item,status:'received',fileId:1})});
  await db.query("UPDATE case_document_requests SET next_due=now()-interval '1 minute' WHERE id=$1",[row.id]);
  calls=[];await service.processDue(db,{now:new Date(Date.now()+1000),notify});assert.equal(calls.length,4);
  assert.ok(calls.every(call=>!JSON.stringify(call).includes('ID card')));
  row=(await service.list(db,10)).requests[0];assert.ok(new Date(row.next_due)>new Date(Date.now()+47*3600000));
 });
 await t.test('stage advance needs confirmation and returning does not restart',async()=>{
  const record=(await db.query('SELECT * FROM cases WHERE caseid=10')).rows[0];
  await assert.rejects(transaction(db,client=>service.beforeTransition(client,record,2,false,false)),e=>e.errorCode==='DOCUMENTS_MISSING_CONFIRM');
  await transaction(db,async client=>{await service.beforeTransition(client,record,2,false,true);await client.query('UPDATE cases SET currentstage=2 WHERE caseid=10');});
  calls=[];await service.processDue(db,{now:new Date(Date.now()+1000),notify});assert.equal(calls.length,0);
  await db.query('UPDATE cases SET currentstage=1 WHERE caseid=10');await service.afterTransition(db,record,1);
  row=(await service.list(db,10)).requests[0];assert.equal(row.state,'paused');assert.equal(row.next_due,null);
 });
 await t.test('unknown provider outcome is retained, pauses automatic sends, and needs explicit retry confirmation',async()=>{
  await service.action(db,1,10,row.id,{version:row.version,action:'send',channels:['sms']});
  calls=[];await service.processDue(db,{now:new Date(Date.now()+1000),notify:async payload=>{calls.push(payload);throw Error('ambiguous timeout');}});
  assert.equal(calls.length,2);row=(await service.list(db,10)).requests[0];assert.equal(row.state,'paused');assert.equal(row.deliveries.filter(job=>job.status==='UNKNOWN').length,2);
  await service.processDue(db,{now:new Date(Date.now()+1000),notify});assert.equal(calls.length,2);
  await assert.rejects(service.action(db,1,10,row.id,{version:row.version,action:'send',channels:['sms']}),e=>e.errorCode==='DOCUMENT_DELIVERY_UNKNOWN');
 });
 await t.test('explicit retry targets one failed delivery and cannot replay the same delivery',async()=>{
  const job=row.deliveries.find(job=>job.status==='UNKNOWN');
  await assert.rejects(service.action(db,1,10,row.id,{version:row.version,action:'retry',deliveryId:job.id}),e=>e.errorCode==='DOCUMENT_DELIVERY_UNKNOWN');
  await service.action(db,1,10,row.id,{version:row.version,action:'retry',deliveryId:job.id,confirmUnknown:true});
  calls=[];await service.processDue(db,{notify});assert.equal(calls.length,1);assert.equal(calls[0].recipientUserId,job.user_id);assert.ok(calls[0].sms);
  row=(await service.list(db,10)).requests[0];
  await assert.rejects(service.action(db,1,10,row.id,{version:row.version,action:'retry',deliveryId:job.id,confirmUnknown:true}),e=>e.errorCode==='DOCUMENT_RETRY_UNAVAILABLE');
 });
 await t.test('foreign tenant cannot read or mutate a checklist by guessing its id',async()=>{
  const {runWithTenant}=require('../lib/tenant/tenantContext');
  await runWithTenant({id:'11111111-1111-4111-8111-111111111111'},async()=>{
   await assert.rejects(service.list(db,10),e=>e.errorCode==='NOT_FOUND');
   await assert.rejects(service.save(db,1,10,{descriptionId:101,version:row.version,items:row.items}),e=>e.errorCode==='NOT_FOUND');
  });
 });
 await t.test('completing all items cancels scheduled work, preserves audit, and blocks sending',async()=>{
  row=await service.save(db,1,10,{descriptionId:101,version:row.version,items:row.items.map(item=>({...item,status:'received'}))});
  assert.equal(row.state,'completed');assert.equal(row.next_due,null);
  await assert.rejects(service.action(db,1,10,row.id,{version:row.version,action:'send',channels:['sms'],confirmUnknown:true}),e=>e.errorCode==='DOCUMENTS_COMPLETE');
  assert.ok((await service.list(db,10)).requests[0].history.some(event=>event.actor_id===1));
 });
 await t.test('default stage requests are copied once; new stages do not retroactively start historical lists',async()=>{
  await db.query(`UPDATE casetypedescriptions SET document_request_defaults=$1 WHERE stage=2`,[JSON.stringify({items:['Registration'],sendOnEntry:true})]);
  const record=(await db.query('SELECT * FROM cases WHERE caseid=10')).rows[0];await service.initialize(db,record,1);await service.initialize(db,record,1);
  const result=await service.list(db,10);assert.equal(result.requests.length,2);assert.equal(result.requests.find(item=>item.description_id===102).state,'draft');
  await db.query('UPDATE cases SET currentstage=2 WHERE caseid=10');await service.afterTransition(db,{...record,currentstage:2},1);
  assert.equal((await service.list(db,10)).requests.find(item=>item.description_id===102).state,'active');
 });
 await t.test('revoked author permission stops queued outbound messages',async()=>{
  await db.query("UPDATE users SET role='Deleted' WHERE userid=1");calls=[];await service.processDue(db,{now:new Date(Date.now()+1000),notify});assert.equal(calls.length,0);
 });
 await t.test('migration preserves shared-office row and foreign-reference boundaries',async()=>{
  const installer=fs.readFileSync(path.join(__dirname,'../scripts/install-office-isolation.js'),'utf8');
  const scopeSql=installer.match(/await client.query\(`(CREATE OR REPLACE FUNCTION public.office_scope_id[\s\S]+?)`\);/)[1];
  const guardSql=installer.match(/await client.query\(`(CREATE OR REPLACE FUNCTION public.guard_office_owner[\s\S]+?)`\);/)[1];
  await db.query(scopeSql);await db.query(guardSql);await db.query('ALTER TABLE casedescriptions ADD law_firm_tenant_id uuid');
  await db.query(migration);await db.query(migration);
  await db.query("DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='document_request_test_reader') THEN CREATE ROLE document_request_test_reader NOLOGIN;END IF;END$$;");
  await db.query('GRANT USAGE ON SCHEMA public TO document_request_test_reader;GRANT SELECT ON case_document_requests,case_document_deliveries,case_document_request_events TO document_request_test_reader');
  const client=await db.connect();
  try {
   await client.query('BEGIN');await client.query('SET LOCAL ROLE document_request_test_reader');
   await client.query("SELECT set_config('app.office_mode','office',true),set_config('app.office_id','11111111-1111-4111-8111-111111111111',true)");
   for(const name of ['case_document_requests','case_document_deliveries','case_document_request_events'])assert.equal((await client.query('SELECT count(*)::int AS n FROM '+name)).rows[0].n,0);
   await client.query("SELECT set_config('app.office_mode','legacy',true),set_config('app.office_id','',true)");
   assert.ok((await client.query('SELECT count(*)::int AS n FROM case_document_requests')).rows[0].n>0);
  } finally {await client.query('ROLLBACK');client.release();}
  await assert.rejects(db.query("INSERT INTO case_document_requests(id,case_id,stage_title,created_by,law_firm_tenant_id) VALUES(gen_random_uuid(),10,'Foreign',1,'11111111-1111-4111-8111-111111111111')"),e=>e.code==='42501');
  await db.query('DROP OWNED BY document_request_test_reader;DROP ROLE document_request_test_reader');
 });

});

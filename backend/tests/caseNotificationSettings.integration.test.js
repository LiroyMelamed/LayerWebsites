const test=require('node:test'), assert=require('node:assert/strict');
const pool=require('../config/db'), settings=require('../services/settingsService');
const deliveries=[];
require('../services/notifications/notificationOrchestrator').notifyRecipient=async payload=>{deliveries.push(payload);return {ok:true};};
const controller=require('../controllers/caseController');
const express=require('express'), request=require('supertest');
let author;
const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={UserId:author,Role:'Admin'};req.firmPermissionMode='legacy';next();});
app.post('/cases',controller.addCase);app.put('/cases/:caseId',controller.updateCase);app.put('/cases/:caseId/group',controller.linkWhatsappGroup);

test('saved case SMS templates control real create/update/link workflows',async t=>{
 assert.equal(process.env.DB_NAME,'codex_settings_20261006');
 assert.equal(Number((await pool.query('SELECT count(*) FROM users')).rows[0].count),0);
 assert.equal(Number((await pool.query('SELECT count(*) FROM cases')).rows[0].count),0);
 const users=[],types=[],keys=[];let caseId;
 t.after(async()=>{
  if(caseId){await pool.query('DELETE FROM casedescriptions WHERE caseid=$1',[caseId]);await pool.query('DELETE FROM case_users WHERE caseid=$1',[caseId]);await pool.query('DELETE FROM cases WHERE caseid=$1',[caseId]);}
  await pool.query('DELETE FROM casetypes WHERE casetypeid=ANY($1::int[])',[types]);await pool.query('DELETE FROM users WHERE userid=ANY($1::int[])',[users]);
  await pool.query("DELETE FROM platform_settings WHERE category='templates' AND setting_key=ANY($1::text[])",[keys]);settings.invalidateCache();await pool.end();
 });
 for(const role of ['Admin','Admin','User'])users.push((await pool.query("INSERT INTO users(name,email,phonenumber,passwordhash,role) VALUES($1,$2,$3,'synthetic-only',$4) RETURNING userid",['Synthetic case '+users.length,`case-${users.length}@example.invalid`,`qa-case-${users.length}`,role])).rows[0].userid);
 author=users[0];
 for(let i=0;i<2;i++)types.push((await pool.query('INSERT INTO casetypes(casetypename,numberofstages) VALUES($1,2) RETURNING casetypeid',['Synthetic '+i])).rows[0].casetypeid);
 const save=async key=>{if(!keys.includes(key))keys.push(key);await settings.upsertSetting('templates',key,key+' {{recipientName}} {{caseName}} {{stageName}} {{managerName}} {{websiteUrl}}',{valueType:'string'});};
 let body={CaseName:'Synthetic initial case',CaseTypeId:types[0],UserIds:[users[2]],CompanyName:'Synthetic A',CurrentStage:1,IsClosed:false,IsTagged:false,CaseManagerId:author,Descriptions:[{Stage:1,Text:'Synthetic stage one'},{Stage:2,Text:'Synthetic stage two'}]};
 const verifyDelivery=(key,start)=>{
  const found=deliveries.slice(start).filter(x=>x.recipientUserId===users[2]);assert.equal(found.length,1,key);
  assert.ok(found[0].sms.messageBody.startsWith(key+' '),found[0].sms.messageBody);
  assert.ok(found[0].sms.messageBody.includes(body.CaseName));assert.ok(!found[0].sms.messageBody.includes('{{'));
 };
 await t.test('CASE_CREATED_SMS',async()=>{
  await save('CASE_CREATED_SMS');const start=deliveries.length;const r=await request(app).post('/cases').send(body);
  assert.equal(r.status,201,JSON.stringify(r.body));caseId=r.body.caseId;verifyDelivery('CASE_CREATED_SMS',start);
  const desc=(await pool.query('SELECT descriptionid,stage,text FROM casedescriptions WHERE caseid=$1 ORDER BY stage',[caseId])).rows;
  body.Descriptions=desc.map(x=>({DescriptionId:x.descriptionid,Stage:x.stage,Text:x.text}));
 });
 for(const [key,change] of [
  ['CASE_NAME_CHANGE_SMS',{CaseName:'Synthetic updated case'}],
  ['CASE_TYPE_CHANGE_SMS',{CaseTypeId:types[1]}],
  ['CASE_STAGE_CHANGED_SMS',{CurrentStage:2}],
  ['CASE_CLOSED_SMS',{IsClosed:true}],
  ['CASE_REOPENED_SMS',{IsClosed:false}],
  ['CASE_MANAGER_CHANGE_SMS',{CaseManagerId:users[1]}],
  ['CASE_EST_DATE_CHANGE_SMS',{EstimatedCompletionDate:'2027-01-02'}],
  ['CASE_LICENSE_CHANGE_SMS',{LicenseExpiryDate:'2027-02-03',HasLicenseExpiry:true}],
  ['CASE_COMPANY_CHANGE_SMS',{CompanyName:'Synthetic B'}],
 ])await t.test(key,async()=>{
  await save(key);body={...body,...change};const start=deliveries.length;
  const r=await request(app).put('/cases/'+caseId).send(body);assert.equal(r.status,200,JSON.stringify(r.body));verifyDelivery(key,start);
 });
 await t.test('unchanged calendar dates do not create spurious client update messages',async()=>{
  const start=deliveries.length;const r=await request(app).put('/cases/'+caseId).send(body);
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(deliveries.slice(start).filter(x=>x.recipientUserId===users[2]).length,0);
 });
 await t.test('CASE_TAGGED_SMS is consumed when linking a WhatsApp group',async()=>{
  await save('CASE_TAGGED_SMS');const start=deliveries.length;
  const r=await request(app).put('/cases/'+caseId+'/group').send({WhatsappGroupLink:'https://example.invalid/synthetic-group'});
  assert.equal(r.status,200,JSON.stringify(r.body));verifyDelivery('CASE_TAGGED_SMS',start);
 });
});

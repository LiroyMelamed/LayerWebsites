const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve(__dirname, '../package.json'));
const pool=req('./config/db'), settings=req('./services/settingsService');
const calendar=req('./lib/calendarEventReminders');

test('saved calendar message and SMS sender settings reach actual consumers',async t=>{
 assert.equal(process.env.DB_NAME,'codex_settings_20261006');
 assert.equal(Number((await pool.query('SELECT count(*) FROM platform_settings')).rows[0].count),0);
 const owned=[];
 const save=async(category,key,value)=>{
  if(!owned.some(x=>x[0]===category&&x[1]===key))owned.push([category,key]);
  await settings.upsertSetting(category,key,value,{valueType:'string'});
 };
 t.after(async()=>{for(const [c,k] of owned)await pool.query('DELETE FROM platform_settings WHERE category=$1 AND setting_key=$2',[c,k]);settings.invalidateCache();await pool.end();});
 const event={client_name:'לקוח סינתטי',start_time:'2026-11-02T10:00:00Z',title:'בדיקת תזכורת',event_type:'appointment',meeting_type:'frontal'};

 await t.test('office address and navigation links update message context without restart; phone meetings suppress them',async()=>{
  await save('calendar','FIRM_OFFICE_ADDRESS','כתובת QA בלבד');
  await save('calendar','FIRM_WAZE_URL','https://waze.com/ul?ll=32.1,34.8&navigate=yes');
  await save('calendar','FIRM_MAPS_URL','https://maps.google.com/?q=32.1,34.8');
  let ctx=await calendar.loadCalendarSmsContext(event);
  assert.equal(ctx.address,'כתובת QA בלבד');assert.match(ctx.wazeUrl,/32\.1/);assert.match(ctx.mapsUrl,/32\.1/);
  await save('calendar','FIRM_OFFICE_ADDRESS','כתובת QA מעודכנת');
  await save('calendar','FIRM_WAZE_URL','https://waze.com/ul?ll=32.2,34.9&navigate=yes');
  await save('calendar','FIRM_MAPS_URL','https://maps.google.com/?q=32.2,34.9');
  ctx=await calendar.loadCalendarSmsContext(event);
  assert.equal(ctx.address,'כתובת QA מעודכנת');assert.match(ctx.wazeUrl,/32\.2/);assert.match(ctx.mapsUrl,/32\.2/);
  const phone=await calendar.loadCalendarSmsContext({...event,meeting_type:'phone'});
  assert.equal(phone.address,'');assert.equal(phone.wazeUrl,'');assert.equal(phone.mapsUrl,'');
 });

 for(const [kind,key,compose] of [
  ['appointment','CALENDAR_CLIENT_REMINDER_SMS',async ev=>(await calendar.composeClientReminderMessage(30,ev)).body],
  ['hearing','CALENDAR_CLIENT_REMINDER_SMS_HEARING',async ev=>(await calendar.composeClientReminderMessage(30,ev)).body],
  ['appointment','CALENDAR_INVITE_SMS',calendar.composeInviteSmsMessage],
  ['hearing','CALENDAR_INVITE_SMS_HEARING',calendar.composeInviteSmsMessage],
 ]) await t.test(key+' controls the rendered message and refreshes after save',async()=>{
  const marker='Synthetic '+key;
  await save('templates',key,marker+' {{recipientName}} {{date}} {{time}} {{address}}');
  const ev={...event,event_type:kind};let body=await compose(ev);
  assert.match(body,new RegExp(marker));assert.match(body,/לקוח סינתטי/);assert.match(body,/02[./]11[./]2026/);assert.match(body,/12:00/);assert.match(body,/כתובת QA מעודכנת/);assert.ok(!body.includes('{{'));
  await save('templates',key,marker+' Updated {{recipientName}} {{date}} {{time}}');
  body=await compose(ev);assert.match(body,/Updated/);
 });

 await t.test('NEW_CLIENT_SMS controls the actual customer welcome notification',async st=>{
  const captured=[];
  req('./services/notifications/notificationOrchestrator').notifyRecipient=async payload=>{captured.push(payload);return {ok:true};};
  const express=req('express'),request=req('supertest'),controller=req('./controllers/customerController');
  const app=express();app.use(express.json());app.post('/customer',controller.addCustomer);
  const email='synthetic-welcome-settings@example.invalid';
  st.after(async()=>{await pool.query('DELETE FROM users WHERE email=$1 AND name=$2',[email,'Synthetic welcome QA']);});
  await save('templates','NEW_CLIENT_SMS','QA Welcome {{recipientName}} {{firmName}} {{websiteUrl}}');
  const result=await request(app).post('/customer').send({name:'Synthetic welcome QA',phoneNumber:'0500000000',email});
  assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(captured.length,1);
  assert.equal(captured[0].recipientUserId,result.body.UserId);assert.match(captured[0].sms.messageBody,/^QA Welcome Synthetic welcome QA /);assert.ok(!captured[0].sms.messageBody.includes('{{'));
 });

 await t.test('active sender name and activated sender number control provider payload, without network delivery',async()=>{
  const captured=[];
  const module={exports:{}};
  const actualFile=req.resolve('./utils/sendMessage');
  vm.runInNewContext(fs.readFileSync(actualFile,'utf8'),{
   module,exports:module.exports,Buffer,console:{log(){},error(){}},
   process:{env:{IS_PRODUCTION:'true',SMS_PROVIDER:'inforu',INFORU_BASE_URL:'https://provider.invalid',INFORU_AUTH:'synthetic-only'}},
   require(name){
    if(name==='axios')return {post:async(url,body)=>{assert.equal(url,'https://provider.invalid/api/v2/SMS/SendSms');captured.push(body);return {data:{StatusId:1}};}};
    if(name==='dotenv')return {config(){}};
    if(name.includes('qaOutboundNoop'))return {qaOutboundNoop:()=>null};
    if(name.includes('recordFirmUsage'))return {recordUsageEvent:async()=>{}};
    if(name.includes('settingsService'))return settings;
    if(name==='./phoneUtils')return req('./utils/phoneUtils');
    if(name.includes('firmBranding'))return req('./lib/firmBranding');
    throw Error('Unexpected dependency '+name);
   },
  });
  await save('messaging','INFORU_SENDER_PHONE','QAName');await save('messaging','INFORU_SENDER_NUMBER','0500000000');
  assert.equal((await module.exports.sendMessage('Synthetic QA','+972500000000')).ok,true);
  assert.equal(captured[0].Data.Settings.Sender,'QAName');
  await save('messaging','INFORU_SENDER_PHONE','');
  assert.equal((await module.exports.sendMessage('Synthetic QA','+972500000000')).ok,true);
  assert.equal(captured[1].Data.Settings.Sender,'0500000000');
  assert.equal(captured.length,2);
 });
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const pool=require('../config/db'),settings=require('../services/settingsService'),messages=require('../lib/calendarEventReminders'),email=require('../lib/calendarEmail');
const owned=[];test.after(async()=>{for(const [c,k]of owned)await pool.query('DELETE FROM platform_settings WHERE category=$1 AND setting_key=$2',[c,k]);await pool.query("DELETE FROM email_templates WHERE template_key='CALENDAR_INVITE'");settings.invalidateCache();await pool.end();});
async function save(c,k,v){if(!owned.some(x=>x[0]===c&&x[1]===k))owned.push([c,k]);await settings.upsertSetting(c,k,v,{valueType:'string'});}
const ev={title:'Synthetic calendar message',client_name:'לקוח סינתטי',clients_names:['לקוח א','לקוח ב'],owner_name:'מנהל סינתטי',start_time:'2026-11-02T10:00:00Z',meeting_type:'frontal',event_type:'appointment',location:'כתובת לבדיקה',invite_token:null};
test('saved invite/reminder SMS templates and per-event overrides render values and refresh on edit',async()=>{
 for(const [type,key,compose]of [['appointment','CALENDAR_CLIENT_REMINDER_SMS',e=>messages.composeClientReminderMessage(30,e).then(x=>x.body)],['hearing','CALENDAR_CLIENT_REMINDER_SMS_HEARING',e=>messages.composeClientReminderMessage(30,e).then(x=>x.body)],['appointment','CALENDAR_INVITE_SMS',messages.composeInviteSmsMessage],['hearing','CALENDAR_INVITE_SMS_HEARING',messages.composeInviteSmsMessage]]){
  await save('templates',key,'Synthetic '+key+' {{recipientName}} {{date}} {{time}} {{address}} {{title}}');const body=await compose({...ev,event_type:type});assert.match(body,new RegExp(key));assert.match(body,/לקוח סינתטי/);assert.match(body,/02[./]11[./]2026/);assert.match(body,/12:00/);assert.ok(!body.includes('{{'));await save('templates',key,'Updated {{recipientName}} {{time}}');assert.match(await compose({...ev,event_type:type}),/^Updated/);
 }
 assert.match((await messages.composeClientReminderMessage(30,{...ev,client_reminder_sms:'Event override {{recipientName}}'})).body,/Event override לקוח סינתטי/);assert.match(await messages.composeInviteSmsMessage({...ev,invite_sms:'Event invite {{recipientName}}'}),/Event invite לקוח סינתטי/);
});
test('location/navigation formatting distinguishes phone, Zoom and frontal meetings',async()=>{
 await save('calendar','FIRM_OFFICE_ADDRESS','Synthetic office');const phone=await messages.loadCalendarSmsContext({...ev,meeting_type:'phone'});assert.equal(phone.address,'');assert.equal(phone.wazeUrl,'');assert.equal(phone.mapsUrl,'');
 const zoom=await messages.loadCalendarSmsContext({...ev,meeting_type:'zoom',location:'https://zoom.us/j/123456'});assert.equal(zoom.placeMode,'link');assert.equal(zoom.wazeUrl,'');assert.match(zoom.address,/zoom.us/);
 const lawyer=await messages.composeLawyerReminderMessage(30,{...ev,clients_names:['לקוח א','לקוח ב']});assert.match(lawyer.body,/לקוח א/);assert.match(lawyer.body,/לקוח ב/);assert.match(lawyer.body,/12:00/);
});
test('saved calendar email subject and body variables refresh and escape participant/title markup',async()=>{
 await pool.query("INSERT INTO email_templates(template_key,label,subject_template,html_body)VALUES('CALENDAR_INVITE','Synthetic','Subject [[title]] [[date]]','<p>[[recipient_name]] [[time]] [[title]]</p>')");let composed=await email.composeCalendarEmail('CALENDAR_INVITE',{...ev,title:'Title <b>markup</b>'},{recipientName:'Name <script>bad</script>'});assert.match(composed.subject,/Subject Title markup/);assert.match(composed.htmlBody,/&lt;script&gt;/);assert.match(composed.htmlBody,/12:00/);
 await pool.query("UPDATE email_templates SET subject_template='Updated [[title]]',html_body='<p>New [[recipient_name]]</p>'WHERE template_key='CALENDAR_INVITE'");composed=await email.composeCalendarEmail('CALENDAR_INVITE',ev,{recipientName:'Synthetic recipient'});assert.match(composed.subject,/^Updated/);assert.match(composed.htmlBody,/New Synthetic recipient/);
});
test('actual invitation consumer does not count rejected SMS/email as accepted; canceled and quiet invitations do not send',async()=>{
 const file=require.resolve('../controllers/calendarController'),req=createRequire(file),calls=[];let quiet=null;const module={exports:{}};
 const stub=id=>{
  if(id==='../utils/sendMessage')return{sendMessage:async()=>{calls.push('sms');return{ok:false,error:'synthetic_rejection'}}};
  if(id==='../utils/smooveEmailCampaignService')return{sendTransactionalCustomHtmlEmail:async()=>{calls.push('email');return{ok:false,errorCode:'synthetic_rejection'}}};
  if(id==='../lib/shabbatDeferral')return{describeQuietDeferral:()=>quiet};
  return req(id);
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.send=_sendCalendarInvite;', {require:stub,module,process,Buffer,console:{log(){},error(){},warn(){}}});
 const event={...ev,id:0,event_status:'scheduled',lead_name:'Synthetic lead',lead_phone:'0500000021',lead_email:'lead@example.invalid',invite_token:'synthetic-only'};
 // Existing row id is intentionally unrelated to customers and only used for the real query/update shape.
 const row=(await pool.query("INSERT INTO calendar_events(owner_id,title,start_time,end_time)VALUES(1017,'Synthetic invite transport',NOW(),NOW()+INTERVAL '1hour')RETURNING id")).rows[0];event.id=row.id;
 try{
  const rejected=await module.exports.send(event);assert.equal(rejected.sentSms,0);assert.equal(rejected.sentEmail,0);assert.equal(calls.length,2);assert.match(rejected.error,/synthetic_rejection/);
  calls.length=0;
  quiet={reason:'night',until:new Date(Date.now()+3600000)};const deferred=await module.exports.send(event);assert.equal(deferred.deferred,true);assert.equal(calls.length,0);assert.ok((await pool.query('SELECT invite_deferred_until FROM calendar_events WHERE id=$1',[row.id])).rows[0].invite_deferred_until);
 }finally{await pool.query('DELETE FROM calendar_events WHERE id=$1',[row.id]);}
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=require.resolve('../tasks/dailyAgenda/scheduler'),req=createRequire(file),pool=require('../config/db');
const owned=[];test.after(async()=>{await pool.query('DELETE FROM user_daily_agenda_settings WHERE user_id=1088');for(const id of owned)await pool.query('DELETE FROM calendar_events WHERE id=$1',[id]);await pool.end();});
function api(send,push=async()=>({ok:true})){const module={exports:{}};const stub=id=>{
 if(id==='node-cron')return{schedule:()=>{}};
 if(id==='../../utils/sendAndStoreNotification')return push;
 if(id==='../../utils/smooveEmailCampaignService')return{sendTransactionalCustomHtmlEmail:send};
 if(id==='../../lib/hebcalHolidays')return{listHolidaysInRange:async()=>[]};
 return req(id);
};vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:stub,module,process:{env:{}},Date,console:{log(){},error(){},warn(){}}});return module.exports;}
async function enable(){await pool.query("INSERT INTO user_daily_agenda_settings(user_id,enabled,channels,send_time,last_sent_date)VALUES(1088,true,'email','00:00','')ON CONFLICT(user_id)DO UPDATE SET enabled=true,channels='email',send_time='00:00',last_sent_date='',delivery_receipts='{}'::jsonb");}
test('daily agenda falseproviderresult is not success; subsequent success dedupes today',async()=>{
 await enable();const calls=[];let ok=false;const worker=api(async payload=>{calls.push(payload);return{ok,errorCode:'synthetic_failure'}});await worker.processDailyAgendaDigest();assert.equal(calls.length,1);assert.equal((await pool.query('SELECT last_sent_date FROM user_daily_agenda_settings WHERE user_id=1088')).rows[0].last_sent_date,'');ok=true;await worker.processDailyAgendaDigest();assert.equal(calls.length,2);await worker.processDailyAgendaDigest();assert.equal(calls.length,2);
});
test('concurrent daily agenda workers send only once and preserve active midnight overlaps',async()=>{
 await enable();const {rows}=await pool.query(`INSERT INTO calendar_events(owner_id,manager_user_id,title,start_time,end_time)VALUES(1088,1088,'Synthetic midnight overlap',(NOW() AT TIME ZONE 'Asia/Jerusalem')::date AT TIME ZONE 'Asia/Jerusalem'-INTERVAL '1hour',(NOW() AT TIME ZONE 'Asia/Jerusalem')::date AT TIME ZONE 'Asia/Jerusalem'+INTERVAL '1hour')RETURNING id`);owned.push(...rows.map(r=>r.id));
 const calls=[],worker=api(async p=>{calls.push(p);await new Promise(r=>setTimeout(r,15));return{ok:true};});await Promise.all([worker.processDailyAgendaDigest(),worker.processDailyAgendaDigest()]);assert.equal(calls.length,1);assert.match(calls[0].htmlBody,/Synthetic midnight overlap/);assert.ok(!calls[0].htmlBody.includes('Synthetic cancelled exclusion'));
});
test('partial digest recipients retry only failed recipient without duplicating accepted recipients',async()=>{
 await enable();await pool.query("UPDATE user_daily_agenda_settings SET recipients='one@example.invalid,two@example.invalid,three@example.invalid' WHERE user_id=1088");const calls=[];let fail=true;const worker=api(async p=>{calls.push(p.toEmail);return{ok:!(fail&&p.toEmail==='two@example.invalid'),errorCode:'synthetic_rejection'}});
 await worker.processDailyAgendaDigest();assert.deepEqual(calls,['one@example.invalid','two@example.invalid','three@example.invalid']);assert.equal((await pool.query('SELECT last_sent_date FROM user_daily_agenda_settings WHERE user_id=1088')).rows[0].last_sent_date,'');fail=false;await worker.processDailyAgendaDigest();assert.deepEqual(calls.slice(3),['two@example.invalid']);await worker.processDailyAgendaDigest();assert.equal(calls.length,4);
});
test('interrupted digest attempts remain durable and never automatically resend uncertain acceptance',async()=>{
 await enable();await pool.query("UPDATE user_daily_agenda_settings SET recipients='' WHERE user_id=1088");const crypto=require('node:crypto'),date=(await pool.query("SELECT (NOW() AT TIME ZONE 'Asia/Jerusalem')::date::text AS day")).rows[0].day,key=date+':email:'+crypto.createHash('sha256').update('a@example.invalid').digest('hex').slice(0,24);await pool.query('UPDATE user_daily_agenda_settings SET delivery_receipts=$1::jsonb WHERE user_id=1088',[JSON.stringify({[key]:{status:'sending',date,channel:'email',at:new Date().toISOString()}})]);
 const calls=[],worker=api(async p=>{calls.push(p);return{ok:true};});await worker.processDailyAgendaDigest();await worker.processDailyAgendaDigest();assert.equal(calls.length,0);assert.equal((await pool.query('SELECT delivery_receipts FROM user_daily_agenda_settings WHERE user_id=1088')).rows[0].delivery_receipts[key].status,'sending');
});
test('push-only daily agenda uses incumbent notification path, retries known failure and dedupes accepted push without recipient contacts',async()=>{
 await enable();await pool.query("UPDATE user_daily_agenda_settings SET channels='push',recipients='' WHERE user_id=1088");const calls=[];let fail=true;const worker=api(async()=>{throw Error('email_not_selected')},async(...p)=>{calls.push(p);if(fail)throw Error('synthetic_push_rejected');return{ok:true};});await worker.processDailyAgendaDigest();assert.equal(calls.length,1);assert.equal(calls[0][0],1088);assert.equal(calls[0][4].throwOnError,true);assert.equal((await pool.query('SELECT last_sent_date FROM user_daily_agenda_settings WHERE user_id=1088')).rows[0].last_sent_date,'');fail=false;await worker.processDailyAgendaDigest();assert.equal(calls.length,2);await worker.processDailyAgendaDigest();assert.equal(calls.length,2);
});

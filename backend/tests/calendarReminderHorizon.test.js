const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const file=require.resolve('../tasks/calendarReminders/scheduler');
async function candidateSql(){let sql;const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.claim=_claimDueReminders;',{
 require:id=>id==='../../config/db'?{query:async text=>{sql=text;return{rows:[]};}}:id==='../../lib/calendarEventStatus'?{activeEventStatusSql:()=>"COALESCE(ce.event_status,'scheduled')='scheduled'"}:{},module,console,Date,
});await module.exports.claim(5);return sql;}
test('candidate horizon includes configured lawyer, client and legacy offsets',async()=>{const sql=await candidateSql();assert.match(sql,/GREATEST\(20160/);assert.match(sql,/MAX\(CASE WHEN value/);for(const column of ['lawyer_reminder_offsets','client_reminder_offsets','reminder_offsets'])assert.ok(sql.includes(`COALESCE(ce.${column}, '[]'::jsonb)`));});
test('PostgreSQL selects 30/14/7 day candidates, excludes outside horizon, disabled and cancelled', {skip:process.env.CALENDAR_POSTGRES_TEST!=='1'},async()=>{
 require('dotenv').config();const {Client}=require('pg');const db=new Client({host:process.env.DB_HOST||'localhost',database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});await db.connect();try{
 await db.query('BEGIN');await db.query('CREATE TEMP TABLE calendar_events (LIKE public.calendar_events INCLUDING DEFAULTS) ON COMMIT DROP');await db.query('ALTER TABLE pg_temp.calendar_events ALTER COLUMN id DROP DEFAULT');
 const cases=[{id:1,days:30,offset:43200},{id:2,days:14,offset:20160},{id:3,days:7,offset:10080},{id:4,days:31,offset:43200},{id:5,days:30,offset:10080},{id:6,days:30,offset:43200,status:'cancelled'},{id:7,days:30,offset:43200,off:true},{id:8,days:30,offset:43200,role:'client'},{id:9,days:30,offset:43200,role:'legacy'}];
 for(const c of cases){const list=JSON.stringify([c.offset]);await db.query(`INSERT INTO pg_temp.calendar_events (id,owner_id,title,event_type,event_status,start_time,end_time,reminder_channels,lawyer_reminder_offsets,client_reminder_offsets,reminder_offsets) VALUES ($1,1,'Synthetic','hearing',$2,NOW()+$3*INTERVAL '1 day',NOW()+$3*INTERVAL '1 day'+INTERVAL '1 hour',$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)`,[c.id,c.status||'scheduled',c.days,JSON.stringify({sms:!c.off,email:!c.off}),!c.role?list:'[]',c.role==='client'?list:'[]',c.role==='legacy'?list:'[]']);}
 const rows=(await db.query(await candidateSql())).rows;assert.deepEqual(rows.map(x=>x.id).sort((a,b)=>a-b),[1,2,3,8,9]);
 }finally{await db.query('ROLLBACK');await db.end();}
});

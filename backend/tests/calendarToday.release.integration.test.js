const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),jwt=require('jsonwebtoken'),pool=require('../config/db');
const owned=[];test.after(async()=>{for(const id of owned)await pool.query('DELETE FROM calendar_events WHERE id=$1',[id]);});
const ids=require('./helpers/identityFixture').useTestIdentities(),app=require('../app');
async function insert(owner,dayStart,hourStart,dayEnd,hourEnd,allDay=false){const{rows}=await pool.query(`INSERT INTO calendar_events(owner_id,title,start_time,end_time,all_day)VALUES($1,'Synthetic compact calendar overlap',((NOW() AT TIME ZONE 'Asia/Jerusalem')::date+$2::int+($3::int*INTERVAL '1hour'))AT TIME ZONE 'Asia/Jerusalem',((NOW() AT TIME ZONE 'Asia/Jerusalem')::date+$4::int+($5::int*INTERVAL '1hour'))AT TIME ZONE 'Asia/Jerusalem',$6)RETURNING id`,[owner,dayStart,hourStart,dayEnd,hourEnd,allDay]);owned.push(rows[0].id);return rows[0].id;}
async function list(){const r=await request(app).get('/api/calendar/today').set('Authorization','Bearer '+jwt.sign({userid:ids.admin,role:'Admin'},process.env.JWT_SECRET)).set('Connection','close');assert.equal(r.status,200,JSON.stringify(r.body));return r.body.events.map(e=>e.id);}
test('compact today/tomorrow API includes overnight and multi-day all-day events, keeps exclusive boundaries and personal visibility',async()=>{
 const overnight=await insert(ids.admin,-1,23,0,1),multi=await insert(ids.admin,-2,0,2,0,true),today=await insert(ids.admin,0,10,0,11),tomorrow=await insert(ids.admin,1,10,1,11),expired=await insert(ids.admin,-1,23,0,0),future=await insert(ids.admin,2,0,2,1),foreign=await insert(ids.lawyer,0,10,0,11);const got=await list();
 for(const id of[overnight,multi,today,tomorrow])assert.ok(got.includes(id),'missing intersecting event '+id);
 for(const id of[expired,future,foreign])assert.ok(!got.includes(id),'unexpected boundary/private event '+id);
});

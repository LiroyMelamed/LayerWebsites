const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),jwt=require('jsonwebtoken');
const pool=require('../config/db'),app=require('../app');
const owned=[];test.after(async()=>{for(const id of owned)await pool.query('DELETE FROM calendar_events WHERE id=$1',[id]);});
const ids=require('./helpers/identityFixture').useTestIdentities();
const token=(id,role='Admin')=>'Bearer '+jwt.sign({userid:id,role},process.env.JWT_SECRET);
const call=(method,path,body,uid=ids.admin)=>request(app)[method]('/api/calendar'+path).set('Authorization',token(uid)).set('Connection','close').send(body);
const sample=()=>({title:'Synthetic calendar release',start_time:'2026-11-02T08:00:00Z',end_time:'2026-11-02T09:00:00Z',event_type:'appointment',manager_user_ids:[ids.admin,ids.lawyer],client_user_ids:[ids.client,ids.outsider],lawyer_reminder_offsets:[],client_reminder_offsets:[],reminder_channels:{sms:false,email:false,push:false}});
const create=async body=>{const r=await call('post','',body);assert.equal(r.status,201,JSON.stringify(r.body));owned.push(r.body.event.id);return r.body;};
test('registered clients and leads coexist and survive title/message edits',async()=>{
 const r=await create({...sample(),lead_name:'Synthetic prospect',lead_email:'lead@example.invalid',lead_phone:'0500000021',lead_participants:[{name:'Synthetic prospect',email:'lead@example.invalid',phone:'0500000021'}]});
 const get=()=>call('get','/'+r.event.id);
 let read=await get();assert.deepEqual(read.body.event.clients.map(c=>c.userId),[ids.client,ids.outsider]);assert.deepEqual(read.body.event.managers.map(c=>c.userId),[ids.admin,ids.lawyer]);
 const changed=await call('put','/'+r.event.id,{title:'Updated full title',client_reminder_sms:'Hello {{recipientName}}',invite_sms:'Invite {{time}}'});assert.equal(changed.status,200,JSON.stringify(changed.body));
 read=await get();assert.deepEqual(read.body.event.clients.map(c=>c.userId),[ids.client,ids.outsider]);assert.equal(read.body.event.leadEmail,'lead@example.invalid');assert.equal(read.body.event.clientReminderSms,'Hello {{recipientName}}');assert.equal(read.body.event.inviteSms,'Invite {{time}}');
 const filtered=await request(app).get('/api/calendar/events').query({scope:'firm',client_id:ids.outsider}).set('Authorization',token(ids.admin)).set('Connection','close');assert.equal(filtered.status,200);assert.ok(filtered.body.events.some(e=>e.id===r.event.id));
});
test('list single-ended windows respect overlap including midnight and upper boundary',async()=>{
 const a=await create({...sample(),start_time:'2026-11-01T22:00:00Z',end_time:'2026-11-02T01:00:00Z'}),b=await create({...sample(),start_time:'2026-11-03T08:00:00Z',end_time:'2026-11-03T09:00:00Z'});
 const list=async q=>(await request(app).get('/api/calendar/events').query({scope:'firm',...q}).set('Authorization',token(ids.admin)).set('Connection','close')).body.events.map(e=>e.id);
 assert.ok((await list({from:'2026-11-02T00:00:00Z'})).includes(a.event.id));assert.ok(!(await list({to:'2026-11-02T00:00:00Z'})).includes(b.event.id));assert.ok((await list({to:'2026-11-02T00:00:00Z'})).includes(a.event.id));
 assert.ok(!(await list({from:'2026-11-03T09:00:00Z',to:'2026-11-03T10:00:00Z'})).includes(b.event.id));
});
test('invalid dates/ranges and one-sided inverted edits return actionable400 without mutation',async()=>{
 for(const fields of [{start_time:'bad'},{title:'   '},{end_time:'bad'}])assert.equal((await call('post','',{...sample(),...fields})).status,400);
 const r=await create(sample());for(const fields of [{start_time:'2026-11-02T10:00:00Z'},{end_time:'2026-11-02T07:00:00Z'},{start_time:'bad'},{title:' '}])assert.equal((await call('put','/'+r.event.id,fields)).status,400);
 const unchanged=await call('get','/'+r.event.id);assert.equal(unchanged.body.event.startTime,'2026-11-02T08:00:00.000Z');
 for(const q of [{from:'bad'},{to:'bad'},{from:'2026-11-03',to:'2026-11-02'}])assert.equal((await request(app).get('/api/calendar/events').query(q).set('Authorization',token(ids.admin)).set('Connection','close')).status,400);
});
test('series creates all managers/clients and rejects excessive or inverted end',async()=>{
 const r=await create({...sample(),recurrence:{enabled:true,frequency:'weekly',until:'2026-11-16'}});assert.equal(r.seriesCount,3);
 const rows=(await pool.query('SELECT id FROM calendar_events WHERE rrule=$1',[r.event.rrule])).rows;for(const row of rows)if(!owned.includes(row.id))owned.push(row.id);assert.equal(rows.length,3);
 assert.equal((await pool.query('SELECT count(*) FROM calendar_event_clients WHERE event_id=ANY($1::int[])',[rows.map(x=>x.id)])).rows[0].count,'6');
 assert.equal((await call('post','',{...sample(),recurrence:{enabled:true,frequency:'daily',until:'2027-12-31'}})).status,400);
 assert.equal((await call('post','',{...sample(),recurrence:{enabled:true,frequency:'daily',until:'2025-01-01'}})).status,400);
});
test('1002 same-time appointments paginate deterministically without dropping overlaps',async()=>{
 const {rows}=await pool.query(`INSERT INTO calendar_events(owner_id,title,start_time,end_time) SELECT $1, 'Synthetic volume appointment '||n, '2027-01-04T08:00:00Z'::timestamptz,'2027-01-04T09:00:00Z'::timestamptz FROM generate_series(1,1002)n RETURNING id`,[ids.admin]);owned.push(...rows.map(r=>r.id));
 const page=async offset=>{const r=await request(app).get('/api/calendar/events').query({scope:'firm',from:'2027-01-04T00:00:00Z',to:'2027-01-05T00:00:00Z',limit:1000,offset}).set('Authorization',token(ids.admin)).set('Connection','close');assert.equal(r.status,200);return r.body.events.map(e=>e.id);};
 const one=await page(0),two=await page(1000);assert.equal(one.length,1000);assert.equal(two.length,2);assert.equal(new Set([...one,...two]).size,1002);assert.deepEqual([...one,...two],rows.map(r=>r.id).sort((a,b)=>a-b));
});
test('daily agenda push-only preferences save/read and interrupted delivery warning is returned without exposing recipients',async t=>{
 t.after(()=>pool.query('DELETE FROM user_daily_agenda_settings WHERE user_id=$1',[ids.admin]));const save=await call('put','/daily-agenda-settings',{enabled:true,channels:'push',recipients:'',sendTime:'07:30'});assert.equal(save.status,200);assert.equal(save.body.settings.channels,'push');const read=await call('get','/daily-agenda-settings');assert.equal(read.body.settings.channels,'push');assert.equal(read.body.settings.deliveryWarning,null);
 await pool.query('UPDATE user_daily_agenda_settings SET delivery_receipts=$2::jsonb WHERE user_id=$1',[ids.admin,JSON.stringify({'synthetic-key':{status:'uncertain',channel:'push'}})]);const warning=await call('get','/daily-agenda-settings');assert.match(warning.body.settings.deliveryWarning,/יש לבדוק/);assert.ok(!JSON.stringify(warning.body).includes('synthetic-key'));
});

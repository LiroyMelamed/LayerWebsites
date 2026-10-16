const test=require('node:test'),assert=require('node:assert/strict');
// Run only in a disposable schema-only database, never a customer database.
assert.match(process.env.DB_NAME || '',/^codex_scoring_20261016_[0-9]+$/);
assert.equal(process.env.QA_OUTBOUND_MODE,'noop');
const pool=require('../config/db');
require('../services/notifications/notificationOrchestrator').notifyRecipient=async()=>({ok:true,noop:true});
require('../tasks/calendarReminders/scheduler').fireImmediateRemindersForEvent=async()=>({attempted:0,sent:0,deferred:false,errors:[]});
const express=require('express');
const cases=require('../controllers/caseController'),calendar=require('../controllers/calendarController');
const {fetchTeamActivity}=require('../services/managerHome/teamActivity');
let actor;
const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={UserId:actor,Role:'Admin'};req.firmPermissionMode='legacy';next();});
app.post('/cases',cases.addCase);app.post('/calendar',calendar.createEvent);app.put('/calendar/:id',calendar.updateEvent);

test('real creation controllers atomically record the creator and cap a recurring series without sending messages',async t=>{
    t.after(()=>pool.end());
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const send=async(method,path,body)=>{
        const res=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return {status:res.status,body:await res.json()};
    };
    assert.equal(Number((await pool.query('SELECT count(*) FROM users')).rows[0].count),0);
    const users=[];
    for(const role of ['Admin','Lawyer']) users.push((await pool.query(
        "INSERT INTO users(name,phonenumber,email,passwordhash,role) VALUES($1,$2,$3,'synthetic-only',$4) RETURNING userid",
        ['Synthetic scoring '+role,'qa-scoring-'+role,role.toLowerCase()+'@example.invalid',role])).rows[0].userid);
    actor=users[0];
    const type=(await pool.query("INSERT INTO casetypes(casetypename,numberofstages) VALUES('Synthetic scoring',1) RETURNING casetypeid")).rows[0].casetypeid;
    let caseId,eventId;
    await t.test('case opening credits the authenticated creator rather than the assigned manager',async()=>{
        const res=await send('POST','/cases',{CaseName:'Synthetic scoring only',CaseTypeId:type,CaseManagerId:users[1],CurrentStage:1,UserIds:[],Descriptions:[]});
        assert.equal(res.status,201,JSON.stringify(res.body));caseId=res.body.caseId;
        const rows=(await pool.query("SELECT actor_id,caseid,kind FROM manager_platform_activity WHERE kind='case_open'")).rows;
        assert.deepEqual(rows,[{actor_id:actor,caseid:caseId,kind:'case_open'}]);
    });
    const body={title:'Synthetic recurring meeting',event_type:'appointment',start_time:'2026-11-02T10:00:00+02:00',end_time:'2026-11-02T11:00:00+02:00',
        manager_user_id:users[1],reminder_channels:{push:false,sms:false,email:false},reminder_targets:{client:false,managers:false},
        lawyer_reminder_offsets:[],client_reminder_offsets:[],recurrence:{enabled:true,frequency:'weekly',until:'2026-11-16'}};
    await t.test('three recurring events earn one creation point, and a no-op save adds no point',async()=>{
        const res=await send('POST','/calendar',body);
        assert.equal(res.status,201,JSON.stringify(res.body));assert.equal(res.body.seriesCount,3);eventId=res.body.event.id;
        const rows=(await pool.query("SELECT actor_id,activity_key FROM manager_platform_activity WHERE kind='calendar'")).rows;
        assert.deepEqual(rows,[{actor_id:actor,activity_key:'calendar:'+eventId}]);
        const saved=await send('PUT','/calendar/'+eventId,{title:body.title});
        assert.equal(saved.status,200,JSON.stringify(saved.body));
        assert.equal(Number((await pool.query("SELECT count(*) FROM manager_platform_activity WHERE kind='calendar'")).rows[0].count),1);
    });
    await t.test('rejected creations leave the score unchanged and the complete payload reconciles all categories',async()=>{
        const res=await send('POST','/cases',{CaseName:'Invalid missing manager'});assert.equal(res.status,400);
        const invalid=await send('POST','/calendar',{...body,start_time:'2026-11-02T12:00:00+02:00'});assert.equal(invalid.status,400);
        const data=await fetchTeamActivity(pool);
        const leader=data.periods.today.leaders.find(x=>x.managerId===actor);
        assert.equal(leader.casesCreated,1);assert.equal(leader.calendarActions,1);assert.equal(leader.points,2);
        assert.ok(data.periods.today.leaders.every(x=>x.managerId!==users[1]));
    });
});

const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { createRequire } = require('node:module');
test('PostgreSQL invitation identity: repeat, revision, cancellation, owner isolation, concurrent import, Google/ICS dedupe and reminder conflicts', {skip: process.env.CALENDAR_INVITATION_PG_TEST !== '1'}, async () => {
    require('dotenv').config();
    const { Client, Pool } = require('pg');
    const config = {host:process.env.DB_HOST||'localhost',database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD};
    const schema = `calendar_invite_test_${process.pid}`;
    const admin = new Client(config); await admin.connect();
    let pool;
    try {
        await admin.query(`CREATE SCHEMA ${schema}`);
        await admin.query(`SET search_path=${schema}`);
        await admin.query(`CREATE TABLE users(userid int primary key,name text); INSERT INTO users VALUES(1,'One'),(2,'Two');
            CREATE TABLE cases(caseid int primary key,casename text);
            CREATE TABLE calendar_events(id serial primary key,owner_id int,title text,description text,location text,start_time timestamptz,end_time timestamptz,all_day boolean,
            google_event_id text,event_status text default 'scheduled',invite_deferred_until timestamptz,event_type text default 'appointment',client_user_id int,case_id int,
            reminder_offsets jsonb,lawyer_reminder_offsets jsonb,client_reminder_offsets jsonb,reminder_channels jsonb,reminder_targets jsonb);
            CREATE UNIQUE INDEX google_idx ON calendar_events(owner_id,google_event_id) WHERE google_event_id IS NOT NULL;`);
        await admin.query(fs.readFileSync(require.resolve('../migrations/2026-11-04_01_calendar_invitations.sql'),'utf8'));
        pool = new Pool({...config, options:`-c search_path=${schema}`});
        const file = require.resolve('../services/calendarInvitationImport'), localRequire = createRequire(file), module = {exports:{}};
        vm.runInNewContext(fs.readFileSync(file,'utf8'), {module,require:name=>name==='../config/db'?pool:localRequire(name),console});
        const { importInvitations } = module.exports;
        const base = {uid:'test@example.invalid',organizer:'host@example.invalid',recurrenceKey:'',sequence:0,stamp:'2026-11-04T08:00:00Z',title:'Original',startTime:'2026-11-05T08:00:00Z',endTime:'2026-11-05T09:00:00Z',allDay:false};
        await Promise.all([importInvitations(1,[base]),importInvitations(1,[base])]);
        assert.equal((await admin.query('SELECT count(*)::int n FROM calendar_events')).rows[0].n,1);
        await importInvitations(1,[{...base,googleEventId:'google-id'}],'google');
        assert.equal((await admin.query('SELECT count(*)::int n FROM calendar_events')).rows[0].n,1);
        await importInvitations(1,[{...base,sequence:2,title:'Updated'}]);
        await importInvitations(1,[{...base,sequence:1,title:'Stale'}]);
        assert.equal((await admin.query('SELECT title FROM calendar_events')).rows[0].title,'Updated');
        await assert.rejects(importInvitations(1,[{...base,organizer:'different@example.invalid'}]), /מארגן/);
        await importInvitations(2,[base]);
        assert.equal((await admin.query('SELECT count(*)::int n FROM calendar_events')).rows[0].n,2);
        await importInvitations(1,[{...base,sequence:3,cancelled:true}]);
        assert.equal((await admin.query('SELECT event_status FROM calendar_events WHERE owner_id=1')).rows[0].event_status,'cancelled');
        assert.equal((await admin.query('SELECT event_status FROM calendar_events WHERE owner_id=2')).rows[0].event_status,'scheduled');
        await importInvitations(1,[{...base,sequence:4,title:'No resurrection'}]);
        assert.equal((await admin.query('SELECT event_status FROM calendar_events WHERE owner_id=1')).rows[0].event_status,'cancelled');
        // Existing pre-metadata Google row binds to its immutable ID rather than inserting another row.
        await admin.query("INSERT INTO calendar_events(owner_id,google_event_id,title,start_time,end_time) VALUES(1,'old-google','old',$1,$2)",[base.startTime,base.endTime]);
        await importInvitations(1,[{...base,uid:'old-google-uid',googleEventId:'old-google'}],'google');
        assert.equal((await admin.query('SELECT count(*)::int n FROM calendar_events')).rows[0].n,3);
        await importInvitations(1,[{...base,uid:'series',recurrenceKey:'2026-11-05T08:00:00Z'},{...base,uid:'series',recurrenceKey:'2026-11-12T08:00:00Z'}]);
        await importInvitations(1,[{...base,uid:'series',sequence:1,cancelled:true}]);
        assert.equal((await admin.query("SELECT count(*)::int n FROM calendar_external_invitations i JOIN calendar_events ce ON ce.id=i.event_id WHERE i.external_uid='series' AND ce.event_status='cancelled'")).rows[0].n,2);
        // A later failure rolls back the whole file, including earlier new events.
        await assert.rejects(importInvitations(1,[{...base,uid:'should-rollback'},{...base,organizer:'wrong@example.invalid'}]));
        assert.equal((await admin.query("SELECT count(*)::int n FROM calendar_external_invitations WHERE external_uid='should-rollback'")).rows[0].n,0);
        const controller = fs.readFileSync(require.resolve('../controllers/calendarController'),'utf8');
        const start = controller.indexOf('const checkConflict ='), end = controller.indexOf('\n};',start)+3;
        const check = vm.runInNewContext(controller.slice(start,end)+'\ncheckConflict',{pool,console,_lawyerMatchSql:()=> 'ce.owner_id=$1',_sanitizeEvent:row=>row});
        await admin.query("UPDATE calendar_events SET event_type='reminder' WHERE owner_id=2");
        const answers=[]; const res={json:value=>answers.push(value),status:code=>{throw Error(`Unexpected ${code}`)}};
        const request={user:{UserId:2},body:{start_time:base.startTime,end_time:base.endTime}};
        await check(request,res); assert.equal(answers.pop().hasConflict,false);
        await admin.query("UPDATE calendar_events SET event_type='appointment' WHERE owner_id=2");
        await check(request,res); assert.equal(answers.pop().hasConflict,true);
        await check({...request,body:{...request.body,event_type:'reminder'}},res);assert.equal(answers.pop().hasConflict,false);
    } finally {if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});

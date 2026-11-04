'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { createRequire } = require('node:module');
const { remoteState, requestBody, localState, reconcile, eventId } = require('../lib/googleCalendarReconcile');
const clone = x => JSON.parse(JSON.stringify(x));

test('three-way merge preserves independent edits, conflicts and cancellations', () => {
    const base = { cancelled: false, title: 'one', description: '', location: '', time: { start: 'a', end: 'b', allDay: false } };
    assert.deepEqual(reconcile(base,base,{...base,title:'local'},{...base,location:'remote'}).value,{...base,title:'local',location:'remote'});
    assert.equal(reconcile(base,base,{...base,title:'local'},{...base,title:'remote'}).conflict,true);
    assert.equal(reconcile(base,base,{cancelled:true},{...base,title:'remote'}).conflict,true);
    assert.deepEqual(reconcile(base,base,base,{cancelled:true}).value,{cancelled:true});
    assert.equal(eventId('office-a',1,3),eventId('office-a',1,3));
    assert.notEqual(eventId('office-a',1,3),eventId('office-b',1,3));
});
test('all-day roundtrip retains civil dates across daylight saving changes', () => {
    for (const date of ['2026-03-27','2026-10-25']) {
        const end = new Date(Date.parse(date+'T00:00Z')+86400000).toISOString().slice(0,10);
        const state = remoteState({summary:'day',start:{date},end:{date:end}});
        const body=requestBody(state); assert.deepEqual(body.start,{date});assert.deepEqual(body.end,{date:end});
    }
});

function fakeGoogle(account) {
    const events = new Map(); let revision=0, inserts=0, fault=null;
    function write(value) {const e={...clone(value),etag:'"'+(++revision)+'"',updated:'2026-11-04T12:00:00Z',organizer:{email:account,self:true}};events.set(e.id,e);return clone(e);}
    const error = code => Object.assign(new Error('provider failure'),{code});
    const api = { events: {
        list: async p => {
            const values=[...events.values()].filter(e=>e.status==='cancelled'||(!p.timeMin||Date.parse(e.end?.dateTime||e.end?.date)>Date.parse(p.timeMin))&&(!p.timeMax||Date.parse(e.start?.dateTime||e.start?.date)<Date.parse(p.timeMax)));
            const start=Number(p.pageToken||0);return {data:{items:clone(values.slice(start,start+2)),nextPageToken:start+2<values.length?String(start+2):undefined}};
        },
        get: async p => {if(!events.has(p.eventId))throw error(404);return {data:clone(events.get(p.eventId))};},
        insert: async p => {
            if(events.has(p.requestBody.id))throw error(409);inserts++;
            const data=write({...p.requestBody,iCalUID:p.requestBody.id+'@google.com'});
            if(fault==='insertTimeout'){fault=null;throw error(504);}return {data};
        },
        patch: async(p,o)=>{
            const old=events.get(p.eventId);assert.ok(old);assert.equal(o.headers['If-Match'],old.etag);
            if(fault==='etag'){fault=null;write({...old,summary:'Concurrent Google edit'});throw error(412);}
            const data=write({...old,...p.requestBody});if(fault==='patchTimeout'){fault=null;throw error(504);}return {data};
        },
        delete: async(p,o)=>{const old=events.get(p.eventId);assert.equal(o.headers['If-Match'],old.etag);write({...old,status:'cancelled'});return {data:{}};},
    }, flush: async()=>{} };
    return {api,events,write,fail:kind=>{fault=kind;},inserts:()=>inserts};
}

test('PostgreSQL two-way convergence, retry, conflicts, shared participants and account boundaries', {skip: process.env.GOOGLE_SYNC_PG_TEST !== '1'}, async t => {
    const { Pool }=require('pg'); const schema='google_sync_test_'+process.pid;
    const admin=new Pool({database:'postgres'});await admin.query(`CREATE SCHEMA ${schema}`);
    const pool=new Pool({database:'postgres',options:`-c search_path=${schema}`});
    t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
    await pool.query(`CREATE TABLE users(userid integer primary key,name text,role text default 'Admin',firm_staff_role_id integer,law_firm_tenant_id uuid);
        INSERT INTO users(userid,name) VALUES(1,'one'),(2,'two');
        CREATE TABLE firm_staff_roles(id integer primary key,is_active boolean,permissions jsonb,law_firm_tenant_id uuid);
        CREATE TABLE calendar_events(id serial primary key,owner_id integer REFERENCES users(userid),title text,description text,location text,
            start_time timestamptz,end_time timestamptz,all_day boolean default false,google_event_id text,event_status text default 'scheduled',
            event_type text default 'appointment',invite_deferred_until timestamptz,reminder_offsets jsonb,lawyer_reminder_offsets jsonb,
            client_reminder_offsets jsonb,reminder_channels jsonb,reminder_targets jsonb,manager_user_id integer,manager_name text,reminders_sent_offsets jsonb,reminder_deferred_until jsonb,last_reminder_sent_at timestamptz);
        CREATE UNIQUE INDEX provider_idx ON calendar_events(owner_id,google_event_id) WHERE google_event_id IS NOT NULL;
        CREATE TABLE calendar_event_managers(event_id integer,user_id integer);
        CREATE TABLE user_calendar_tokens(user_id integer primary key,google_email text,google_scope text,google_connected boolean default true);
        INSERT INTO user_calendar_tokens VALUES(1,'one@example.invalid','https://www.googleapis.com/auth/calendar.events',true),
            (2,'two@example.invalid','https://www.googleapis.com/auth/calendar.events',true);`);
    for(const name of ['2026-11-04_01_calendar_invitations.sql','2026-11-04_05_google_calendar_two_way.sql'])await pool.query(fs.readFileSync(require.resolve('../migrations/'+name),'utf8'));
    function load(file,overrides) {const localRequire=createRequire(file),module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,console,process,require:n=>n in overrides?overrides[n]:localRequire(n)});return module.exports;}
    const imported=load(require.resolve('../services/calendarInvitationImport'),{'../config/db':pool});
    const sync=load(require.resolve('../services/googleCalendarSync'),{'./calendarInvitationImport':imported,'../lib/reminderCalendarSync':{unlinkRemindersForCalendarEvent:async()=>{},updateReminderForCalendarEvent:async()=>{}}});
    const providers={1:fakeGoogle('one@example.invalid'),2:fakeGoogle('two@example.invalid')};
    const env={PUBLIC_API_BASE_URL:'https://qa.example.invalid'};
    const run=owner=>sync.syncAccount(owner,{pool,now:Date.parse('2026-11-04T12:00:00Z'),env,settings:{getSetting:async()=>true},clientFactory:r=>providers[r.user_id].api});
    const create=async(title,owner=1)=> (await pool.query(`INSERT INTO calendar_events(owner_id,title,start_time,end_time) VALUES($1,$2,'2026-11-05T08:00Z','2026-11-05T09:00Z') RETURNING *`,[owner,title])).rows[0];
    const row=async id=>(await pool.query('SELECT * FROM calendar_events WHERE id=$1',[id])).rows[0];
    const link=async(id,owner=1)=>(await pool.query('SELECT * FROM calendar_google_links WHERE local_key=$1 AND owner_id=$2',[id,owner])).rows[0];
    const local=await create('Initial');
    assert.equal((await run(1)).failed,0);await run(1);assert.equal(providers[1].inserts(),1);
    const remoteId=(await link(local.id)).remote_id;
    assert.equal((await row(local.id)).google_event_id,remoteId);
    // Import the same invitation from email after export: no duplicate.
    await imported.importInvitations(1,[{uid:remoteId+'@google.com',organizer:'one@example.invalid',recurrenceKey:'',sequence:0,title:'Initial',startTime:'2026-11-05T08:00Z',endTime:'2026-11-05T09:00Z',allDay:false}]);
    assert.equal((await pool.query('SELECT count(*)::int n FROM calendar_events')).rows[0].n,1);
    providers[1].write({...providers[1].events.get(remoteId),summary:'Google update'});await run(1);assert.equal((await row(local.id)).title,'Google update');
    await pool.query('UPDATE calendar_events SET location=$2 WHERE id=$1',[local.id,'Office']);await run(1);assert.equal(providers[1].events.get(remoteId).location,'Office');
    // Independent changes merge without loss.
    await pool.query('UPDATE calendar_events SET title=$2 WHERE id=$1',[local.id,'Local name']);providers[1].write({...providers[1].events.get(remoteId),description:'Remote notes'});
    await run(1);assert.equal((await row(local.id)).description,'Remote notes');assert.equal(providers[1].events.get(remoteId).summary,'Local name');
    // A real conflict stays visible until explicitly resolved; stale choices do not overwrite newer edits.
    await pool.query('UPDATE calendar_events SET title=$2 WHERE id=$1',[local.id,'Local competing']);providers[1].write({...providers[1].events.get(remoteId),summary:'Google competing'});
    assert.equal((await run(1)).conflicts,1);assert.equal((await row(local.id)).title,'Local competing');
    await pool.query("UPDATE calendar_google_links SET resolution='local' WHERE local_key=$1",[local.id]);await run(1);assert.equal(providers[1].events.get(remoteId).summary,'Local competing');
    // Timeout after accepted insert is recovered with the same ID, never duplicated.
    const crash=await create('Crash');providers[1].fail('insertTimeout');assert.equal((await run(1)).failed,1);const count=providers[1].inserts();await run(1);assert.equal(providers[1].inserts(),count);
    await pool.query('UPDATE calendar_events SET title=$2 WHERE id=$1',[crash.id,'Crash edit']);providers[1].fail('patchTimeout');await run(1);await run(1);assert.equal((await link(crash.id)).conflict,null);
    await pool.query(`UPDATE calendar_events SET reminders_sent_offsets='["lawyer:0","lawyer:30"]'::jsonb WHERE id=$1`,[local.id]);
    // Missing from the time window is retrieved by ID, not silently cancelled.
    providers[1].write({...providers[1].events.get(remoteId),start:{dateTime:'2028-11-05T08:00:00Z'},end:{dateTime:'2028-11-05T09:00:00Z'}});await run(1);
    assert.equal(new Date((await row(local.id)).start_time).getUTCFullYear(),2028);
    assert.deepEqual((await row(local.id)).reminders_sent_offsets,['lawyer:0']);
    // Cancellation on either side and hard-delete tombstone propagation.
    await pool.query("UPDATE calendar_events SET event_status='cancelled' WHERE id=$1",[local.id]);await run(1);assert.equal(providers[1].events.get(remoteId).status,'cancelled');
    const hard=await create('Delete');await run(1);const hardId=(await link(hard.id)).remote_id;await pool.query('DELETE FROM calendar_events WHERE id=$1',[hard.id]);await run(1);assert.equal(providers[1].events.get(hardId).status,'cancelled');
    const incoming=providers[1].write({id:'external',iCalUID:'external@google.com',summary:'External',start:{dateTime:'2026-11-07T08:00:00Z'},end:{dateTime:'2026-11-07T09:00:00Z'}});
    await run(1);providers[1].write({...incoming,status:'cancelled'});await run(1);assert.equal((await pool.query("SELECT event_status FROM calendar_events WHERE google_event_id='external'")).rows[0].event_status,'cancelled');
    // A shared office event is one row, one copy per manager; participant deletion does not cancel it.
    const shared=await create('Shared');await pool.query('INSERT INTO calendar_event_managers VALUES($1,1),($1,2)',[shared.id]);await run(1);await run(2);
    const participant=(await link(shared.id,2)).remote_id;assert.ok(participant);await run(2);
    assert.equal((await pool.query("SELECT count(*)::int n FROM calendar_events WHERE title='Shared'")).rows[0].n,1);
    providers[2].write({...providers[2].events.get(participant),status:'cancelled'});await run(2);await run(2);
    assert.equal((await row(shared.id)).event_status,'scheduled');assert.equal((await link(shared.id,2)).suppressed,true);
    // Existing Google invitations for a shared event must not create a second
    // platform event or an extra exported copy for the invited manager.
    const invited=await create('Shared invitation');
    await pool.query('INSERT INTO calendar_event_managers VALUES($1,1),($1,2)',[invited.id]);await run(1);
    const inviterRemote=providers[1].events.get((await link(invited.id)).remote_id);
    providers[2].events.set('received-shared',{...clone(inviterRemote),id:'received-shared',organizer:{email:'one@example.invalid',self:false}});
    const insertsBefore=providers[2].inserts();await run(2);await run(2);
    assert.equal((await link(invited.id,2)).remote_id,'received-shared');
    assert.equal(providers[2].inserts(),insertsBefore);
    assert.equal((await pool.query("SELECT count(*)::int n FROM calendar_events WHERE title='Shared invitation'")).rows[0].n,1);
    // A Google edit racing our patch cannot be overwritten; a stale resolution cannot win later.
    const race=await create('Race');await run(1);const raceId=(await link(race.id)).remote_id;
    await pool.query('UPDATE calendar_events SET title=$2 WHERE id=$1',[race.id,'Local race']);
    providers[1].fail('etag');assert.equal((await run(1)).failed,1);
    assert.equal(providers[1].events.get(raceId).summary,'Concurrent Google edit');
    assert.equal((await run(1)).conflicts,1);
    await pool.query("UPDATE calendar_google_links SET resolution='local' WHERE local_key=$1",[race.id]);
    providers[1].write({...providers[1].events.get(raceId),summary:'Newer Google edit'});
    await run(1);assert.ok((await link(race.id)).conflict);assert.equal(providers[1].events.get(raceId).summary,'Newer Google edit');
    await pool.query("UPDATE calendar_google_links SET resolution='google' WHERE local_key=$1",[race.id]);await run(1);assert.equal((await row(race.id)).title,'Newer Google edit');
    // Another worker/manual request cannot enter this account while its session lock is held.
    const lock=await pool.connect();await lock.query("SELECT pg_advisory_lock(hashtext('google-calendar-sync'),1)");
    assert.equal((await run(1)).busy,true);await lock.query("SELECT pg_advisory_unlock(hashtext('google-calendar-sync'),1)");lock.release();
    // Received invitations do not grant organizer edit rights.
    const readOnly=providers[1].write({id:'guest',summary:'Guest appointment',start:{dateTime:'2026-11-06T08:00:00Z'},end:{dateTime:'2026-11-06T09:00:00Z'}});
    providers[1].events.set('guest',{...readOnly,organizer:{email:'organizer@example.invalid',self:false}});
    await run(1);const guest=(await pool.query("SELECT * FROM calendar_events WHERE google_event_id='guest'")).rows[0];
    await pool.query('UPDATE calendar_events SET title=$2 WHERE id=$1',[guest.id,'Local guest edit']);await run(1);
    assert.equal((await link(guest.id)).conflict.reason,'readOnly');assert.equal(providers[1].events.get('guest').summary,'Guest appointment');
    await pool.query("UPDATE calendar_google_links SET resolution='google' WHERE local_key=$1",[guest.id]);await run(1);assert.equal((await row(guest.id)).title,'Guest appointment');
    // QA permits only the named test account and prefixed new records, in BOTH directions.
    Object.assign(env,{QA_OUTBOUND_MODE:'noop',GOOGLE_SYNC_QA_ACCOUNT:'one@example.invalid',GOOGLE_SYNC_QA_PREFIX:'QA-GSYNC-'});
    const excluded=await create('Ordinary private event'),included=await create('QA-GSYNC-new');
    providers[1].write({id:'private-remote',summary:'Private remote',start:{dateTime:'2026-11-06T08:00:00Z'},end:{dateTime:'2026-11-06T09:00:00Z'}});
    providers[1].write({id:'qa-remote',summary:'QA-GSYNC-remote',start:{dateTime:'2026-11-06T08:00:00Z'},end:{dateTime:'2026-11-06T09:00:00Z'}});
    await run(1);assert.equal(await link(excluded.id),undefined);assert.ok(await link(included.id));
    assert.equal((await pool.query("SELECT count(*)::int n FROM calendar_events WHERE google_event_id='private-remote'")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM calendar_events WHERE google_event_id='qa-remote'")).rows[0].n,1);
    await assert.rejects(run(2),/QA_ACCOUNT/);
    delete env.QA_OUTBOUND_MODE;delete env.GOOGLE_SYNC_QA_ACCOUNT;delete env.GOOGLE_SYNC_QA_PREFIX;
    // Removed permission stops BOTH directions. Reusing another account cannot reuse the old links.
    await pool.query("UPDATE users SET role='Client' WHERE userid=1");await assert.rejects(run(1),/ACCESS_REMOVED/);await pool.query("UPDATE users SET role='Admin' WHERE userid=1");
    await pool.query("UPDATE user_calendar_tokens SET google_email='changed@example.invalid' WHERE user_id=1");await assert.rejects(run(1),/ORIGINAL_ACCOUNT_REQUIRED/);
    assert.throws(()=>sync.assertBoundary({google_email:'one@example.invalid'}, {MULTI_TENANT_MODE:'true'}),/ISOLATION/);
    assert.throws(()=>sync.assertBoundary({google_email:'one@example.invalid'}, {QA_OUTBOUND_MODE:'noop'}),/QA_ACCOUNT/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');
const { invitationDelivery } = require('../lib/calendarInviteDelivery');
const { localState, requestBody } = require('../lib/googleCalendarReconcile');

test('invitation receipts never confuse reminder acceptance with invitation delivery', () => {
    assert.equal(invitationDelivery({reminders_sent_offsets:['receipt:client:0:abc:sms']}).status, 'unsent');
    assert.deepEqual(invitationDelivery({reminders_sent_offsets:['invite:abc:sms']}), {status:'sent',channels:['sms'],deferredUntil:null});
    assert.equal(invitationDelivery({reminders_sent_offsets:['invite-claim:abc:email:123']}).status, 'uncertain');
    assert.equal(invitationDelivery({invite_deferred_until:'later'}).status, 'deferred');
});

test('office notes roundtrip privately, personal home visibility and lead RSVP', async () => {
    const db = new PGlite();
    const pool = { query: (sql, args) => db.query(sql, args), connect: async () => ({query:(sql,args)=>db.query(sql,args),release(){}}) };
    try {
        await db.exec(`
            CREATE TABLE users(userid int primary key,name text,email text,phonenumber text);
            INSERT INTO users VALUES(1,'First','one@example.invalid','0500000001'),(2,'Second','two@example.invalid','0500000002');
            CREATE TABLE calendar_events(id serial primary key, owner_id int, title text, description text, location text,
                case_id int, client_user_id int,client_name text,manager_user_id int,manager_name text,color text,
                start_time timestamptz,end_time timestamptz,all_day boolean,rrule text,event_type text default 'appointment',
                meeting_type text,lead_name text,lead_phone text,lead_email text,lead_case_name text,lead_participants jsonb,
                reminder_offsets jsonb,reminder_channels jsonb,reminder_targets jsonb,reminders_sent_offsets jsonb,
                lawyer_reminder_offsets jsonb,client_reminder_offsets jsonb,last_reminder_sent_at timestamptz,
                invite_status text default 'none',invite_token text,invite_responded_at timestamptz,invite_deferred_until timestamptz,
                client_reminder_sms text,invite_sms text,google_event_id text,outlook_event_id text,
                event_status text default 'scheduled',cancelled_at timestamptz,cancelled_by int,updated_by int,
                created_at timestamptz default now(),updated_at timestamptz default now());
            CREATE TABLE calendar_event_managers(event_id int,user_id int,sort_order int);
            CREATE TABLE calendar_event_clients(event_id int,user_id int,sort_order int,invite_token text,invite_status text,invite_responded_at timestamptz);
            CREATE TABLE scheduled_email_reminders(id serial,calendar_event_id int);
            CREATE TABLE user_calendar_tokens(user_id int,ical_feed_token text);
            INSERT INTO user_calendar_tokens VALUES(1,'synthetic-feed');
        `);
        await db.exec(fs.readFileSync(require.resolve('../migrations/2026-11-17_01_calendar_office_notes.sql'),'utf8'));
        const file = require.resolve('../controllers/calendarController');
        const req = createRequire(file), module = {exports:{}};
        const reminders = req('../lib/calendarEventReminders');
        const stubs = {
            '../config/db':pool,
            '../utils/operationalDashboardCache':{invalidateOperationalDashboardCaches(){}},
            '../lib/firmBranding':{getLawFirmNameHe:async()=> 'Synthetic',getFirmNameEn:async()=> 'Synthetic'},
            '../services/settingsService':{getSetting:async()=>null,isPlatformAdmin:async()=>true},
            '../lib/calendarEventReminders':{...reminders, loadAllowedReminderOffsets:async()=>[0,30,60],loadAllowedReminderChannels:async()=>['push','sms','email']},
            '../lib/reminderCalendarSync':{updateReminderForCalendarEvent:async()=>null},
            '../services/managerHome/platformActivity':{recordCalendarCreated:async()=>{}},
            '../tasks/calendarReminders/scheduler':{fireImmediateRemindersForEvent:async()=>({sent:0})},
            '../utils/sendMessage':{sendMessage:async()=>{throw new Error('No external sends permitted');}},
            '../utils/smooveEmailCampaignService':{sendTransactionalCustomHtmlEmail:async()=>{throw new Error('No external sends permitted');}},
        };
        vm.runInNewContext(fs.readFileSync(file,'utf8'), {module,require:name=>name in stubs?stubs[name]:req(name),console,process,Buffer,URL,Date});
        const api=module.exports;
        async function call(name, body={}, params={}) {
            const response={code:200,status(v){this.code=v;return this;},json(v){this.body=v;return this;},setHeader(){},send(v){this.body=v;return this;},type(){return this;}};
            await api[name]({user:{UserId:1,Role:'Admin'},body,params,query:{}},response);
            assert.ok(response.code<400,JSON.stringify(response.body));return response.body;
        }
        const today=new Date();today.setHours(12,0,0,0);const end=new Date(+today+3600000);
        const draft={title:'Office test',description:'Public description',office_notes:'PRIVATE parcel 00123',event_type:'appointment',start_time:today.toISOString(),end_time:end.toISOString(),send_invitation:false,lawyer_reminder_offsets:[],client_reminder_offsets:[],reminder_channels:{push:false,sms:false,email:false},lead_name:'Synthetic lead',lead_email:'lead@example.invalid'};
        const created=(await call('createEvent',draft)).event;assert.equal(created.officeNotes,draft.office_notes);
        const id=created.id;
        assert.equal((await call('getEvent',{}, {id})).event.officeNotes,draft.office_notes);
        assert.equal((await call('updateEvent',{office_notes:'PRIVATE changed'},{id})).event.officeNotes,'PRIVATE changed');
        assert.equal((await call('updateEvent',{title:'Changed title'},{id})).event.officeNotes,'PRIVATE changed');
        await db.query("UPDATE calendar_events SET invite_token='synthetic-invite',invite_status='pending' WHERE id=$1",[id]);
        const publicInvite=await call('getInviteByToken',{}, {token:'synthetic-invite'});
        assert.equal(publicInvite.invite.description,'Public description');assert.ok(!JSON.stringify(publicInvite).includes('PRIVATE'));assert.ok(!('officeNotes' in publicInvite.invite));
        const row=(await db.query('SELECT * FROM calendar_events WHERE id=$1',[id])).rows[0];
        assert.ok(!JSON.stringify(requestBody(localState(row))).includes('PRIVATE'));
        const feed=await call('serveIcalFeed',{}, {token:'synthetic-feed'});assert.ok(String(feed).includes('Public description'));assert.ok(!String(feed).includes('PRIVATE'));
        await call('respondToInvite',{action:'accept'},{token:'synthetic-invite'});
        assert.equal((await call('getEvent',{}, {id})).event.inviteStatus,'accepted');
        await call('respondToInvite',{action:'decline'},{token:'synthetic-invite'});
        assert.equal((await call('getEvent',{}, {id})).event.inviteStatus,'declined');
        const foreign=(await db.query("INSERT INTO calendar_events(owner_id,title,start_time,end_time) VALUES(2,'Foreign',$1,$2) RETURNING id",[today,end])).rows[0].id;
        const home=await call('getTodayAndTomorrow');assert.ok(home.events.some(e=>e.id===id));assert.ok(!home.events.some(e=>e.id===foreign));
        assert.equal((await call('updateEvent',{office_notes:''},{id})).event.officeNotes,'');
    } finally {await db.close();}
});

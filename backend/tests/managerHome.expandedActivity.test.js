const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { fetchTeamActivity } = require('../services/managerHome/teamActivity');
const { recordCaseOpened, recordCalendarCreated } = require('../services/managerHome/platformActivity');
const migration = fs.readFileSync(path.join(__dirname,'../migrations/2026-10-16_00_manager_platform_activity.sql'),'utf8');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

async function database(t) {
    const db = new PGlite(); t.after(() => db.close());
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY);
        INSERT INTO law_firm_tenants VALUES ('${A}'),('${B}');
        CREATE TABLE users(userid int PRIMARY KEY,name text,role text,law_firm_tenant_id uuid);
        INSERT INTO users VALUES(1,'Creator','Admin','${A}'),(2,'Colleague','Lawyer','${A}'),
            (3,'Customer','User','${A}'),(4,'Other office','Lawyer','${B}');
        CREATE TABLE cases(caseid int PRIMARY KEY,createdat timestamptz DEFAULT now(),isclosed boolean DEFAULT false,
            closed_at timestamptz,closed_by_userid int,casemanagerid int,law_firm_tenant_id uuid);
        INSERT INTO cases(caseid,casemanagerid,law_firm_tenant_id) VALUES(1,2,'${A}'),(2,4,'${B}');
        CREATE TABLE calendar_events(id int PRIMARY KEY,case_id int,owner_id int,event_type text,law_firm_tenant_id uuid);
        INSERT INTO calendar_events VALUES(1,1,2,'appointment','${A}'),(2,NULL,1,'hearing','${A}'),
            (3,NULL,1,'reminder','${A}'),(4,NULL,1,'leave','${A}'),(5,NULL,1,'holiday','${A}'),(6,2,4,'appointment','${B}');
        CREATE TABLE manager_case_activity(actor_id int,caseid int,occurred_at timestamptz,kind text);
        CREATE TABLE stage_files(uploaded_by int,caseid int,created_at timestamptz);
        CREATE TABLE signingfiles(signingfileid int,caseid int,lawyerid int,createdat timestamptz,signedat timestamptz,status text);
        CREATE TABLE audit_events(actor_userid int,signingfileid int,occurred_at_utc timestamptz,event_type text,actor_type text,success boolean);`);
    await db.exec(migration);
    return db;
}
const activity = (db, at='2026-11-16T12:00:00Z') => fetchTeamActivity(db,{now:new Date(at)});

test('November retains uploads and signing work; linked documents count separately and repeated preparation is capped', async t => {
    const db = await database(t);
    await db.exec(`INSERT INTO signingfiles VALUES(10,1,1,'2026-11-15T08:00:00Z'),(11,1,1,'2026-11-15T08:00:00Z');
        INSERT INTO stage_files VALUES(1,1,'2026-11-15T08:00:00Z'),(1,1,'2026-11-15T09:00:00Z');
        INSERT INTO audit_events VALUES(1,10,'2026-11-15T08:00:00Z','SIGNING_POLICY_SELECTED','lawyer',true),
            (1,10,'2026-11-15T09:00:00Z','DOCUMENT_REUPLOADED','lawyer',true),
            (1,10,'2026-11-15T10:00:00Z','SIGNING_INVITE_RESENT','lawyer',true),
            (2,10,'2026-11-15T11:00:00Z','SIGNER_CONTACT_UPDATED','lawyer',true);`);
    const result = await activity(db);
    assert.equal(result.historyMode,null);
    assert.equal(result.scoringVersion,'platform-day-v2');
    assert.deepEqual(result.periods.month.leaders.map(x=>[x.managerId,x.points,x.signingActions,x.documentUploads]),[[1,3,2,1],[2,1,1,0]]);
});

test('completed document outcome belongs to its staff creator once, not to signer or assigned manager', async t => {
    const db = await database(t);
    await db.exec(`INSERT INTO signingfiles VALUES
        (10,1,1,'2026-10-01T08:00:00Z','2026-11-15T08:00:00Z','signed'),
        (11,NULL,1,'2026-10-01T08:00:00Z','2026-11-15T08:00:00Z','signed'),
        (12,1,3,'2026-10-01T08:00:00Z','2026-11-15T08:00:00Z','signed'),
        (13,1,1,'2026-10-01T08:00:00Z','2026-11-15T08:00:00Z','pending'),
        (14,1,1,'2026-10-01T08:00:00Z',NULL,'signed'),
        (15,1,4,'2026-10-01T08:00:00Z','2026-11-15T08:00:00Z','signed'),
        (16,1,1,'2026-10-01T08:00:00Z','2026-11-16T12:00:01Z','signed');
        INSERT INTO audit_events VALUES(3,10,'2026-11-15T08:00:00Z','SIGN_SUCCESS','signer',true),
            (3,10,'2026-11-15T08:00:01Z','SIGN_SUCCESS','signer',true);`);
    assert.deepEqual((await activity(db)).periods.month.leaders.map(x=>[x.managerId,x.points,x.signingCompleted]),[[1,2,2]]);
});

test('failed, system, viewing and client actions cannot inflate expanded signature points', async t => {
    const db = await database(t);
    await db.exec(`INSERT INTO signingfiles VALUES(10,1,1,'2026-10-01T08:00:00Z');
        INSERT INTO audit_events VALUES
        (1,10,'2026-11-15T08:00:00Z','DOCUMENT_REUPLOADED','lawyer',false),
        (1,10,'2026-11-15T08:00:00Z','SIGNING_INVITE_RESENT','system',true),
        (1,10,'2026-11-15T08:00:00Z','PDF_VIEWED','lawyer',true),
        (3,10,'2026-11-15T08:00:00Z','SIGNING_POLICY_SELECTED','lawyer',true),
        (4,10,'2026-11-15T08:00:00Z','SIGNER_CONTACT_UPDATED','lawyer',true);`);
    assert.deepEqual((await activity(db)).periods.month.leaders,[]);
});

test('creation recorder credits authenticated creator, is idempotent, and excludes unknown, client and cross-office actors', async t => {
    const db = await database(t);
    await db.exec(migration); // repeatable migration, no historical inserts
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_platform_activity')).rows[0].n,0);
    await recordCaseOpened(db,1,1); await recordCaseOpened(db,1,1);
    for (const actor of [null,3,4]) await recordCaseOpened(db,actor,1);
    await recordCaseOpened(db,1,2);
    await recordCalendarCreated(db,1,1); await recordCalendarCreated(db,1,1);
    for (const id of [2,3,4,5,6]) await recordCalendarCreated(db,1,id);
    const rows=(await db.query('SELECT actor_id,kind,activity_key FROM manager_platform_activity ORDER BY id')).rows;
    assert.deepEqual(rows, [
        {actor_id:1,kind:'case_open',activity_key:'case:1'},
        {actor_id:1,kind:'calendar',activity_key:'calendar:1'},
        {actor_id:1,kind:'calendar',activity_key:'calendar:2'},
        {actor_id:1,kind:'calendar',activity_key:'calendar:3'},
    ]);
    await db.exec("UPDATE manager_platform_activity SET occurred_at='2026-11-15T08:00:00Z'");
    const leader=(await activity(db)).periods.month.leaders[0];
    assert.equal(leader.managerId,1); assert.equal(leader.points,4);
    assert.equal(leader.casesCreated,1); assert.equal(leader.calendarActions,3);
});

test('rolled-back creation earns nothing, and later reassignment cannot steal creation points', async t => {
    const db=await database(t);
    await db.exec('BEGIN'); await recordCaseOpened(db,1,1); await recordCalendarCreated(db,1,1); await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_platform_activity')).rows[0].n,0);
    await recordCaseOpened(db,1,1); await recordCalendarCreated(db,1,1);
    await db.exec("UPDATE cases SET casemanagerid=2; UPDATE calendar_events SET owner_id=2; UPDATE manager_platform_activity SET occurred_at='2026-11-15T08:00:00Z'");
    assert.deepEqual((await activity(db)).periods.month.leaders.map(x=>[x.managerId,x.points]),[[1,2]]);
});

test('new activity uses Israel date boundaries and never merges unrelated case/document/event IDs', async t => {
    const db=await database(t);
    await recordCaseOpened(db,1,1); await recordCalendarCreated(db,1,1);
    await db.exec(`UPDATE manager_platform_activity SET occurred_at='2026-10-31T22:00:00Z';
        INSERT INTO signingfiles VALUES(1,1,1,'2026-10-31T22:00:00Z');
        INSERT INTO stage_files VALUES(1,1,'2026-10-31T21:59:59Z'),(1,1,'2026-10-31T22:00:01Z');`);
    const result=await activity(db,'2026-10-31T22:00:00Z');
    assert.equal(result.periods.today.startsOn,'2026-11-01');
    assert.equal(result.periods.today.leaders[0].points,3);
    assert.equal(result.periods.today.leaders[0].documentUploads,0);
});

test('shared office RLS and reference guards isolate the new recorder under an application role', async t => {
    const db=await database(t);
    const installer=fs.readFileSync(path.join(__dirname,'../scripts/install-office-isolation.js'),'utf8');
    for (const name of ['office_scope_id','guard_office_owner']) {
        const match=installer.match(new RegExp('await client\\.query\\(`(CREATE OR REPLACE FUNCTION public\\.'+name+'[\\s\\S]*?)`\\);'));
        assert.ok(match); await db.exec(match[1]);
    }
    await db.exec('CREATE ROLE scoring_app NOSUPERUSER NOBYPASSRLS; GRANT SELECT,INSERT ON users,cases,calendar_events TO scoring_app;');
    await db.exec(migration);
    await db.exec(`SET ROLE scoring_app; SELECT set_config('app.office_mode','office',false),set_config('app.office_id','${A}',false);`);
    await recordCaseOpened(db,1,1); await recordCalendarCreated(db,1,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_platform_activity')).rows[0].n,2);
    await assert.rejects(db.exec(`INSERT INTO manager_platform_activity(law_firm_tenant_id,actor_id,caseid,kind,activity_key) VALUES('${A}',4,1,'case_open','case:99')`),/outside the current office/);
    await assert.rejects(db.exec(`INSERT INTO manager_platform_activity(law_firm_tenant_id,actor_id,caseid,kind,activity_key) VALUES('${A}',1,2,'case_open','case:2')`),/outside the current office/);
    await db.exec(`SELECT set_config('app.office_id','${B}',false)`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_platform_activity')).rows[0].n,0);
    await recordCaseOpened(db,4,2);
    assert.equal((await db.query('SELECT actor_id FROM manager_platform_activity')).rows[0].actor_id,4);
});

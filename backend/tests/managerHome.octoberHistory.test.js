const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { fetchTeamActivity } = require('../services/managerHome/teamActivity');

async function database(t) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE TABLE users(userid int PRIMARY KEY,name text,role text,law_firm_tenant_id uuid);
        CREATE TABLE cases(caseid int PRIMARY KEY,createdat timestamptz,isclosed boolean DEFAULT false,closed_at timestamptz,closed_by_userid int,law_firm_tenant_id uuid);
        CREATE TABLE manager_case_activity(actor_id int,caseid int,occurred_at timestamptz,kind text);
        CREATE TABLE stage_files(uploaded_by int,caseid int,created_at timestamptz);
        CREATE TABLE signingfiles(signingfileid int,caseid int,lawyerid int,createdat timestamptz);
        CREATE TABLE audit_events(actor_userid int,signingfileid int,occurred_at_utc timestamptz,event_type text,actor_type text,success boolean);
        INSERT INTO users VALUES (1,'A','Lawyer','11111111-1111-4111-8111-111111111111'),(2,'B','Admin','11111111-1111-4111-8111-111111111111'),
            (3,'Client','Client','11111111-1111-4111-8111-111111111111'),(4,'Other office','Lawyer','22222222-2222-4222-8222-222222222222');
        INSERT INTO cases(caseid,createdat,law_firm_tenant_id) VALUES(1,'2026-10-01T06:00:00Z','11111111-1111-4111-8111-111111111111');
        INSERT INTO signingfiles VALUES(10,1);
    `);
    return db;
}
const get = (db, date = '2026-10-16T09:00:00Z') => fetchTeamActivity(db, {now:new Date(date)});

test('October history credits standalone signing creation and audit once per document and day', async t => {
    const db = await database(t);
    await db.exec(`INSERT INTO signingfiles VALUES(11,NULL,1,'2026-10-05T08:00:00Z'),(12,NULL,1,'2026-10-05T08:00:00Z');
        INSERT INTO audit_events VALUES(1,11,'2026-10-05T08:00:00Z','PUBLIC_LINK_ISSUED','lawyer',true),
            (1,11,'2026-10-05T09:00:00Z','SIGNING_INVITE_RESENT','lawyer',true),
            (4,11,'2026-10-05T09:00:00Z','PUBLIC_LINK_ISSUED','lawyer',true)`);
    const leaders = (await get(db)).periods.month.leaders;
    assert.deepEqual(leaders.map(v => [v.managerId,v.points,v.signingActions,v.casesTouched]), [[1,2,2,0]]);
});

test('October history does not turn orphaned case-linked documents into standalone credit', async t => {
    const db = await database(t);
    await db.exec("INSERT INTO signingfiles VALUES(11,999,1,'2026-10-05T08:00:00Z'),(12,NULL,NULL,'2026-10-05T08:00:00Z')");
    assert.deepEqual((await get(db)).periods.month.leaders, []);
});

test('October history includes identified closures before the recorder started', async t => {
    const db = await database(t);
    await db.exec("UPDATE cases SET isclosed=true,closed_at='2026-10-05T08:00:00Z',closed_by_userid=1");
    const result = await get(db);
    assert.equal(result.historyMode, 'october-2026');
    assert.equal(result.periods.month.leaders[0].points, 1);
    assert.equal(result.periods.month.leaders[0].casesClosed, 1);
    assert.equal(result.periods.week.leaders.length, 0);
});

test('October history caps uploads per case and local day, with a separate breakdown', async t => {
    const db = await database(t);
    await db.exec("INSERT INTO stage_files VALUES(1,1,'2026-10-05T08:00:00Z'),(1,1,'2026-10-05T09:00:00Z'),(1,1,'2026-10-06T09:00:00Z')");
    const leader = (await get(db)).periods.month.leaders[0];
    assert.equal(leader.points, 2);
    assert.equal(leader.documentUploads, 2);
    assert.equal(leader.caseUpdates, 0);
});

test('October history includes staff signing actions, excluding failed, viewing, client and anonymous events', async t => {
    const db = await database(t);
    await db.exec(`INSERT INTO audit_events VALUES
        (1,10,'2026-10-05T08:00:00Z','PUBLIC_LINK_ISSUED','lawyer',true),
        (1,10,'2026-10-05T09:00:00Z','SIGNING_INVITE_RESENT','lawyer',true),
        (2,10,'2026-10-05T08:00:00Z','PUBLIC_LINK_ISSUED','admin',false),
        (2,10,'2026-10-05T08:00:00Z','EVIDENCE_PACKAGE_VIEWED','admin',true),
        (3,10,'2026-10-05T08:00:00Z','PUBLIC_LINK_ISSUED','client',true),
        (NULL,10,'2026-10-05T08:00:00Z','PUBLIC_LINK_ISSUED','lawyer',true)`);
    const leaders = (await get(db)).periods.month.leaders;
    assert.equal(leaders.length, 1);
    assert.equal(leaders[0].managerId, 1);
    assert.equal(leaders[0].signingActions, 1);
    assert.equal(leaders[0].points, 1);
});

test('October history does not double-credit a closure also present in the new recorder', async t => {
    const db = await database(t);
    await db.exec("UPDATE cases SET isclosed=true,closed_at='2026-10-15T08:00:00Z',closed_by_userid=1; INSERT INTO manager_case_activity VALUES(1,1,'2026-10-15T08:00:00Z','close')");
    assert.equal((await get(db)).periods.month.leaders[0].points, 1);
});

test('October history rejects cross-office actors and missing, past-month or future timestamps', async t => {
    const db = await database(t);
    await db.exec("INSERT INTO stage_files VALUES(4,1,'2026-10-05T08:00:00Z'),(1,1,NULL),(1,1,'2026-09-30T20:59:59Z'),(1,1,'2026-10-16T09:00:01Z')");
    assert.deepEqual((await get(db)).periods.month.leaders, []);
});

test('October history switches off at November 1 Israel midnight and never recurs', async t => {
    const db = await database(t);
    await db.exec("INSERT INTO stage_files VALUES(2,1,'2026-10-31T21:59:59Z'),(2,1,'2026-10-31T22:00:00Z'); INSERT INTO manager_case_activity VALUES(1,1,'2026-10-31T22:00:00Z','update')");
    assert.equal((await get(db,'2026-10-31T21:59:59Z')).periods.month.leaders[0].managerId, 2);
    // November must not even query the historical tables.
    await db.exec('DROP TABLE stage_files,audit_events,signingfiles');
    const november = await get(db,'2026-10-31T22:00:00Z');
    assert.equal(november.historyMode, null);
    assert.equal(november.scoringVersion, 'recorded-case-day-v1');
    assert.deepEqual(november.periods.month.leaders.map(v => [v.managerId,v.points,v.documentUploads]), [[1,1,0]]);
    assert.deepEqual((await get(db,'2027-10-16T09:00:00Z')).periods.month.leaders, []);
});

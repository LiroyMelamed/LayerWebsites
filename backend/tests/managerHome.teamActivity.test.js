const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const { fetchTeamActivity } = require('../services/managerHome/teamActivity');

async function database(t) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE TABLE users(userid int PRIMARY KEY, name text, role text);
        CREATE TABLE cases(caseid int PRIMARY KEY, createdat timestamptz, isclosed boolean DEFAULT false,
            closed_at timestamptz, closed_by_userid int, casemanagerid int);
        CREATE TABLE casedescriptions(caseid int, timestamp timestamptz, updated_by_userid int);
        CREATE TABLE manager_case_activity(caseid int, occurred_at timestamptz, actor_id int, kind text DEFAULT 'update');
        CREATE TABLE stage_files(uploaded_by int, caseid int, created_at timestamptz);
        CREATE TABLE signingfiles(signingfileid int, caseid int, lawyerid int, createdat timestamptz);
        CREATE TABLE audit_events(actor_userid int, signingfileid int, occurred_at_utc timestamptz, event_type text, actor_type text, success boolean);
        INSERT INTO users VALUES (1,'First','Admin'),(2,'Second','Lawyer'),(3,'Client','Client'),(4,'Assigned only','Lawyer');
    `);
    return db;
}

test('ranking credits actual actors, caps daily edits, excludes clients and future records, and shares ties', async t => {
    const db = await database(t);
    await db.exec(`
        INSERT INTO cases VALUES
        (1,'2026-10-15T08:00:00+03',true,'2026-10-15T09:00:00+03',1,4),
        (2,'2026-10-15T08:00:00+03',true,'2026-10-15T09:00:00+03',2,4),
        (3,'2026-10-16T08:00:00+03',true,'2026-10-16T09:00:00+03',1,4);
        INSERT INTO manager_case_activity(caseid,occurred_at,actor_id) VALUES
        (1,'2026-10-15T08:00:00+03',1),(1,'2026-10-15T08:30:00+03',1),
        (2,'2026-10-15T08:00:00+03',2),(1,'2026-10-15T08:30:00+03',3),
        (1,'2026-10-15T08:30:00+03',NULL),(3,'2026-10-16T08:30:00+03',1),
        (1,'2026-10-14T08:00:00+03',1),(1,'2026-10-05T08:00:00+03',2);
    `);
    await db.exec(`UPDATE manager_case_activity SET kind='update'; INSERT INTO manager_case_activity VALUES (1,'2026-10-15T09:00:00+03',1,'close'),(2,'2026-10-15T09:00:00+03',2,'close'),(3,'2026-10-16T09:00:00+03',1,'close');`);
    const { periods } = await fetchTeamActivity(db, { now: new Date('2026-10-15T12:00:00+03:00') });
    assert.deepEqual(periods.today.leaders.map(p => [p.managerId, p.points, p.rank, p.caseUpdates, p.casesClosed]),
        [[1,2,1,1,1], [2,2,1,1,1]]);
    assert.equal(periods.today.casesOpened, 2);
    assert.equal(periods.today.casesClosed, 2);
    assert.deepEqual(periods.week.leaders.map(p => [p.managerId,p.points,p.rank]), [[1,3,1],[2,2,2]]);
    assert.deepEqual(periods.month.leaders.map(p => [p.managerId,p.points,p.rank]), [[1,3,1],[2,3,1]]);
});

test('Sunday and month boundaries use Israel time, including weeks crossing months', async t => {
    const db = await database(t);
    await db.exec(`
        INSERT INTO cases VALUES (1,'2026-09-26T20:59:59Z'), (2,'2026-09-26T21:00:00Z'),
            (3,'2026-09-30T20:59:59Z'), (4,'2026-09-30T21:00:00Z'),(5,'2026-10-01T09:00:01Z');
    `);
    const { periods } = await fetchTeamActivity(db, { now: new Date('2026-10-01T09:00:00Z') });
    assert.equal(periods.today.startsOn, '2026-10-01');
    assert.equal(periods.week.startsOn, '2026-09-27');
    assert.equal(periods.month.startsOn, '2026-10-01');
    assert.equal(periods.week.casesOpened, 3);
    assert.equal(periods.month.casesOpened, 1);
    assert.equal(periods.today.casesOpened, 1);
    assert.deepEqual(periods.week.leaders, []);
});

test('the DST fallback day credits both repeated hours once and starts before the clock change', async t => {
    const db = await database(t);
    await db.exec(`
        INSERT INTO cases(caseid,createdat) VALUES (1,'2026-10-24T20:59:59Z'),(2,'2026-10-24T21:00:00Z');
        INSERT INTO manager_case_activity(caseid,occurred_at,actor_id) VALUES
            (1,'2026-10-24T22:30:00Z',1),(1,'2026-10-24T23:30:00Z',1);
    `);
    const { periods } = await fetchTeamActivity(db, { now: new Date('2026-10-25T06:00:00Z') });
    assert.equal(periods.today.startsOn, '2026-10-25');
    assert.equal(periods.week.startsOn, '2026-10-25');
    assert.equal(periods.today.casesOpened, 1);
    assert.equal(periods.today.leaders[0].points, 1);
});

test('ranking reads only the supplied office connection and preserves empty periods', async t => {
    const officeA = await database(t);
    const officeB = await database(t);
    await officeA.exec(`INSERT INTO cases(caseid,createdat) VALUES (1,'2026-10-15T08:00:00Z');
        INSERT INTO manager_case_activity(caseid,occurred_at,actor_id) VALUES (1,'2026-10-15T08:00:00Z',1);`);
    const now = new Date('2026-10-15T09:00:00Z');
    assert.equal((await fetchTeamActivity(officeA, {now})).periods.today.leaders.length, 1);
    const resultB = await fetchTeamActivity(officeB, {now});
    for (const period of Object.values(resultB.periods)) {
        assert.equal(period.casesOpened, 0);
        assert.equal(period.casesClosed, 0);
        assert.deepEqual(period.leaders, []);
    }
});

test('durable activity survives actor rewrites and reopening; no-op saves and rolled back edits earn nothing', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY);
        CREATE TABLE users(userid int PRIMARY KEY, name text, role text);
        CREATE TABLE cases(caseid int PRIMARY KEY, createdat timestamptz DEFAULT now(), isclosed boolean DEFAULT false, closed_by_userid int, closed_at timestamptz);
        CREATE TABLE casedescriptions(descriptionid int PRIMARY KEY,caseid int,stage int,text text,timestamp timestamptz,updated_by_userid int);
        INSERT INTO users VALUES (1,'First','Admin'),(2,'Second','Lawyer'),(3,'Client','Client');
        INSERT INTO cases(caseid) VALUES (1);
        INSERT INTO casedescriptions VALUES (1,1,1,'Old completed stage','2026-10-01T00:00:00Z',1);`);
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/2026-10-15_00_manager_case_activity.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_case_activity')).rows[0].n, 0, 'no fabricated historical points');
    await db.exec(`UPDATE casedescriptions SET text='Meaningful update',updated_by_userid=1 WHERE descriptionid=1;
        UPDATE casedescriptions SET updated_by_userid=2 WHERE descriptionid=1;
        UPDATE cases SET isclosed=true,closed_by_userid=2,closed_at=now() WHERE caseid=1;
        UPDATE cases SET isclosed=true WHERE caseid=1;
        UPDATE cases SET isclosed=false,closed_at=null,closed_by_userid=null WHERE caseid=1;`);
    await db.exec(`BEGIN; UPDATE casedescriptions SET text='Discarded change',updated_by_userid=2; ROLLBACK;`);
    const rows = (await db.query('SELECT actor_id,kind FROM manager_case_activity ORDER BY id')).rows;
    assert.deepEqual(rows, [{actor_id:1,kind:'update'},{actor_id:2,kind:'close'}]);
    await db.exec(`INSERT INTO casedescriptions VALUES (2,1,2,'Not completed',null,1);
        UPDATE casedescriptions SET timestamp=now(),updated_by_userid=3 WHERE descriptionid=2;`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_case_activity')).rows[0].n, 2);
});

test('shared-office migration isolates activity and rejects cross-office references under an app role', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    await db.exec(`CREATE TABLE law_firm_tenants(id uuid PRIMARY KEY);
        INSERT INTO law_firm_tenants VALUES ('${a}'),('${b}');
        CREATE TABLE users(userid int PRIMARY KEY,name text,role text,law_firm_tenant_id uuid);
        CREATE TABLE cases(caseid int PRIMARY KEY,createdat timestamptz DEFAULT now(),isclosed boolean DEFAULT false,closed_by_userid int,closed_at timestamptz,law_firm_tenant_id uuid);
        CREATE TABLE casedescriptions(descriptionid int PRIMARY KEY,caseid int,stage int,text text,timestamp timestamptz,updated_by_userid int);
        INSERT INTO users VALUES (1,'A','Admin','${a}'),(2,'B','Lawyer','${b}');
        INSERT INTO cases(caseid,law_firm_tenant_id) VALUES (1,'${a}'),(2,'${b}');`);
    // Exercise the real isolation helpers used by the shared-database installer.
    const installer = fs.readFileSync(path.join(__dirname,'../scripts/install-office-isolation.js'),'utf8');
    for (const name of ['office_scope_id', 'guard_office_owner']) {
        const match = installer.match(new RegExp('await client\\.query\\(`(CREATE OR REPLACE FUNCTION public\\.' + name + '[\\s\\S]*?)`\\);'));
        assert.ok(match, `Missing isolation SQL for ${name}`);
        await db.exec(match[1]);
    }
    await db.exec(`CREATE ROLE activity_app NOSUPERUSER NOBYPASSRLS;
        GRANT SELECT,INSERT,UPDATE ON users,cases,casedescriptions TO activity_app;`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/2026-10-15_00_manager_case_activity.sql'),'utf8'));
    await db.exec(`SET ROLE activity_app;
        SELECT set_config('app.office_mode','office',false),set_config('app.office_id','${a}',false);
        INSERT INTO casedescriptions VALUES (1,1,1,'A update',now(),1);`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_case_activity')).rows[0].n, 1);
    await assert.rejects(db.exec(`INSERT INTO manager_case_activity(law_firm_tenant_id,caseid,actor_id,kind) VALUES('${a}',2,1,'update')`), /outside the current office/);
    await db.exec(`SELECT set_config('app.office_id','${b}',false)`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manager_case_activity')).rows[0].n, 0);
    await assert.rejects(db.exec(`INSERT INTO manager_case_activity(law_firm_tenant_id,caseid,actor_id,kind) VALUES('${a}',1,1,'update')`), /row-level security/);
    await db.exec(`INSERT INTO casedescriptions VALUES (2,2,1,'B update',now(),2)`);
    assert.equal((await db.query('SELECT actor_id FROM manager_case_activity')).rows[0].actor_id, 2);
});

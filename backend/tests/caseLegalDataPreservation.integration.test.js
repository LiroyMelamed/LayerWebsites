const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/db');
const { caseHasLegalData } = require('../utils/legalData');

test('real PostgreSQL links prevent case deletion without altering any linked record', async t => {
    assert.equal(process.env.DB_NAME, 'codex_settings_20261006');
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439');
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const userId = (await db.query("INSERT INTO users(name,email,phonenumber,passwordhash,role) VALUES('Synthetic preservation','preservation@example.invalid','+199999900001','synthetic','Admin') RETURNING userid")).rows[0].userid;
        const caseId = (await db.query("INSERT INTO cases(casename,casemanagerid) VALUES('SYNTHETIC PRESERVATION',$1) RETURNING caseid", [userId])).rows[0].caseid;
        assert.equal(await caseHasLegalData(db, caseId), false);
        const fixtures = [
            ['stage file', 'INSERT INTO stage_files(caseid,stage,file_key,file_name,uploaded_by) VALUES($1,1,\'synthetic/no-object\',\'synthetic.pdf\',$2)', [caseId, userId]],
            ['signing document', "INSERT INTO signingfiles(caseid,lawyerid,filename,status) VALUES($1,$2,'synthetic.pdf','pending')", [caseId, userId]],
            ['case description', 'INSERT INTO casedescriptions(caseid) VALUES($1)', [caseId]],
            ['linked client', 'INSERT INTO case_users(caseid,userid) VALUES($1,$2)', [caseId, userId]],
            ['calendar event', "INSERT INTO calendar_events(case_id,owner_id,title,start_time,end_time) VALUES($1,$2,'SYNTHETIC',now(),now()+interval '1 hour')", [caseId, userId]],
        ];
        for (const [label, sql, args] of fixtures) {
            await t.test(label, async () => {
                await db.query('SAVEPOINT fixture');
                await db.query(sql, args);
                assert.equal(await caseHasLegalData(db, caseId), true);
                assert.equal((await db.query('SELECT count(*)::int AS n FROM cases WHERE caseid=$1', [caseId])).rows[0].n, 1);
                await db.query('ROLLBACK TO SAVEPOINT fixture');
                assert.equal(await caseHasLegalData(db, caseId), false);
            });
        }
    } finally {
        await db.query('ROLLBACK');
        db.release();
        await pool.end();
    }
});

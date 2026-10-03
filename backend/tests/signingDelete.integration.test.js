const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('signing deletion never removes storage before a real database commit', {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 30000,
}, async t => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439');
    assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9';
    process.env.S3_KEY = 'qa'; process.env.S3_SECRET = 'qa'; process.env.S3_BUCKET = 'qa';
    const pool = require('../config/db');
    const { r2 } = require('../utils/r2');
    const originalSend = r2.send;
    const { deleteSigningFile } = require('../controllers/signingFileController');
    const marker = crypto.randomBytes(6).toString('hex');
    const table = `qa_delete_block_${marker}`;
    let fileId;
    let calls = [];
    let cleanupFails = false;
    r2.send = async cmd => {
        assert.equal(cmd.constructor.name, 'DeleteObjectCommand');
        calls.push(cmd.input.Key);
        const row = await pool.query('SELECT signingfileid FROM signingfiles WHERE signingfileid=$1', [fileId]);
        assert.equal(row.rowCount, 0, 'Storage deletion must follow committed DB deletion');
        if (cleanupFails) throw Error('Synthetic storage outage');
    };
    t.after(async () => {
        r2.send = originalSend;
        await pool.query(`DROP TABLE IF EXISTS ${table}`);
        if (fileId) await pool.query('DELETE FROM signingfiles WHERE signingfileid=$1', [fileId]);
    });
    const create = async () => {
        const row = await pool.query(`INSERT INTO signingfiles(lawyerid,clientid,filename,filekey,originalfilekey,signedfilekey,status)
          VALUES(1017,1017,'Synthetic deletion QA - no legal validity',$1,$1,$2,'pending') RETURNING signingfileid`, [`qa/${marker}/original.pdf`, `qa/${marker}/signed.pdf`]);
        fileId = row.rows[0].signingfileid;
    };
    const invoke = async (user = { UserId: 1017, Role: 'Admin' }) => {
        let body, error;
        await deleteSigningFile({ params: { signingFileId: String(fileId) }, user }, { json: b => { body = b; } }, e => { error = e; });
        return { body, error };
    };
    await create();
    await t.test('foreign-key failure rolls back and never touches storage', async () => {
        await pool.query(`CREATE TABLE ${table}(fileid integer REFERENCES signingfiles(signingfileid))`);
        await pool.query(`INSERT INTO ${table} VALUES($1)`, [fileId]);
        const result = await invoke();
        assert.ok(result.error);
        assert.deepEqual(calls, []);
        assert.equal((await pool.query('SELECT 1 FROM signingfiles WHERE signingfileid=$1', [fileId])).rowCount, 1);
        await pool.query(`DROP TABLE ${table}`);
    });
    await t.test('unauthorized request cannot delete retained file or storage', async () => {
        const result = await invoke({ UserId: 9999999, Role: 'User' });
        assert.ok(result.error); assert.deepEqual(calls, []);
    });
    await t.test('committed deletion cleans distinct keys exactly once', async () => {
        const result = await invoke();
        assert.equal(result.error, undefined); assert.deepEqual(result.body, { ok: true });
        assert.equal(calls.length, 2); assert.equal(new Set(calls).size, 2);
    });
    await t.test('retry of already deleted record does not delete storage again', async () => {
        assert.ok((await invoke()).error); assert.equal(calls.length, 2);
    });
    await t.test('storage outage does not undo an already committed deletion', async () => {
        await create(); cleanupFails = true;
        assert.deepEqual((await invoke()).body, { ok: true });
        assert.equal((await pool.query('SELECT 1 FROM signingfiles WHERE signingfileid=$1', [fileId])).rowCount, 0);
    });
});

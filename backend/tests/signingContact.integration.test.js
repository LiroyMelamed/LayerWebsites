const test = require('node:test');
const assert = require('node:assert/strict');

test('signer contact changes are atomic and attributed', {
    skip: process.env.LEGAL_DB_QA !== 'true', timeout: 30000,
}, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_PORT, '55439');
    assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
    process.env.SIGNING_ENABLED = 'true';
    process.env.JWT_SECRET = 'synthetic-contact-qa-only';
    const pool = require('../config/db');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const app = require('../app');
    const auth = (userid, role) => `Bearer ${jwt.sign({ userid, role }, process.env.JWT_SECRET)}`;
    const { rows: originals } = await pool.query('SELECT userid,email,phonenumber FROM users WHERE userid IN (1088,1092)');
    const fileIds = [];
    t.after(async () => {
        const db = await pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL app.audit_events_allow_delete = 'true'");
            await db.query('DROP TRIGGER IF EXISTS qa_contact_failure ON signing_signer_delivery');
            await db.query('DROP FUNCTION IF EXISTS qa_contact_failure()');
            await db.query('DROP TRIGGER IF EXISTS qa_contact_audit_failure ON audit_events');
            await db.query('DROP FUNCTION IF EXISTS qa_contact_audit_failure()');
            await db.query('DELETE FROM audit_events WHERE signingfileid=ANY($1::int[])', [fileIds]);
            await db.query('DELETE FROM signingfiles WHERE signingfileid=ANY($1::int[])', [fileIds]);
            for (const row of originals) await db.query('UPDATE users SET email=$1,phonenumber=$2 WHERE userid=$3', [row.email, row.phonenumber, row.userid]);
            await db.query('COMMIT');
        } catch (error) { await db.query('ROLLBACK'); throw error; }
        finally { db.release(); }
    });
    const fixture = async () => {
        const { rows } = await pool.query(`INSERT INTO signingfiles(lawyerid,clientid,filename,filekey,status)
            VALUES(1017,1088,'Synthetic contact QA - no legal validity','qa/no-real-document.pdf','pending') RETURNING signingfileid`);
        const id = rows[0].signingfileid;
        fileIds.push(id);
        await pool.query('INSERT INTO signaturespots(signingfileid,signeruserid,isrequired) VALUES($1,1088,true)', [id]);
        await pool.query("INSERT INTO signing_signer_delivery(signing_file_id,signer_user_id,delivery_method) VALUES($1,1088,'phone')", [id]);
        return id;
    };
    const patch = (id, body, authorization = auth(1017, 'Admin')) => request(app)
        .patch(`/api/SigningFiles/${id}/signers/1088`).set('Authorization', authorization).send(body);
    await t.test('a failed delivery write preserves contact and reports failure', async () => {
        const id = await fixture();
        const before = (await pool.query('SELECT email FROM users WHERE userid=1088')).rows[0];
        await pool.query(`CREATE FUNCTION qa_contact_failure() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.signing_file_id = ${id} THEN RAISE EXCEPTION 'synthetic delivery failure'; END IF; RETURN NEW; END $$`);
        await pool.query('CREATE TRIGGER qa_contact_failure BEFORE INSERT OR UPDATE ON signing_signer_delivery FOR EACH ROW EXECUTE FUNCTION qa_contact_failure()');
        let response;
        try { response = await patch(id, { deliveryMethod: 'email' }); }
        finally {
            await pool.query('DROP TRIGGER qa_contact_failure ON signing_signer_delivery');
            await pool.query('DROP FUNCTION qa_contact_failure()');
        }
        assert.equal(response.status, 500);
        assert.deepEqual((await pool.query('SELECT email FROM users WHERE userid=1088')).rows[0], before);
    });
    await t.test('successful update records actor and before/after values', async () => {
        const id = await fixture();
        const before = (await pool.query('SELECT email FROM users WHERE userid=1088')).rows[0];
        const response = await patch(id, { deliveryMethod: 'email' });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const { rows } = await pool.query("SELECT actor_userid,metadata FROM audit_events WHERE signingfileid=$1 AND event_type='SIGNER_CONTACT_UPDATED'", [id]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].actor_userid, 1017);
        assert.equal(rows[0].metadata.before.email, before.email);
        assert.equal(rows[0].metadata.after.email, before.email);
        assert.equal(rows[0].metadata.before.deliveryMethod, 'phone');
        assert.equal(rows[0].metadata.after.deliveryMethod, 'email');
    });
    await t.test('unrelated client cannot change a signer', async () => {
        const id = await fixture();
        assert.equal((await patch(id, { email: 'forbidden@example.invalid' }, auth(1091, 'Client'))).status, 403);
    });
    await t.test('audit failure rolls back replacement and delivery migration', async () => {
        const id = await fixture();
        const targetBefore = (await pool.query('SELECT email FROM users WHERE userid=1092')).rows[0];
        await pool.query(`CREATE FUNCTION qa_contact_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.signingfileid = ${id} THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
        await pool.query('CREATE TRIGGER qa_contact_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION qa_contact_audit_failure()');
        let response;
        try { response = await patch(id, { replaceWithUserId: 1092, deliveryMethod: 'email' }); }
        finally {
            await pool.query('DROP TRIGGER qa_contact_audit_failure ON audit_events');
            await pool.query('DROP FUNCTION qa_contact_audit_failure()');
        }
        assert.equal(response.status, 500);
        assert.deepEqual((await pool.query('SELECT email FROM users WHERE userid=1092')).rows[0], targetBefore);
        assert.equal((await pool.query('SELECT clientid FROM signingfiles WHERE signingfileid=$1', [id])).rows[0].clientid, 1088);
        assert.equal((await pool.query('SELECT signeruserid FROM signaturespots WHERE signingfileid=$1', [id])).rows[0].signeruserid, 1088);
        assert.deepEqual((await pool.query('SELECT signer_user_id,delivery_method FROM signing_signer_delivery WHERE signing_file_id=$1', [id])).rows,
            [{ signer_user_id: 1088, delivery_method: 'phone' }]);
    });
    await t.test('replacement commits all references without changing customer contacts', async () => {
        const id = await fixture();
        const targetBefore = (await pool.query('SELECT email FROM users WHERE userid=1092')).rows[0];
        const response = await patch(id, { replaceWithUserId: 1092, deliveryMethod: 'email' });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(response.body.signerUserId, 1092);
        assert.equal((await pool.query('SELECT clientid FROM signingfiles WHERE signingfileid=$1', [id])).rows[0].clientid, 1092);
        assert.equal((await pool.query('SELECT signeruserid FROM signaturespots WHERE signingfileid=$1', [id])).rows[0].signeruserid, 1092);
        const event = (await pool.query("SELECT metadata FROM audit_events WHERE signingfileid=$1 AND event_type='SIGNER_CONTACT_UPDATED'", [id])).rows[0];
        assert.equal(event.metadata.after.email, targetBefore.email);
        assert.deepEqual((await pool.query('SELECT signer_user_id,delivery_method FROM signing_signer_delivery WHERE signing_file_id=$1', [id])).rows,
            [{ signer_user_id: 1092, delivery_method: 'email' }]);
    });
    await t.test('replacement cannot reassign an already signed optional spot', async () => {
        const id = await fixture();
        await pool.query('UPDATE signaturespots SET isrequired=false,issigned=true WHERE signingfileid=$1', [id]);
        assert.equal((await patch(id, { replaceWithUserId: 1092 })).status, 422);
        assert.equal((await pool.query('SELECT clientid FROM signingfiles WHERE signingfileid=$1', [id])).rows[0].clientid, 1088);
    });
});

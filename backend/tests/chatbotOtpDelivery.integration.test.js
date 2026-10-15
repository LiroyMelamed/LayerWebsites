process.env.AI_CHATBOT_ENABLED = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const pool = require('../config/db');
const { resetStore } = require('../utils/rateLimiter');
const { recordSuccess } = require('../utils/otpBruteForce');
let delivery = async () => ({ ok: true });
let capturedCode;
require('../utils/sendMessage').sendMessage = async body => {
    capturedCode = body.match(/\b\d{6}\b/)?.[0];
    assert.ok(capturedCode);
    return delivery();
};
const app = express();
app.use(express.json());
app.use('/api/chatbot', require('../routes/chatbotRoutes'));
app.use(require('../middlewares/errorHandler'));

test('chatbot OTP works with partial phone index and waits for delivery', { skip: process.env.LEGAL_DB_QA !== 'true' }, async t => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.ok(['legal_e2e_qa','codex_readiness_20261005'].includes(process.env.DB_NAME));
    const phone = '0508887755';
    assert.equal((await pool.query('SELECT userid FROM users WHERE phonenumber=$1',[phone])).rowCount, 0);
    const user = await pool.query("INSERT INTO users(name,email,phonenumber,passwordhash,role) VALUES('Synthetic chatbot delivery QA',$1,$2,'x','User') RETURNING userid",[crypto.randomUUID()+'@example.test',phone]);
    const userId = user.rows[0].userid;
    t.after(async () => {
        await pool.query('DELETE FROM chatbot_messages WHERE session_id IN (SELECT id FROM chatbot_sessions WHERE user_id=$1)',[userId]);
        await pool.query('DELETE FROM chatbot_sessions WHERE user_id=$1',[userId]);
        await pool.query('DELETE FROM otps WHERE userid=$1',[userId]);
        await pool.query('DELETE FROM users WHERE userid=$1',[userId]);
        await pool.end();
    });
    const otpRows = () => pool.query('SELECT id,otp FROM otps WHERE userid=$1',[userId]);
    const send = () => { resetStore(); recordSuccess(phone); return request(app).post('/api/chatbot/request-otp').send({phoneNumber:phone}); };
    const verify = otp => { resetStore(); return request(app).post('/api/chatbot/verify-otp').send({phoneNumber:phone,otp}); };

    await t.test('request, resend, wrong code, correction and consumed-code replay', async () => {
        delivery = async () => ({ok:true});
        assert.equal((await send()).status,200);
        const firstCode = capturedCode;
        assert.equal((await send()).status,200);
        const code = capturedCode;
        const rows = await otpRows();
        assert.equal(rows.rowCount,1);
        assert.equal(rows.rows[0].otp,crypto.createHmac('sha256',process.env.SIGNING_OTP_PEPPER||'').update(code).digest('hex'));
        assert.notEqual(rows.rows[0].otp,code);
        const wrong = code === '100000' ? '100001' : '100000';
        assert.equal((await verify(wrong)).status,401);
        if (firstCode !== code) assert.equal((await verify(firstCode)).status,401);
        const verified = await verify(code);
        assert.equal(verified.status,200);
        assert.equal(verified.body.verified,true);
        assert.ok(verified.body.sessionId);
        assert.equal((await otpRows()).rowCount,0);
        assert.equal((await verify(code)).status,401);
    });
    await t.test('provider rejection fails the request and removes only that challenge', async () => {
        delivery = async () => ({ok:false,error:'provider_rejected'});
        const res = await send();
        assert.equal(res.status,503);
        assert.equal(res.body.success,false);
        assert.equal((await otpRows()).rowCount,0);
    });
    await t.test('async provider exception is handled without false success', async () => {
        delivery = async () => { throw Error('synthetic transport failure'); };
        const res = await send();
        assert.equal(res.status,503);
        assert.equal((await otpRows()).rowCount,0);
    });
    await t.test('request stays pending until provider resolves', async () => {
        let release;
        const gate = new Promise(resolve => { release=resolve; });
        let entered;
        const started = new Promise(resolve => { entered=resolve; });
        delivery = () => { entered(); return gate; };
        let settled=false;
        const pending=send().then(r=>{settled=true;return r;});
        await started;
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(settled,false);
        release({ok:true});
        assert.equal((await pending).status,200);
        assert.equal((await otpRows()).rowCount,1);
    });
    await t.test('older failed delivery cannot delete a newer successful challenge', async () => {
        let release, entered;
        const gate=new Promise(resolve=>{release=resolve;});
        const started=new Promise(resolve=>{entered=resolve;});
        delivery=()=>{entered();return gate;};
        const pending=send().then(r=>r);
        await started;
        delivery=async()=>({ok:true});
        assert.equal((await send()).status,200);
        const latestCode=capturedCode;
        release({ok:false});
        assert.equal((await pending).status,503);
        assert.equal((await otpRows()).rowCount,1);
        assert.equal((await verify(latestCode)).status,200);
    });
});

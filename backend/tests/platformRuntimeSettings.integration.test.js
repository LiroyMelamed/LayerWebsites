const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const pool = require('../config/db');
const settings = require('../services/settingsService');
const app = express(); app.use(express.json());
const controller = require('../controllers/platformSettingsController');
app.put('/settings', controller.updateSettings);
app.get('/public', controller.getPublicSettings);
app.use('/chatbot', require('../routes/chatbotRoutes'));
app.use(require('../middlewares/errorHandler'));

test('saved chatbot switch controls every public endpoint, including old sessions', async t => {
    assert.equal(process.env.LEGAL_DB_QA,'true');
    assert.equal(process.env.DB_NAME,'legal_e2e_qa');assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.CANDIDATE_DB_PORT,'55449');
    const original = (await pool.query("SELECT * FROM platform_settings WHERE category='chatbot' AND setting_key='AI_CHATBOT_ENABLED'")).rows[0];
    t.after(async()=>{
        if (original) await settings.upsertSetting('chatbot','AI_CHATBOT_ENABLED',original.setting_value,{valueType:original.value_type});
        else { await pool.query("DELETE FROM platform_settings WHERE category='chatbot' AND setting_key='AI_CHATBOT_ENABLED'"); settings.invalidateCache(); }
        await pool.end();
    });
    const save = async value => {
        assert.equal((await request(app).put('/settings').send({settings:[{category:'chatbot',key:'AI_CHATBOT_ENABLED',value}]})).status,200);
    };
    await save('true');
    assert.equal((await request(app).get('/chatbot/context')).status,400);
    for (const value of ['false','0']) {
        await save(value);
        assert.ok([false,'false','0'].includes((await request(app).get('/public')).body.AI_CHATBOT_ENABLED));
        for (const [method,path] of [['get','context'],['post','message'],['post','request-otp'],['post','verify-otp']]) {
            const res=await request(app)[method]('/chatbot/'+path).send({sessionId:'previous-session'});
            assert.equal(res.status,403,path);
            assert.equal(res.body.errorCode,'CHATBOT_DISABLED');
        }
    }
    await save('true');
    assert.equal((await request(app).get('/chatbot/context')).status,400);
});

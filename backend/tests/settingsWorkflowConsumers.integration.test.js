const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const pool = require('../config/db');
const settings = require('../services/settingsService');

// This suite requires its own empty schema. It never uses real provider credentials.
Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'synthetic-google-client', GOOGLE_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://example.invalid/google-callback',
    OUTLOOK_CLIENT_ID: 'synthetic-outlook-client', OUTLOOK_CLIENT_SECRET: 'synthetic-secret',
    OUTLOOK_OAUTH_REDIRECT_URI: 'https://example.invalid/outlook-callback',
    CHATBOT_LLM_API_KEY: 'synthetic-never-used',
});
const deliveries = [];
require('../services/notifications/notificationOrchestrator').notifyRecipient = async payload => {
    deliveries.push(payload); return { ok: true };
};
const reminders = require('../lib/signingFileReminders');
const birthdays = require('../tasks/birthdayGreetings/service');
const aiBrief = require('../services/managerHome/aiBrief.service');
const controller = require('../controllers/platformSettingsController');
const calendar = require('../controllers/calendarController');
const app = express(); app.use(express.json());
let author;
app.use((req, res, next) => { req.user = { UserId: author, Role: 'Admin' }; next(); });
app.put('/settings', controller.updateSettings);
app.put('/settings/single', controller.updateSingleSetting);
app.get('/settings/public', controller.getPublicSettings);
app.get('/google', calendar.getGoogleAuthUrl);
app.get('/outlook', calendar.getOutlookAuthUrl);

test('platform settings control real workflow consumers without sending externally', async t => {
    assert.equal(process.env.LEGAL_DB_QA, 'true');
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_NAME, 'codex_settings_20261006');
    assert.equal(Number((await pool.query('SELECT count(*) FROM users')).rows[0].count), 0);
    assert.equal(Number((await pool.query('SELECT count(*) FROM signingfiles')).rows[0].count), 0);
    const users = [], seeded = [];
    let file;
    t.after(async () => {
        if (file) await pool.query('DELETE FROM signingfiles WHERE signingfileid=$1', [file]);
        await pool.query('DELETE FROM birthday_greetings_sent WHERE user_id=ANY($1::int[])', [users]);
        await pool.query('DELETE FROM users WHERE userid=ANY($1::int[])', [users]);
        for (const [category, key] of seeded) await pool.query('DELETE FROM platform_settings WHERE category=$1 AND setting_key=$2', [category, key]);
        settings.invalidateCache(); await pool.end();
    });
    const seed = async (category, key, value, valueType = 'boolean') => {
        seeded.push([category, key]);
        await settings.upsertSetting(category, key, value, { valueType });
    };
    const save = async (category, key, value, single = false) => {
        const body = { category, key, value };
        const response = await request(app).put(single ? '/settings/single' : '/settings').send(single ? body : { settings: [body] });
        assert.equal(response.status, 200, JSON.stringify(response.body));
    };
    for (const role of ['Admin', 'User', 'User']) {
        const result = await pool.query("INSERT INTO users(name,email,phonenumber,passwordhash,role) VALUES($1,$2,$3,'synthetic-only',$4) RETURNING userid",
            ['Synthetic settings QA ' + users.length, `settings-${users.length}@example.invalid`, `qa-settings-${users.length}`, role]);
        users.push(result.rows[0].userid);
    }
    author = users[0];
    file = (await pool.query("INSERT INTO signingfiles(lawyerid,filename,status,requireotp) VALUES($1,'Synthetic settings test.pdf','pending',true) RETURNING signingfileid", [author])).rows[0].signingfileid;

    await t.test('signing reminder toggle and offset reschedule automatic rows but preserve manual rows', async () => {
        await seed('signing', 'SIGN_REMINDER_AUTO_ENABLED', 'false');
        await seed('signing', 'SIGN_REMINDER_OFFSET_HOURS', '2', 'number');
        const invitedAt = new Date('2026-11-01T10:00:00Z');
        const args = { signingFileId: file, signerUserIds: users.slice(1), invitedAt };
        assert.equal((await reminders.scheduleRemindersForSigners(args)).created, 0);
        await save('signing', 'SIGN_REMINDER_AUTO_ENABLED', 'true');
        assert.equal((await reminders.scheduleRemindersForSigners(args)).created, 2);
        await pool.query('UPDATE signing_file_reminders SET auto_managed=false WHERE signing_file_id=$1 AND signer_user_id=$2', [file, users[2]]);
        await save('signing', 'SIGN_REMINDER_OFFSET_HOURS', '6', true);
        let rows = (await pool.query('SELECT * FROM signing_file_reminders WHERE signing_file_id=$1 ORDER BY signer_user_id', [file])).rows;
        assert.equal(rows[0].scheduled_for.toISOString(), '2026-11-01T16:00:00.000Z');
        assert.equal(rows[1].scheduled_for.toISOString(), '2026-11-01T12:00:00.000Z');
        await save('signing', 'SIGN_REMINDER_AUTO_ENABLED', 'false');
        rows = (await pool.query('SELECT status FROM signing_file_reminders WHERE signing_file_id=$1 ORDER BY signer_user_id', [file])).rows;
        assert.deepEqual(rows.map(r => r.status), ['CANCELLED', 'PENDING']);
        assert.equal((await reminders.scheduleRemindersForSigners(args)).created, 0);
    });

    for (const [provider, key, host] of [['google', 'GOOGLE_SYNC_ENABLED', 'accounts.google.com'], ['outlook', 'OUTLOOK_SYNC_ENABLED', 'login.microsoftonline.com']]) {
        await t.test(provider + ' synchronization switch blocks authorization and can be re-enabled', async () => {
            await seed('calendar', key, 'false');
            const disabled = await request(app).get('/' + provider);
            assert.equal(disabled.status, 403); assert.equal(disabled.body.code, provider.toUpperCase() + '_SYNC_DISABLED');
            await save('calendar', key, 'true');
            const enabled = await request(app).get('/' + provider);
            assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
            assert.equal(new URL(enabled.body.authUrl).hostname, host);
            await save('calendar', key, 'false', true);
            assert.equal((await request(app).get('/' + provider)).status, 403);
        });
    }

    await t.test('birthday switch and saved SMS template control the actual scheduled message', async () => {
        await seed('notifications', 'BIRTHDAY_GREETINGS_ENABLED', 'false');
        await seed('templates', 'BIRTHDAY_SMS', 'בדיקת ברכה {{recipientName}} מאת {{firmName}}', 'string');
        await seed('firm', 'LAW_FIRM_NAME', 'משרד QA סינתטי', 'string');
        await pool.query("UPDATE users SET dateofbirth=(now() AT TIME ZONE 'Asia/Jerusalem')::date WHERE userid=$1", [users[1]]);
        assert.equal((await birthdays.processBirthdayGreetings({})).disabled, true);
        assert.equal(deliveries.length, 0);
        await save('notifications', 'BIRTHDAY_GREETINGS_ENABLED', 'true');
        assert.equal((await birthdays.processBirthdayGreetings({})).sent, 1);
        assert.equal(deliveries.length, 1);
        assert.equal(deliveries[0].recipientUserId, users[1]);
        assert.equal(deliveries[0].sms.messageBody, 'בדיקת ברכה Synthetic settings QA 1 מאת משרד QA סינתטי');
        assert.equal((await birthdays.processBirthdayGreetings({})).sent, 0, 'same-day rerun must not send again');
    });

    await t.test('OTP display/default flags update publicly while an existing document keeps OTP required', async () => {
        for (const key of ['SIGNING_OTP_ENABLED', 'SIGNING_REQUIRE_OTP_DEFAULT']) await seed('signing', key, 'true');
        for (const value of ['false', 'true']) {
            for (const key of ['SIGNING_OTP_ENABLED', 'SIGNING_REQUIRE_OTP_DEFAULT']) await save('signing', key, value);
            const publicSettings = (await request(app).get('/settings/public')).body;
            assert.equal(publicSettings.SIGNING_OTP_ENABLED, value === 'true');
            assert.equal(publicSettings.SIGNING_REQUIRE_OTP_DEFAULT, value === 'true');
            assert.equal((await pool.query('SELECT requireotp FROM signingfiles WHERE signingfileid=$1', [file])).rows[0].requireotp, true);
        }
    });

    await t.test('AI briefing obeys a saved false value even with a legacy string setting type', async () => {
        await seed('managerHome', 'MANAGER_HOME_AI_INSIGHTS_ENABLED', 'false', 'string');
        assert.equal(await aiBrief.isAiBriefEnabled(), false);
        await save('managerHome', 'MANAGER_HOME_AI_INSIGHTS_ENABLED', 'true');
        assert.equal(await aiBrief.isAiBriefEnabled(), true);
        await save('managerHome', 'MANAGER_HOME_AI_INSIGHTS_ENABLED', 'false', true);
        assert.equal(await aiBrief.isAiBriefEnabled(), false);
    });
});

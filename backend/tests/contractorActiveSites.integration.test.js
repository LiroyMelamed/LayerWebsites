// Run only against the task-owned temporary PostgreSQL container, never a tenant server.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Pool } = require('pg'), express = require('express'), request = require('supertest');
const policy = require('../lib/contractorMonitorPolicy');
const port = Number(process.env.CM_TEST_PORT);
if (!Number.isInteger(port) || port < 1024 || port === 5432) throw Error('CM_TEST_PORT must identify the task-owned localhost container');
const options = { host: '127.0.0.1', port, user: 'postgres', password: 'synthetic-qa-only', max: 2, connectionTimeoutMillis: 5000 };
const migration = fs.readFileSync(path.join(__dirname, '../migrations/2026-10-09_01_contractor_active_sites.sql'), 'utf8');
function loadModule(file, dependencies, env = {}) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
        module, require: id => { if (!Object.hasOwn(dependencies, id)) throw Error('Unexpected module: ' + id); return dependencies[id]; },
        process: { env }, Date, Map, console: { warn() {}, error() {} },
    });
    return module.exports;
}
function application(pool) {
    const settings = loadModule('../services/settingsService.js', {
        '../config/db': pool, '../lib/contractorMonitorPolicy': policy,
    }, { CM_ACTIVE_SITES_EMAIL_RECIPIENTS: 'env@example.invalid', FIRM_DISPLAY_NAME: 'MelamedLaw' });
    const noSend = () => { throw Error('Unexpected notification side effect'); };
    const controller = loadModule('../controllers/platformSettingsController.js', {
        '../config/db': pool, path: require('path'), '../services/settingsService': settings,
        '../utils/templateRenderer': { validateTemplate: () => ({ valid: true }), TEMPLATE_REQUIRED_VARS: {} },
        '../utils/smooveEmailCampaignService': { sendTransactionalCustomHtmlEmail: noSend },
        '../lib/firmBranding': { getFirmDisplayName: async () => 'Synthetic' },
        '../lib/signingFileReminders': { rescheduleUnmodifiedReminders: noSend, cancelAllAutoManagedPending: noSend },
        '../services/knowledgeDocService': new Proxy({}, { get: () => noSend }),
    });
    const admin = loadModule('../middlewares/requirePlatformAdmin.js', {
        '../services/settingsService': settings, '../utils/errors.he': { getHebrewMessage: code => code },
        '../utils/appError': { createAppError: (code, status, message) => Object.assign(new Error(message), { code, status }) },
    }, { NODE_ENV: 'production' });
    const app = express(); app.use(express.json());
    app.use((req, res, next) => { const id = Number(req.headers['x-fixture-user']); req.user = { UserId: id, Role: id === 3 ? 'Lawyer' : 'Admin' }; next(); });
    app.use(admin);
    app.get('/', controller.getAllSettings); app.put('/', controller.updateSettings); app.put('/single', controller.updateSingleSetting);
    app.use((err, req, res, next) => res.status(err.status || 500).json({ code: err.code }));
    return { app, settings };
}
test('active sites migration and admin API are restricted to the verified database', async t => {
    const root = new Pool({ ...options, database: 'postgres' }), pools = [];
    t.after(async () => { for (const p of pools) await p.end(); await root.end(); });
    const fixtures = {};
    for (const name of ['melamedlaw', 'morlevy', 'ashrafessa', 'idm']) {
        // The guarded task-owned cluster may retain fixtures from an interrupted run.
        await root.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)');
        await root.query('CREATE DATABASE ' + name);
        const pool = new Pool({ ...options, database: name }); pools.push(pool);
        await pool.query([
            'CREATE TABLE users(userid integer PRIMARY KEY, role text);',
            "INSERT INTO users VALUES (1,'Admin'),(2,'Admin'),(3,'Lawyer');",
            'CREATE TABLE platform_admins(user_id integer PRIMARY KEY, is_active boolean);',
            'INSERT INTO platform_admins VALUES (1,true);',
            "CREATE TABLE platform_settings(id serial PRIMARY KEY, category text NOT NULL, setting_key text NOT NULL, setting_value text, value_type text NOT NULL DEFAULT 'string', label text, description text, updated_by integer REFERENCES users(userid), updated_at timestamptz DEFAULT now(), UNIQUE(category,setting_key));",
            "INSERT INTO platform_settings(category,setting_key,setting_value,value_type) VALUES ('contractor_monitor','CM_ENABLED','true','boolean');",
        ].join('\n'));
        fixtures[name] = { pool, ...application(pool) };
    }
    await fixtures.melamedlaw.pool.query("INSERT INTO platform_settings(category,setting_key,setting_value,value_type) VALUES ('contractor_monitor','CM_ACTIVE_SITES_ENABLED','false','string'),('contractor_monitor','CM_ACTIVE_SITES_EMAIL_RECIPIENTS','saved@example.invalid','string')");
    await t.test('migration seeds only MelamedLaw, is idempotent and preserves user choices', async () => {
        for (const [name, f] of Object.entries(fixtures)) {
            const before = (await f.pool.query('SELECT * FROM platform_settings ORDER BY id')).rows;
            await f.pool.query(migration); await f.pool.query(migration);
            const after = (await f.pool.query('SELECT * FROM platform_settings ORDER BY id')).rows;
            if (name !== 'melamedlaw') assert.deepEqual(after, before, name + ' database unchanged');
            else {
                assert.equal(after.length, 5);
                assert.equal(after.find(r => r.setting_key === 'CM_ACTIVE_SITES_ENABLED').setting_value, 'false');
                assert.equal(after.find(r => r.setting_key === 'CM_ACTIVE_SITES_ENABLED').value_type, 'boolean');
                assert.equal(after.find(r => r.setting_key === 'CM_ACTIVE_SITES_EMAIL_RECIPIENTS').setting_value, 'saved@example.invalid');
                assert.equal(after.find(r => r.setting_key === 'CM_ACTIVE_SITES_INCLUDE_IN_GLOBAL_SUMMARY').setting_value, 'false');
            }
        }
    });
    await t.test('single and bulk saves retain boolean false and explicit recipient values on reload', async () => {
        const f = fixtures.melamedlaw;
        let r = await request(f.app).put('/').set('x-fixture-user', '1').send({ settings: [
            { category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_ENABLED', value: true },
            { category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_EMAIL_RECIPIENTS', value: 'new@example.invalid;two@example.invalid' },
        ] }); assert.equal(r.status, 200);
        await f.pool.query(migration);
        r = await request(f.app).get('/').set('x-fixture-user', '1');
        assert.equal(r.body.settings.contractor_monitor.CM_ACTIVE_SITES_ENABLED.effectiveValue, true, 'migration cannot undo user enable');
        r = await request(f.app).put('/single').set('x-fixture-user', '1').send({ category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_ENABLED', value: 'false' });
        assert.equal(r.status, 200);
        r = await request(f.app).get('/').set('x-fixture-user', '1');
        const cm = r.body.settings.contractor_monitor;
        assert.equal(cm.CM_ACTIVE_SITES_ENABLED.effectiveValue, false); assert.equal(cm.CM_ACTIVE_SITES_ENABLED.valueType, 'boolean');
        assert.equal(cm.CM_ACTIVE_SITES_EMAIL_RECIPIENTS.effectiveValue, 'new@example.invalid;two@example.invalid');
        assert.equal(cm.CM_ACTIVE_SITES_SMS_RECIPIENTS.effectiveValue, '');
    });
    await t.test('blank recipients remain blank despite a configured env fallback', async () => {
        const f = fixtures.melamedlaw;
        await f.settings.upsertSetting('contractor_monitor', 'CM_ACTIVE_SITES_EMAIL_RECIPIENTS', '');
        assert.equal(await f.settings.getSetting('contractor_monitor', 'CM_ACTIVE_SITES_EMAIL_RECIPIENTS'), '');
        const r = await request(f.app).get('/').set('x-fixture-user', '1');
        assert.equal(r.body.settings.contractor_monitor.CM_ACTIVE_SITES_EMAIL_RECIPIENTS.effectiveValue, '');
    });
    await t.test('platform admin required; ordinary admin and lawyer denied on read and save', async () => {
        for (const id of [2, 3]) {
            assert.equal((await request(fixtures.melamedlaw.app).get('/').set('x-fixture-user', String(id))).status, 403);
            assert.equal((await request(fixtures.melamedlaw.app).put('/single').set('x-fixture-user', String(id)).send({ category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_ENABLED', value: true })).status, 403);
        }
    });
    await t.test('other clients hide legacy category and deny direct single/bulk writes without partial changes', async () => {
        for (const name of ['morlevy', 'ashrafessa', 'idm']) {
            const f = fixtures[name];
            const get = await request(f.app).get('/').set('x-fixture-user', '1');
            assert.equal(get.status, 200); assert.equal(get.body.settings.contractor_monitor, undefined);
            const single = await request(f.app).put('/single').set('x-fixture-user', '1').send({ category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_ENABLED', value: true });
            assert.equal(single.status, 403);
            const bulk = await request(f.app).put('/').set('x-fixture-user', '1').send({ settings: [
                { category: 'firm', key: 'DO_NOT_WRITE', value: 'synthetic' },
                { category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_ENABLED', value: true },
            ] }); assert.equal(bulk.status, 403);
            assert.equal((await f.pool.query("SELECT * FROM platform_settings WHERE category='firm'")).rows.length, 0);
            assert.equal((await f.pool.query("SELECT * FROM platform_settings WHERE setting_key LIKE 'CM_ACTIVE_SITES_%'")).rows.length, 0);
            await assert.rejects(f.settings.getSetting('contractor_monitor', 'CM_ENABLED'), e => e.code === 'CONTRACTOR_MONITOR_TENANT_FORBIDDEN');
        }
    });
    await t.test('spoofed category and invalid booleans rejected before writes', async () => {
        const f = fixtures.melamedlaw;
        for (const body of [
            { category: 'firm', key: 'CM_ACTIVE_SITES_ENABLED', value: true },
            { category: 'contractor_monitor', key: 'CM_ACTIVE_SITES_ENABLED', value: { unsafe: true } },
        ]) assert.equal((await request(f.app).put('/single').set('x-fixture-user', '1').send(body)).status, 400);
    });
    await t.test('generic non-contractor boolean settings keep their prior type through bulk save', async () => {
        const s = fixtures.melamedlaw.settings;
        await s.upsertSetting('firm', 'EXISTING_BOOL', 'true', { valueType: 'boolean' });
        await s.bulkUpsert([{ category: 'firm', key: 'EXISTING_BOOL', value: 'false' }]);
        assert.equal(await s.getSetting('firm', 'EXISTING_BOOL'), false);
    });
});

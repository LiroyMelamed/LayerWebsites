const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const pool = require('../config/db');
const settings = require('../services/settingsService');
const controller = require('../controllers/platformSettingsController');
const app = express(); app.use(express.json());
app.get('/public', controller.getPublicSettings);
app.get('/settings', controller.getAllSettings);
app.put('/single', controller.updateSingleSetting);
app.put('/bulk', controller.updateSettings);

test('retired consent setting cannot bypass explicit approval or be saved by older clients', async (t) => {
  assert.equal(process.env.DB_NAME, 'codex_readiness_20261005');
  const key = 'SHOW_PUBLIC_SIGNING_CONSENT';
  const original = (await pool.query('SELECT * FROM platform_settings WHERE category=$1 AND setting_key=$2', ['signing', key])).rows[0];
  t.after(async () => {
    if (original) await settings.upsertSetting('signing', key, original.setting_value, { valueType: original.value_type });
    else await pool.query('DELETE FROM platform_settings WHERE category=$1 AND setting_key=$2', ['signing', key]);
    settings.invalidateCache(); await pool.end();
  });
  await settings.upsertSetting('signing', key, 'false', { valueType: 'boolean' });
  const publicResult = await request(app).get('/public');
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.body[key], true);
  const adminResult = await request(app).get('/settings');
  assert.equal(adminResult.status, 200);
  assert.equal(adminResult.body.settings.signing[key], undefined);
  assert.equal(await settings.getSetting('signing', key), false, 'reading admin settings must not mutate the cache');
  const single = await request(app).put('/single').send({ category: 'signing', key, value: false });
  assert.equal(single.status, 409);
  assert.equal(single.body.code, 'CONSENT_SETTING_RETIRED');
  const firmNameBefore = await settings.getSetting('firm', 'LAW_FIRM_NAME');
  const bulk = await request(app).put('/bulk').send({ settings: [
    { category: 'firm', key: 'LAW_FIRM_NAME', value: 'SHOULD NOT WRITE' },
    { category: 'signing', key, value: false },
  ] });
  assert.equal(bulk.status, 409);
  assert.equal(await settings.getSetting('firm', 'LAW_FIRM_NAME'), firmNameBefore);
});

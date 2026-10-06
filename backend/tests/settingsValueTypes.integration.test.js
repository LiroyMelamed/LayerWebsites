const test=require('node:test'),assert=require('node:assert/strict');const pool=require('../config/db'),settings=require('../services/settingsService');
test('single saves preserve boolean/number types and null clears to fallback',async t=>{
 assert.equal(process.env.DB_NAME,'legal_e2e_qa');assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.CANDIDATE_DB_PORT,'55449');
 const category='synthetic_runtime_type_qa';
 t.after(async()=>{await pool.query('DELETE FROM platform_settings WHERE category=$1',[category]);settings.invalidateCache();await pool.end();});
 await settings.upsertSetting(category,'TEST_FLAG','true',{valueType:'boolean'});
 await settings.upsertSetting(category,'TEST_FLAG','false');
 assert.equal(await settings.getSetting(category,'TEST_FLAG'),false);
 assert.equal((await settings.getAllSettings())[category].TEST_FLAG.valueType,'boolean');
 await settings.upsertSetting(category,'TEST_NUMBER','5',{valueType:'number'});await settings.upsertSetting(category,'TEST_NUMBER','12');assert.equal(await settings.getSetting(category,'TEST_NUMBER'),12);
 await settings.upsertSetting(category,'TEST_TEXT','before');await settings.upsertSetting(category,'TEST_TEXT',null);assert.equal(await settings.getSetting(category,'TEST_TEXT','fallback'),'fallback');
 await settings.bulkUpsert([{category,key:'TEST_TEXT',value:'again'}]);await settings.bulkUpsert([{category,key:'TEST_TEXT',value:null}]);assert.equal(await settings.getSetting(category,'TEST_TEXT','fallback'),'fallback');
});

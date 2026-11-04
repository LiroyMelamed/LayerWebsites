const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const file = require.resolve('../services/settingsService');

test('settings API and cached consumers preserve an explicit empty calendar choice over environment defaults', async () => {
 const keys = ['CALENDAR_REMINDER_OPTIONS','CALENDAR_REMINDER_CHANNELS','CALENDAR_LAWYER_REMINDER_DEFAULTS','CALENDAR_CLIENT_REMINDER_DEFAULTS','CALENDAR_LAWYER_REMINDER_CHANNEL_DEFAULTS','CALENDAR_CLIENT_REMINDER_CHANNEL_DEFAULTS'];
 const rows = keys.map(setting_key => ({category:'calendar',setting_key,setting_value:'',value_type:'string'}));
 rows.push({category:'firm',setting_key:'COMPANY_NAME',setting_value:'',value_type:'string'});
 rows.push({category:'contractor_monitor',setting_key:'CM_ACTIVE_SITES_EMAIL_RECIPIENTS',setting_value:'',value_type:'string'});
 const module = {exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'), {module, console, process:{env:Object.fromEntries([...keys.map(k=>[k,'fallback']),['COMPANY_NAME','Legacy firm']])}, require:name=>{
  if(name.includes('contractorMonitorPolicy')) return require('../lib/contractorMonitorPolicy');
  if(name.includes('config/db')) return {query:async sql=>({rows:sql.includes('current_database() AS')?[{database_name:'melamedlaw'}]:rows})};
  if(name.includes('databaseScope')) return {cacheKey:()=> 'isolated-test'};
  if(name.includes('tenantContext')) return {isMultiTenantMode:()=>false};
  throw new Error(name);
 }});
 for(const key of keys) assert.equal(await module.exports.getSetting('calendar',key,'fallback'),'');
 assert.equal(await module.exports.getSetting('contractor_monitor','CM_ACTIVE_SITES_EMAIL_RECIPIENTS','fallback'),'');
 const all=await module.exports.getAllSettings();
 assert.equal(all.contractor_monitor.CM_ACTIVE_SITES_EMAIL_RECIPIENTS.effectiveValue,'');
 for(const key of keys) assert.equal(all.calendar[key].effectiveValue,'');
 assert.equal(await module.exports.getSetting('firm','COMPANY_NAME'),'Legacy firm');
 rows[0].setting_value=null;module.exports.invalidateCache();
 assert.equal(await module.exports.getSetting('calendar',keys[0]),'fallback');
});

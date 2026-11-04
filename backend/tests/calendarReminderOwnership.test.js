const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
function load(path, mocks) {
    const filename = require.resolve(path), original = createRequire(filename), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, require: id => Object.hasOwn(mocks, id) ? mocks[id] : original(id),
        console, Date, process: { env: {} },
    });
    return module.exports;
}
test('calendar-managed client email awaits custom template and escapes body but not subject', async () => {
    const templates = require('../tasks/emailReminders/templates');
    const api = load('../lib/calendarEmail', {
        '../services/settingsService': {getSetting: async () => '', getEmailTemplate: async () => null},
        '../lib/firmBranding': {},
        './firmBranding': {getFirmDisplayName: async () => 'Synthetic firm', getLawFirmNameHe: async () => ''},
        './calendarEventReminders': {loadCalendarSmsContext: async () => ({firmName:'Synthetic firm',recipientName:'Test',date:'04/11/2026',time:'10:00',title:'Event'})},
        '../tasks/emailReminders/templates': {...templates, getTemplateByKey: async () => ({subject:'[[subject]]',body:'<p>[[client_name]]: [[body]]</p>'})},
    });
    const result = await api.composeCalendarEmail('CALENDAR_REMINDER', {event_type:'reminder',calendar_managed_reminder:true,reminder_subject:'A & B',reminder_template_data:{body:'<script>bad</script>'}}, {recipientName:'Test'});
    assert.equal(result.subject, 'A & B');
    assert.ok(result.htmlBody.includes('&lt;script&gt;bad&lt;/script&gt;'));
    assert.ok(!result.htmlBody.includes('<script>'));
});
test('independent email worker rechecks ownership after locking before any delivery', async () => {
    let delivered = 0;
    const client = {release(){},query:async sql => ({rows: sql.startsWith('SELECT status') ? [{status:'PENDING',calendar_managed:true}] : []})};
    const api = load('../tasks/emailReminders/service', {
        '../../config/db': {query:async sql => {assert.match(sql,/calendar_managed/);return {rows:[{id:1}]};},connect:async()=>client},
        '../../utils/smooveEmailCampaignService': {sendTransactionalCustomHtmlEmail:async()=>{delivered++;return{ok:true}}},
        '../../services/settingsService': {}, '../../lib/firmBranding': {},
        '../../controllers/templateAttachmentController': {},
    });
    const result = await api.processEmailReminders();
    assert.equal(result.skipped,1); assert.equal(delivered,0);
});
test('calendar template email preserves attachments through the attachment-capable sender', async () => {
    const sends=[];
    const api=load('../lib/calendarReminderDispatch',{
        '../config/db':{}, '../utils/sendAndStoreNotification':async()=>{}, '../utils/sendMessage':{},
        '../utils/smooveEmailCampaignService':{sendEmailWithAttachments:async p=>{sends.push(p);return{ok:true}},sendTransactionalCustomHtmlEmail:async()=>{throw Error('wrong sender')}},
        '../lib/calendarEmail':{}, './calendarEmail':{composeCalendarEmail:async()=>({subject:'Test',htmlBody:'<p>Body</p>'})},
        '../controllers/templateAttachmentController':{getAttachmentBuffers:async()=>[{filename:'test.pdf',content:Buffer.from('test')}]},
    });
    const result=await api.dispatchCalendarReminder({email:'recipient@example.invalid',title:'Test',body:'Body',eventChannels:{email:true},emailTemplateKey:'CALENDAR_REMINDER',emailEvent:{calendar_managed_reminder:true,reminder_template_key:'GENERAL'}});
    assert.equal(result.sent,true);assert.equal(sends.length,1);assert.equal(sends[0].attachments[0].filename,'test.pdf');
});

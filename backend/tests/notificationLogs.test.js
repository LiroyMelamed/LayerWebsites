const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const fail of [false, true]) test(`notification logs redact message and recipient data (delivery failure: ${fail})`, async () => {
    const logs = [], deliveries = [];
    const users = [1,2,3].map(id => ({ UserId:id, Name:`PRIVATE_NAME_${id}`, Email:`private_canary_${id}@example.test`, PhoneNumber:`050999000${id}` }));
    const record = async (channel, args) => { deliveries.push({channel,args}); if(fail) throw new Error('PRIVATE_PROVIDER_BODY_123'); return {ok:true}; };
    const dependencies = {
        '../../config/db': { query: async (sql, params) => ({ rows: sql.includes('UserDevices') ? [{fcmtoken:'ExpoPushToken[test]'}] : sql.includes('casemanagerid') ? [{CaseManagerId:3}] : sql.includes('ANY(') ? [users[1]] : [users[Number(params[0])-1]] }) },
        '../../utils/sendAndStoreNotification': (...args) => record('push',args),
        '../../utils/sendMessage': { sendMessage: (...args) => record('sms',args) },
        '../../utils/smooveEmailCampaignService': { sendEmailCampaign: (...args) => record('email',args) },
        '../../utils/phoneUtils': { formatPhoneNumber:x => x },
        '../settingsService': { getChannelConfig: async () => ({ push_enabled:true,email_enabled:true,sms_enabled:true,admin_cc:true,manager_cc:true }), getPlatformAdmins: async () => [{user_id:2}] },
    };
    const module = {exports:{}};
    const log = (...x) => logs.push(x.join(' '));
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/notifications/notificationOrchestrator.js'),'utf8'), {module,require:id => {if (!(id in dependencies)) throw new Error(id); return dependencies[id];}, console:{log,warn:log}, process:{env:{}}});
    const result = await module.exports.notifyRecipient({recipientUserId:1,notificationType:'SIGN_INVITE',caseId:7,push:{title:'PRIVATE_TITLE_123',body:'PRIVATE_BODY_123'},email:{campaignKey:'SIGN_INVITE',contactFields:{recipient_name:'PRIVATE_NAME_1',secret:'PRIVATE_FIELD_123'}},sms:{messageBody:'PRIVATE_SMS_123'}});
    assert.equal(deliveries.length,9);
    assert.equal(result.ok,!fail);
    const output=logs.join('\n');
    for(const secret of ['PRIVATE_TITLE_123','PRIVATE_BODY_123','PRIVATE_FIELD_123','PRIVATE_SMS_123','PRIVATE_PROVIDER_BODY_123',...users.flatMap(u=>[u.Name,u.Email,u.PhoneNumber])]) assert.equal(output.includes(secret),false,`leaked ${secret}`);
    assert.ok(output.includes('notify_orchestrator_attempt'));
    assert.ok(output.includes('notify_orchestrator_result'));
    assert.ok(deliveries.some(d=>JSON.stringify(d.args).includes('PRIVATE_BODY_123')));
});

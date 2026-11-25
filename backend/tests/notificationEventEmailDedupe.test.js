const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFixture({ providerThrows = false } = {}) {
    const sent = { email: [], sms: [], push: [] };
    const users = new Map([
        [1, { UserId: 1, Name: 'Owner', Email: ' Shared@Example.test ', PhoneNumber: '0501' }],
        [2, { UserId: 2, Name: 'Admin', Email: 'shared@example.TEST', PhoneNumber: '0502' }],
        [3, { UserId: 3, Name: 'Manager', Email: 'other@example.test', PhoneNumber: '0503' }],
    ]);
    const deps = {
        '../../config/db': { query: async (sql, params) => {
            if (sql.includes('UserDevices')) return { rows: [] };
            if (sql.includes('casemanagerid')) return { rows: [{ CaseManagerId: 3 }] };
            if (sql.includes('ANY(')) return { rows: [users.get(2)] };
            return { rows: [users.get(Number(params[0]))] };
        } },
        '../../utils/sendAndStoreNotification': async (...args) => sent.push.push(args),
        '../../utils/sendMessage': { sendMessage: async (...args) => { sent.sms.push(args); return { ok: true }; } },
        '../../utils/smooveEmailCampaignService': { sendEmailCampaign: async payload => {
            sent.email.push(payload.toEmail);
            if (providerThrows) throw new Error('synthetic uncertain delivery');
            return { ok: true };
        } },
        '../../utils/phoneUtils': { formatPhoneNumber: value => value },
        '../settingsService': {
            getChannelConfig: async () => ({ email_enabled: true, sms_enabled: true, admin_cc: true, manager_cc: true }),
            getPlatformAdmins: async () => [{ user_id: 2 }],
        },
    };
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/notifications/notificationOrchestrator.js'), 'utf8'), {
        module: mod,
        exports: mod.exports,
        require: id => deps[id],
        console: { log() {}, warn() {} },
        process: { env: {} },
    });
    return { notifyRecipient: mod.exports.notifyRecipient, sent };
}

for (const providerThrows of [false, true]) {
    test(`one event sends once per normalized email and keeps non-email channels (providerThrows=${providerThrows})`, async () => {
        const { notifyRecipient, sent } = loadFixture({ providerThrows });
        const emailDedupeSet = new Set();
        const base = {
            notificationType: 'DOC_SIGNED',
            caseId: 9,
            emailDedupeSet,
            email: { campaignKey: 'DOC_SIGNED' },
            sms: { messageBody: 'synthetic QA only' },
        };
        await notifyRecipient({ ...base, recipientUserId: 1 });
        await notifyRecipient({ ...base, recipientEmail: '  SHARED@example.test ', recipientPhone: '0504', skipAdminCc: true });

        assert.deepEqual(sent.email.map(value => value.trim().toLowerCase()), [
            'shared@example.test',
            'other@example.test',
        ]);
        // Owner, admin and manager SMS plus the explicit duplicate recipient.
        assert.equal(sent.sms.length, 4);
        assert.equal(emailDedupeSet.size, 2);
    });
}

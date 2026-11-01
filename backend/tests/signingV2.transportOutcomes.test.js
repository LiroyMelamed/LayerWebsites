const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('the notification orchestrator preserves transport simulation and provider receipt metadata', async () => {
    for (const result of [{ ok: true, simulated: true, suppressed: true }, { ok: true, messageId: 'provider-receipt' }]) {
        const mod = { exports: {} };
        const unexpected = () => { throw new Error('Unexpected IO'); };
        const deps = {
            '../../config/db': { query: unexpected },
            '../../utils/sendAndStoreNotification': unexpected,
            '../../utils/sendMessage': { sendMessage: async () => result },
            '../../utils/smooveEmailCampaignService': { sendEmailCampaign: async () => result },
            '../../utils/phoneUtils': { formatPhoneNumber: phone => phone },
            '../settingsService': { getChannelConfig: async () => ({}), isAdminCcEnabled: unexpected, getPlatformAdmins: unexpected },
        };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/notifications/notificationOrchestrator.js'), 'utf8'), {
            module: mod, exports: mod.exports, require: id => { if (!(id in deps)) return unexpected(); return deps[id]; },
            console: { log() {}, warn() {} },
        });
        const actual = await mod.exports.notifyRecipient({ recipientEmail: 'test@example.invalid', recipientPhone: '+15555550100',
            notificationType: 'SIGN_INVITE', respectExplicitChannelChoice: true, skipAdminCc: true,
            email: { campaignKey: 'SIGN_INVITE' }, sms: { messageBody: 'QA' } });
        for (const channel of ['email', 'sms']) {
            assert.equal(actual.outcomes[channel].ok, true);
            assert.equal(actual.outcomes[channel].simulated, Boolean(result.simulated));
            assert.equal(actual.outcomes[channel].messageId, result.messageId || null);
        }
    }
});

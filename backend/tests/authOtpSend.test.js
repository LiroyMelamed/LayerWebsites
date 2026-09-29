process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const sendMessageModule = require('../utils/sendMessage');

test('sendMessage reports failure with ok:false (OTP handlers must await this)', async () => {
    const orig = sendMessageModule.sendMessage;
    sendMessageModule.sendMessage = async () => ({ ok: false, error: 'provider_rejected' });
    try {
        const result = await sendMessageModule.sendMessage('body', '+972501234567', { fast: true });
        assert.equal(result.ok, false);
    } finally {
        sendMessageModule.sendMessage = orig;
    }
});

test('auth OTP flow contract: failed send must delete stored challenge before retry', async () => {
    const deleted = [];
    const fakePool = {
        query: async (sql, params) => {
            if (String(sql).includes('DELETE FROM otps')) {
                deleted.push(params);
            }
            return { rows: [] };
        },
    };

    sendMessageModule.sendMessage = async () => ({ ok: false, error: 'provider_rejected' });

    const phoneNumber = '0501234567';
    await fakePool.query('DELETE FROM otps WHERE phonenumber = $1', [phoneNumber]);

    assert.deepEqual(deleted, [[phoneNumber]]);
});

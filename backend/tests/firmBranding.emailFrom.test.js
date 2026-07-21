const test = require('node:test');
const assert = require('node:assert/strict');

const originalEnv = { ...process.env };

test('getEmailFromEmail prefers SMTP_USER when configured', async (t) => {
    process.env.SMTP_USER = 'noreply@example.com';
    process.env.SMTP_FROM_EMAIL = 'legacy@example.com';
    delete require.cache[require.resolve('../services/settingsService')];
    delete require.cache[require.resolve('../lib/firmBranding')];

    const settingsService = require('../services/settingsService');
    const originalGetSetting = settingsService.getSetting;
    settingsService.getSetting = async () => null;

    const { getEmailFromEmail } = require('../lib/firmBranding');
    const from = await getEmailFromEmail();
    assert.equal(from, 'noreply@example.com');

    settingsService.getSetting = originalGetSetting;
});

test('getEmailFromEmail falls back to configured sender when SMTP_USER is unset', async (t) => {
    delete process.env.SMTP_USER;
    process.env.SMTP_FROM_EMAIL = 'noreply@tenant.example.com';
    delete require.cache[require.resolve('../services/settingsService')];
    delete require.cache[require.resolve('../lib/firmBranding')];

    const settingsService = require('../services/settingsService');
    const originalGetSetting = settingsService.getSetting;
    settingsService.getSetting = async () => null;

    const { getEmailFromEmail } = require('../lib/firmBranding');
    const from = await getEmailFromEmail();
    assert.equal(from, 'noreply@tenant.example.com');

    settingsService.getSetting = originalGetSetting;
});

test.after(() => {
    process.env = originalEnv;
});

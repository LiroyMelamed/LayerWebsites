const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFailedPaymentHtml,
    parseBillingAlertEmails,
    getBillingEmailBranding,
} = require('../lib/billing/billingEmails');
const { DEFAULT_BILLING_LOGO_URL } = require('../lib/billing/billingEmailBranding');

test('getBillingEmailBranding uses MelaMedia platform logo by default', () => {
    const prevLogo = process.env.BILLING_EMAIL_LOGO_URL;
    const prevName = process.env.BILLING_EMAIL_BRAND_NAME;
    delete process.env.BILLING_EMAIL_LOGO_URL;
    delete process.env.BILLING_EMAIL_BRAND_NAME;
    try {
        const { firmName, firmLogoUrl } = getBillingEmailBranding();
        assert.equal(firmName, 'MelaMedia');
        assert.equal(firmLogoUrl, DEFAULT_BILLING_LOGO_URL);
    } finally {
        if (prevLogo === undefined) delete process.env.BILLING_EMAIL_LOGO_URL;
        else process.env.BILLING_EMAIL_LOGO_URL = prevLogo;
        if (prevName === undefined) delete process.env.BILLING_EMAIL_BRAND_NAME;
        else process.env.BILLING_EMAIL_BRAND_NAME = prevName;
    }
});

test('buildFailedPaymentHtml includes MelaMedia logo in wrapper', () => {
    const html = buildFailedPaymentHtml({
        amountIls: 100,
        payUrl: 'https://example.com/pay',
        firmName: 'MelaMedia',
        firmLogoUrl: DEFAULT_BILLING_LOGO_URL,
        graceUntil: new Date('2026-10-01T12:00:00Z'),
    });
    assert.match(html, /firm-logo\.png/);
    assert.match(html, /חיוב המנוי נכשל/);
    assert.match(html, /הודעה זו נשלחה אוטומטית/);
});

test('parseBillingAlertEmails splits comma-separated owner alerts', () => {
    const list = parseBillingAlertEmails('a@x.com, b@y.com; c@z.com');
    assert.deepEqual(list, ['a@x.com', 'b@y.com', 'c@z.com']);
});

test('sendFailedPaymentEmails uses branding name in fromName', async () => {
    const prevName = process.env.BILLING_EMAIL_BRAND_NAME;
    process.env.BILLING_EMAIL_BRAND_NAME = 'MelamedLaw';
    const sent = [];
    const smoovePath = require.resolve('../utils/smooveEmailCampaignService');
    const billingPath = require.resolve('../lib/billing/billingEmails');
    delete require.cache[billingPath];
    delete require.cache[smoovePath];
    const smoove = require('../utils/smooveEmailCampaignService');
    smoove.sendEmailWithAttachments = async (payload) => {
        sent.push(payload);
        return { ok: true };
    };
    const billingEmails = require('../lib/billing/billingEmails');
    const settingsService = require('../services/settingsService');
    const prevAdmins = settingsService.getPlatformAdmins;
    settingsService.getPlatformAdmins = async () => [{ email: 'admin@example.com' }];

    try {
        await billingEmails.sendFailedPaymentEmails({ amountIls: 50, last4: '4242' });
        assert.equal(sent.length, 1);
        assert.equal(sent[0].fromName, 'MelamedLaw Billing');
    } finally {
        smoove.sendEmailWithAttachments = require('../utils/smooveEmailCampaignService').sendEmailWithAttachments;
        settingsService.getPlatformAdmins = prevAdmins;
        delete require.cache[billingPath];
        delete require.cache[smoovePath];
        if (prevName === undefined) delete process.env.BILLING_EMAIL_BRAND_NAME;
        else process.env.BILLING_EMAIL_BRAND_NAME = prevName;
    }
});

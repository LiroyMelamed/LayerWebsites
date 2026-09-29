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

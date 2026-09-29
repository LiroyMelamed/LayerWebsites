/** Platform (MelaMedia) branding for SaaS billing emails — not the tenant law-firm logo. */

const DEFAULT_BILLING_LOGO_URL = 'https://melamedia.mela-media.co.il/firm-logo.png?v=4';
const DEFAULT_BILLING_BRAND_NAME = 'MelaMedia';

function getBillingEmailBrandingFromEnv(env = process.env) {
    const firmName = String(env.BILLING_EMAIL_BRAND_NAME || DEFAULT_BILLING_BRAND_NAME).trim()
        || DEFAULT_BILLING_BRAND_NAME;
    const firmLogoUrl = String(env.BILLING_EMAIL_LOGO_URL || DEFAULT_BILLING_LOGO_URL).trim()
        || DEFAULT_BILLING_LOGO_URL;
    return { firmName, firmLogoUrl };
}

module.exports = {
    DEFAULT_BILLING_LOGO_URL,
    DEFAULT_BILLING_BRAND_NAME,
    getBillingEmailBrandingFromEnv,
};

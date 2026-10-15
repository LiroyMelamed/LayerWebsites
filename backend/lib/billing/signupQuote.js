'use strict';
const { PRICING, resolvePricingLineItems } = require('./pricingPackage');
const CONSENT_VERSION = 'signup-1ils-3months-v2';
const SUPPORTED_CONSENT_VERSIONS = ['signup-1ils-3months-v1', CONSENT_VERSION];
// Owner-confirmed 2026-10-12: legal catalogue amounts are final, no VAT added.
const VAT_PERCENT = 0;

function quoteSignup(selection = {}) {
    if (!['site', 'app', 'site_app'].includes(selection.platformId)) {
        throw Object.assign(new Error('יש לבחור אתר, אפליקציה או שניהם'), { code: 'INVALID_PACKAGE' });
    }
    for (const [key, choices] of [['platformId', PRICING.platforms], ['resourceId', PRICING.resources], ['signingId', PRICING.signing]]) {
        if (!choices.some(option => option.id === selection[key])) {
            throw Object.assign(new Error('יש לבחור חבילה תקינה במחירון'), { code: 'INVALID_PACKAGE' });
        }
    }
    if (!['monthly', 'yearly'].includes(selection.billingInterval)) {
        throw Object.assign(new Error('יש לבחור תדירות חיוב תקינה'), { code: 'INVALID_PACKAGE' });
    }
    const pkg = resolvePricingLineItems(selection);
    const net = selection.billingInterval === 'yearly' ? pkg.yearlyTotal : pkg.total;
    // Keep the established annual rounding; never add tax to this final-price catalogue.
    return { ...pkg, netAmountIls: net, recurringAmountIls: Math.round(net * (100 + VAT_PERCENT)) / 100, vatPercent: VAT_PERCENT };
}

function renewalAmount(account, consent) {
    // Existing contracts retain their agreed amounts. New quotes freeze the final charge.
    if (consent?.consent_version === CONSENT_VERSION) {
        const amount = Number(consent.recurring_amount_ils);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('SIGNUP_BILLING_AMOUNT_REQUIRED');
        // The billing row stores the agreed price, never a live catalogue lookup.
        // An explicitly accepted later plan change must not keep charging the signup price.
        if (account.price_monthly_ils != null) {
            const monthly = Number(account.price_monthly_ils);
            if (!Number.isFinite(monthly) || monthly <= 0) throw new Error('SIGNUP_BILLING_AMOUNT_REQUIRED');
            return account.billing_interval === 'yearly' ? Math.round(monthly * 12 * 0.9) : monthly;
        }
        return amount;
    }
    return account.billing_interval === 'yearly'
        ? Math.round(Number(account.price_monthly_ils) * 12 * 0.9)
        : Number(account.price_monthly_ils);
}
module.exports = { CONSENT_VERSION, SUPPORTED_CONSENT_VERSIONS, quoteSignup, renewalAmount };

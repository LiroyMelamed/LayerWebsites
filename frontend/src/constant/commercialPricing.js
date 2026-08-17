export const COMMERCIAL_PRICING = Object.freeze({
    currencySymbol: '₪',

    // 1) Base system (mandatory)
    coreMonthlyAmount: '349',

    // 2) Client channels (mandatory — choose at least one)
    portalMonthlyAmount: '179',
    appMonthlyAmount: '229',
    channelsBundleMonthlyAmount: '349',

    // 3) Resource packages (mandatory)
    resourceBasicMonthlyAmount: '99',
    resourceProMonthlyAmount: '249',
    resourceEnterpriseMonthlyAmount: '699',

    // 4) Signing + Evidence (optional add-on) — monthly packages
    // NOTE: Key names are legacy; values reflect the locked 4-tier model.
    // Starter: ₪199 / 500 docs
    signingAddonMonthlyAmount: '199',
    signingIncludedDocs: '500',
    // Pro: ₪399 / 1,500 docs
    signingBundle500IncludedDocs: '1500',
    signingBundle500MonthlyAmount: '399',
    // Office: ₪799 / 5,000 docs
    signingBundle1500IncludedDocs: '5000',
    signingBundle1500MonthlyAmount: '799',
    // Unlimited: ₪1,299 / month (fair use)
    signingUnlimitedMonthlyAmount: '1299',

    // Legacy: do not use for signing overage. Overage is displayed as per-document rate
    // derived from the selected package (packagePrice / includedDocs).
    signingOveragePerDocAmount: '6',
});

export function normalizeCurrencySymbol(currency) {
    if (!currency) return currency;
    const c = String(currency).trim();
    const upper = c.toUpperCase();
    if (upper === 'ILS' || upper === 'NIS' || c === '₪') return '₪';
    return c;
}

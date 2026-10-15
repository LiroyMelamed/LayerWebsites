export const COMMERCIAL_PRICING = Object.freeze({
    currencySymbol: '₪',

    // 1) Base system (mandatory)
    coreMonthlyAmount: '249',

    // 2) Client channels (mandatory — choose at least one)
    portalMonthlyAmount: '149',
    appMonthlyAmount: '199',
    channelsBundleMonthlyAmount: '299',

    // 3) Resource packages (mandatory)
    resourceBasicMonthlyAmount: '0',
    resourceProMonthlyAmount: '149',
    resourceEnterpriseMonthlyAmount: '399',

    // 4) Signing + Evidence (optional add-on) — monthly packages
    // NOTE: Key names are legacy; values reflect the locked 4-tier model.
    // Starter: ₪129 / 500 docs
    signingAddonMonthlyAmount: '129',
    signingIncludedDocs: '500',
    // Pro: ₪299 / 1,500 docs
    signingBundle500IncludedDocs: '1500',
    signingBundle500MonthlyAmount: '299',
    // Office: ₪599 / 5,000 docs
    signingBundle1500IncludedDocs: '5000',
    signingBundle1500MonthlyAmount: '599',
    // Unlimited: ₪999 / month (fair use)
    signingUnlimitedMonthlyAmount: '999',

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

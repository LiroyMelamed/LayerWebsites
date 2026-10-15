export const COMMERCIAL_PRICING = Object.freeze({
    currencySymbol: '₪',

    // 1) Base system (mandatory)
    coreMonthlyAmount: '296',

    // 2) Client channels (mandatory — choose at least one)
    portalMonthlyAmount: '152',
    appMonthlyAmount: '194',
    channelsBundleMonthlyAmount: '296',

    // 3) Resource packages (mandatory)
    resourceBasicMonthlyAmount: '84',
    resourceProMonthlyAmount: '211',
    resourceEnterpriseMonthlyAmount: '592',

    // 4) Signing + Evidence (optional add-on) — monthly packages
    // NOTE: Key names are legacy; values reflect the locked 4-tier model.
    // Starter: ₪169 / 500 docs
    signingAddonMonthlyAmount: '169',
    signingIncludedDocs: '500',
    // Pro: ₪338 / 1,500 docs
    signingBundle500IncludedDocs: '1500',
    signingBundle500MonthlyAmount: '338',
    // Office: ₪677 / 5,000 docs
    signingBundle1500IncludedDocs: '5000',
    signingBundle1500MonthlyAmount: '677',
    // Unlimited: ₪1,101 / month (fair use)
    signingUnlimitedMonthlyAmount: '1101',

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

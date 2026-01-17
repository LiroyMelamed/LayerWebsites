export const COMMERCIAL_PRICING = Object.freeze({
    currencySymbol: '₪',
    coreMonthlyAmount: '249',
    portalMonthlyAmount: '149',
    appMonthlyAmount: '199',
    channelsBundleMonthlyAmount: '299',
    signingAddonMonthlyAmount: '299',
    signingIncludedDocs: '100',
    signingOveragePerDocAmount: '6',
});

export function normalizeCurrencySymbol(currency) {
    if (!currency) return currency;
    const c = String(currency).trim();
    const upper = c.toUpperCase();
    if (upper === 'ILS' || upper === 'NIS' || c === '₪') return '₪';
    return c;
}

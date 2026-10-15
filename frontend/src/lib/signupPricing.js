import { PRICING_CONFIG, getPricingSelectionDefaults, resolvePricingLineItems } from '../components/pricing/pricingConfig';

export function signupSelection(search) {
    const params = new URLSearchParams(search);
    const selection = {};
    for (const [key, choices] of [['platformId', PRICING_CONFIG.platforms], ['resourceId', PRICING_CONFIG.resources], ['signingId', PRICING_CONFIG.signing]]) {
        const value = params.get(key);
        if (key === 'platformId' && value === 'none') continue;
        if (choices.some(option => option.id === value)) selection[key] = value;
    }
    if (['monthly', 'yearly'].includes(params.get('billingInterval'))) selection.billingInterval = params.get('billingInterval');
    return selection;
}

export function signupQuote(form) {
    const price = resolvePricingLineItems({ ...getPricingSelectionDefaults(), ...form });
    const finalAmount = form.billingInterval === 'yearly' ? price.yearlyTotal : price.total;
    return { ...price, recurringAmountIls: finalAmount };
}

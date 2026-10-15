import { signupSelection, signupQuote } from './signupPricing';

test('public URLs cannot request system-only or an injected price', () => {
    expect(signupSelection('?platformId=none&resourceId=basic&signingId=none&billingInterval=monthly&price=1')).toEqual({resourceId:'basic',signingId:'none',billingInterval:'monthly'});
});
test('website package preserves its choices and final untaxed renewal amount', () => {
    const choice = signupSelection('?platformId=site&resourceId=basic&signingId=none&billingInterval=monthly');
    expect(choice.platformId).toBe('site');
    expect(signupQuote(choice).recurringAmountIls).toBe(532);
    expect(signupQuote({...choice,billingInterval:'yearly'}).recurringAmountIls).toBe(5746);
});

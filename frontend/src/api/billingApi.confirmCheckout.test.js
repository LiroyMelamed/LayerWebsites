import billingApi from './billingApi';
import ApiUtils from './apiUtils';

jest.mock('./apiUtils', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
beforeEach(() => {
    jest.clearAllMocks();
    billingApi.invalidateCaches();
});

test('checkout confirmation preserves the exact created intent and provider order identity', async () => {
    const result = { success: true, data: { success: false, cardVerified: true } };
    ApiUtils.post.mockResolvedValue(result);
    expect(await billingApi.confirmCheckout({ intentId: 'synthetic-intent', uniqId: 'synthetic-order', InternalCode: 0 })).toBe(result);
    expect(ApiUtils.post).toHaveBeenCalledWith('billing/checkout/confirm', { intentId: 'synthetic-intent', uniqId: 'synthetic-order' });
    expect(ApiUtils.post).toHaveBeenCalledTimes(1);
});

test('confirmation clears billing data cached before and during verification', async () => {
    ApiUtils.get.mockResolvedValue({ success: true, data: { billing: { status: 'active' } } });
    await billingApi.getPlan(); await billingApi.getPlan();
    expect(ApiUtils.get).toHaveBeenCalledTimes(1);
    let complete;
    ApiUtils.post.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const confirmation = billingApi.confirmCheckout({ intentId: 'synthetic-intent' });
    await billingApi.getPlan();
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
    complete({ success: true, data: { success: false } });
    await confirmation;
    await billingApi.getPlan();
    expect(ApiUtils.get).toHaveBeenCalledTimes(3);
});

test('a lost confirmation is not retried and still invalidates a stale billing view', async () => {
    ApiUtils.get.mockResolvedValue({ success: true, data: {} });
    await billingApi.getPlan();
    ApiUtils.post.mockRejectedValue(Error('synthetic timeout'));
    await expect(billingApi.confirmCheckout({ intentId: 'synthetic-intent' })).rejects.toThrow('synthetic timeout');
    await billingApi.getPlan();
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
    expect(ApiUtils.post).toHaveBeenCalledTimes(1);
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignupScreen, { SignupCompleteScreen } from './SignupScreen';
import ApiUtils from '../../api/apiUtils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../api/apiUtils', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
// Keep the real signup state, validation, pricing and attribution bridge. These
// chrome-only substitutes avoid loading unrelated app providers or animations.
jest.mock('../loginScreen/components/LoginSimpleScreen', () => ({ children, unScrollableTopComponent, unScrollableBottomComponent }) => <>{unScrollableTopComponent}{children}{unScrollableBottomComponent}</>);
jest.mock('../../components/simpleComponents/SimpleContainer', () => ({ children, ...props }) => <div {...props}>{children}</div>);
jest.mock('../../components/simpleComponents/SimpleCard', () => ({ children, ...props }) => <div {...props}>{children}</div>);
jest.mock('../../components/simpleComponents/SimpleInput', () => ({ title, ...props }) => <label>{title}<input {...props} /></label>);
jest.mock('../../components/styledComponents/buttons/PrimaryButton', () => ({ children, onPress, isPerforming, ...props }) => <button type="button" onClick={onPress} {...props}>{children}</button>);
jest.mock('../../components/styledComponents/buttons/SecondaryButton', () => ({ children, onPress, ...props }) => <button type="button" onClick={onPress} {...props}>{children}</button>);
jest.mock('../../components/specializedComponents/text/AllTextKindFile', () => {
    const Text = ({ children, ...props }) => <span {...props}>{children}</span>;
    return { Text14: Text, TextBold14: Text, TextBold24: Text };
});
jest.mock('../../components/branding/MelaMediaLogo', () => () => null);
jest.mock('../../components/PoweredByMela', () => () => null);

const INTENT = '8f71a44b-8d85-4f63-8d73-1f46818cc402';
const KEY = '1a14a20e-846d-4dfc-8064-a980754890ef';
const EVENT = 'mela-signup-intent-created';
const DRAFT = Object.freeze({
    logoDataUrl: 'data:image/png;base64,c3ludGhldGljLW9ubHk=',
    firmName: ' Synthetic legal QA ', slug: 'synthetic-attribution',
    adminName: ' Synthetic owner ', adminPhone: '0500000000', adminEmail: ' synthetic@example.org ',
    platformId: 'site', resourceId: 'basic', signingId: 'none', billingInterval: 'monthly',
});
const START_BODY = Object.freeze({
    logoDataUrl: DRAFT.logoDataUrl,
    firmName: 'Synthetic legal QA', slug: DRAFT.slug,
    adminName: 'Synthetic owner', adminPhone: DRAFT.adminPhone, adminEmail: 'synthetic@example.org',
    platformId: 'site', resourceId: 'basic', signingId: 'none', billingInterval: 'monthly',
    billingConsent: true, consentVersion: 'signup-1ils-3months-v2',
    idempotencyKey: KEY, expectedPriceIls: 532,
});
const START_RESPONSE = Object.freeze({ data: Object.freeze({ intentId: INTENT }) });
const COMPLETED = Object.freeze({ data: Object.freeze({ status: 'completed', slug: DRAFT.slug }) });
let listener, originalLocation, originalCrypto, assign, calls;

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear(); sessionStorage.clear();
    originalLocation = window.location;
    delete window.location;
    assign = jest.fn();
    window.location = { origin: 'http://localhost', search: '', pathname: '/signup', assign };
    originalCrypto = Object.getOwnPropertyDescriptor(global, 'crypto');
    // CRA's older jsdom does not expose crypto.randomUUID; no real identifier is
    // generated and no product source is changed to accommodate this fixture.
    Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => KEY) } });
    sessionStorage.setItem('legal-signup-form', JSON.stringify(DRAFT));
    calls = [];
    ApiUtils.get.mockImplementation(async path => {
        calls.push(['get', path]);
        if (path !== '/public/signup/config') throw new Error('Unexpected synthetic API read: ' + path);
        return { data: { available: true } };
    });
    ApiUtils.post.mockImplementation(async (path, body) => {
        calls.push(['post', path, body]);
        if (path === '/public/signup/start') return START_RESPONSE;
        if (path === `/public/signup/${INTENT}/checkout`) return COMPLETED;
        throw new Error('Unexpected synthetic API write: ' + path);
    });
});
afterEach(() => {
    if (listener) document.removeEventListener(EVENT, listener);
    listener = null;
    window.location = originalLocation;
    if (originalCrypto) Object.defineProperty(global, 'crypto', originalCrypto);
    else delete global.crypto;
    jest.useRealTimers();
    jest.restoreAllMocks();
});

async function confirmSignup() {
    render(<SignupScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'המשך' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    fireEvent.click(screen.getByRole('checkbox'));
    return screen.getByRole('button', { name: 'המשיכו לתשלום ₪1' });
}
const checkoutCalls = () => ApiUtils.post.mock.calls.filter(([path]) => path.endsWith('/checkout'));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

test('fresh signup preserves its complete payment payload and completes without an analytics listener', async () => {
    fireEvent.click(await confirmSignup());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/synthetic-attribution/LoginStack/LoginScreen', { replace: true }));
    expect(ApiUtils.post.mock.calls).toEqual([
        ['/public/signup/start', START_BODY],
        [`/public/signup/${INTENT}/checkout`],
    ]);
    expect(global.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('legal-signup-key')).toBeNull();
    expect(sessionStorage.getItem('legal-signup-intent')).toBeNull();
    expect(START_RESPONSE).toEqual({ data: { intentId: INTENT } });
    expect(COMPLETED).toEqual({ data: { status: 'completed', slug: DRAFT.slug } });
});

test('resumed signup retains its exact stored key, binds before checkout and redirects without a return-page visit', async () => {
    sessionStorage.setItem('legal-signup-key', KEY);
    sessionStorage.setItem('legal-signup-intent', INTENT);
    const redirectUrl = 'https://app.takbull.co.il/synthetic-checkout';
    const checkout = Object.freeze({ data: Object.freeze({ redirectUrl }) });
    ApiUtils.post.mockImplementation(async (path, body) => {
        calls.push(['post', path, body]);
        return path === '/public/signup/start' ? START_RESPONSE : checkout;
    });
    listener = event => {
        calls.push(['bridge', event.detail.intentId]);
        expect(sessionStorage.getItem('legal-signup-intent')).toBe(INTENT);
        expect(Object.keys(event.detail).sort()).toEqual(['intentId', 'waitUntil']);
        event.detail.waitUntil(Promise.resolve());
    };
    document.addEventListener(EVENT, listener);
    fireEvent.click(await confirmSignup());
    await waitFor(() => expect(assign).toHaveBeenCalledWith(redirectUrl));
    expect(ApiUtils.post.mock.calls).toEqual([
        ['/public/signup/start', START_BODY],
        [`/public/signup/${INTENT}/checkout`],
    ]);
    expect(calls.filter(([kind]) => kind !== 'get').map(([kind, path]) => [kind, path])).toEqual([
        ['post', '/public/signup/start'], ['bridge', INTENT], ['post', `/public/signup/${INTENT}/checkout`],
    ]);
    expect(global.crypto.randomUUID).not.toHaveBeenCalled();
    expect(ApiUtils.get.mock.calls).toEqual([['/public/signup/config']]);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(checkout).toEqual({ data: { redirectUrl } });
});

test('rejected optional attribution still reaches the original checkout and completed response', async () => {
    listener = event => event.detail.waitUntil(Promise.reject(new Error('synthetic analytics outage')));
    document.addEventListener(EVENT, listener);
    fireEvent.click(await confirmSignup());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toEqual([[`/public/signup/${INTENT}/checkout`]]);
    expect(ApiUtils.post.mock.calls[0]).toEqual(['/public/signup/start', START_BODY]);
});

test('a stalled analytics task cannot hold the real signup checkout beyond 350 ms', async () => {
    const submit = await confirmSignup();
    listener = event => event.detail.waitUntil(new Promise(() => {}));
    document.addEventListener(EVENT, listener);
    jest.useFakeTimers();
    fireEvent.click(submit);
    await flush();
    expect(ApiUtils.post.mock.calls[0]).toEqual(['/public/signup/start', START_BODY]);
    expect(checkoutCalls()).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(349); });
    expect(checkoutCalls()).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(checkoutCalls()).toEqual([[`/public/signup/${INTENT}/checkout`]]);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
});

test('a missing start intent does not bind, call checkout or navigate', async () => {
    const observed = jest.fn(); listener = observed;
    document.addEventListener(EVENT, listener);
    ApiUtils.post.mockResolvedValue({ data: {} });
    fireEvent.click(await confirmSignup());
    expect(await screen.findByRole('alert')).toHaveTextContent('הרשמה נכשלה');
    expect(observed).not.toHaveBeenCalled();
    expect(checkoutCalls()).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled(); expect(mockNavigate).not.toHaveBeenCalled();
});

test('return polling binds only confirmed completion and never starts a second checkout or charge', async () => {
    jest.useFakeTimers();
    window.location.search = '?intentId=' + INTENT;
    const observed = jest.fn(event => event.detail.waitUntil(Promise.resolve())); listener = observed;
    document.addEventListener(EVENT, listener);
    ApiUtils.get.mockResolvedValueOnce({ data: { status: 'pending' } }).mockResolvedValueOnce(COMPLETED);
    ApiUtils.post.mockResolvedValue({ data: {} });
    render(<SignupCompleteScreen />);
    await flush();
    expect(observed).not.toHaveBeenCalled(); expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(observed).toHaveBeenCalledTimes(1);
    expect(observed.mock.calls[0][0].detail.intentId).toBe(INTENT);
    expect(ApiUtils.post.mock.calls).toEqual([[`/public/signup/${INTENT}/sync`]]);
    expect(ApiUtils.get.mock.calls).toEqual([[`/public/signup/${INTENT}/status`], [`/public/signup/${INTENT}/status`]]);
    expect(mockNavigate).toHaveBeenCalledWith('/synthetic-attribution/LoginStack/LoginScreen', { replace: true });
});

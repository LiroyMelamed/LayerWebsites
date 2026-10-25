import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignupScreen from './SignupScreen';
import ApiUtils from '../../api/apiUtils';

const mockNavigate = jest.fn();
jest.mock('react-i18next', () => ({ useTranslation: () => ({
    t: key => key.split('.').reduce((value, part) => value?.[part], require('../../i18n/locales/he.json')) || key,
    i18n: { dir: () => 'rtl' },
}) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../api/apiUtils', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
// Keep the real signup state, validation and pricing. These
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
let originalLocation, originalCrypto, assign, calls;

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
    fireEvent.click(screen.getByRole('checkbox', { name: /חיוב חד/ }));
    return screen.getByRole('button', { name: 'המשיכו לתשלום ₪1' });
}

test('QA signup OFF hides the optional WhatsApp choice and preserves the exact incumbent payload', async () => {
    const submit = await confirmSignup();
    expect(screen.queryByRole('checkbox', { name: /MelaMedia/ })).not.toBeInTheDocument();
    fireEvent.click(submit);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/synthetic-attribution/LoginStack/LoginScreen', { replace: true }));
    expect(ApiUtils.post.mock.calls).toEqual([
        ['/public/signup/start', START_BODY], [`/public/signup/${INTENT}/checkout`],
    ]);
});

test('QA signup optional WhatsApp consent starts unchecked and does not gate checkout', async () => {
    ApiUtils.get.mockResolvedValue({ data: { available: true, systemMessages: {
        available: true, consentVersion: 'melamedia-transactional-whatsapp-v1',
    } } });
    const submit = await confirmSignup();
    expect(screen.getByRole('checkbox', { name: /MelaMedia/ })).not.toBeChecked();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(ApiUtils.post.mock.calls).toEqual([
        ['/public/signup/start', { ...START_BODY, systemMessagesConsent: false,
            systemMessagesConsentVersion: 'melamedia-transactional-whatsapp-v1' }],
        [`/public/signup/${INTENT}/checkout`],
    ]);
});

test('QA signup explicit WhatsApp choice is a separate grant and preserves billing and account data', async () => {
    ApiUtils.get.mockResolvedValue({ data: { available: true, systemMessages: {
        available: true, consentVersion: 'melamedia-transactional-whatsapp-v1',
    } } });
    const submit = await confirmSignup();
    fireEvent.click(screen.getByRole('checkbox', { name: /MelaMedia/ }));
    expect(screen.getByRole('checkbox', { name: /חיוב חד/ })).toBeChecked();
    fireEvent.click(submit);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(ApiUtils.post.mock.calls).toEqual([
        ['/public/signup/start', { ...START_BODY, systemMessagesConsent: true,
            systemMessagesConsentVersion: 'melamedia-transactional-whatsapp-v1' }],
        [`/public/signup/${INTENT}/checkout`],
    ]);
});

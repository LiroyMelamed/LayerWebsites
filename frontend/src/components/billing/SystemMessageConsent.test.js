import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SystemMessageConsent, { SystemMessageConsentChoice, SYSTEM_MESSAGE_CONSENT_VERSION } from './SystemMessageConsent';
import ApiUtils from '../../api/apiUtils';
import he from '../../i18n/locales/he.json';
import en from '../../i18n/locales/en.json';
import ar from '../../i18n/locales/ar.json';
let mockLanguage = 'he';
jest.mock('react-i18next', () => ({ useTranslation: () => ({
    t: (key, options = {}) => {
        const values = require('../../i18n/locales/' + mockLanguage + '.json');
        return String(key.split('.').reduce((value, part) => value?.[part], values) || key).replace('{{last4}}', options.last4 || '');
    }, i18n: { dir: () => mockLanguage === 'en' ? 'ltr' : 'rtl' },
}) }));
jest.mock('../../api/apiUtils', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../styledComponents/buttons/PrimaryButton', () => ({ children, onPress, isPerforming, ...props }) => <button type="button" onClick={onPress} {...props}>{children}</button>);
jest.mock('../styledComponents/buttons/SecondaryButton', () => ({ children, onPress, ...props }) => <button type="button" onClick={onPress} {...props}>{children}</button>);
const response = optedIn => ({ success: true, data: { available: true, optedIn, recipient: '+972500000091', version: SYSTEM_MESSAGE_CONSENT_VERSION } });
let originalCrypto;
beforeEach(() => {
    mockLanguage = 'he'; jest.clearAllMocks();
    originalCrypto = Object.getOwnPropertyDescriptor(global, 'crypto');
    Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: jest.fn()
        .mockReturnValueOnce('8206c4ca-9922-42dd-aa26-1d897e092ca3').mockReturnValue('40d9f678-b206-4af8-a8e8-993f532c5842') } });
    ApiUtils.get.mockResolvedValue(response(false)); ApiUtils.post.mockResolvedValue(response(true));
});
afterEach(() => { if (originalCrypto) Object.defineProperty(global, 'crypto', originalCrypto); });

test('explicit unchecked consent uses incumbent checkbox and sends only after Save', async () => {
    render(<SystemMessageConsent />);
    const checkbox = await screen.findByRole('checkbox', { name: he.systemMessages.consentLabel });
    expect(checkbox).not.toBeChecked(); expect(screen.getByRole('button', { name: he.systemMessages.save })).toBeDisabled();
    fireEvent.click(checkbox); expect(ApiUtils.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: he.systemMessages.save }));
    await screen.findByText(he.systemMessages.saved);
    expect(ApiUtils.post).toHaveBeenCalledWith('/billing/system-message-consent', {
        optedIn: true, actionId: '8206c4ca-9922-42dd-aa26-1d897e092ca3', consentVersion: SYSTEM_MESSAGE_CONSENT_VERSION,
    }, { timeout: 12000 });
    expect(screen.getByText(he.systemMessages.recipientHint.replace('{{last4}}', '0091'))).toBeInTheDocument();
});
test('ambiguous save is retried with byte-equivalent source action identity', async () => {
    ApiUtils.post.mockResolvedValueOnce({ success: false, status: 503 }).mockResolvedValueOnce(response(true));
    render(<SystemMessageConsent />); fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: he.systemMessages.save }));
    await screen.findByText(he.systemMessages.saveError);
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: he.systemMessages.save }));
    await screen.findByText(he.systemMessages.saved);
    expect(ApiUtils.post.mock.calls[1]).toEqual(ApiUtils.post.mock.calls[0]);
    expect(global.crypto.randomUUID).toHaveBeenCalledTimes(1);
});
test('withdrawal remains possible after an ambiguous opt-in even when it matches the stale loaded value', async () => {
    ApiUtils.post.mockResolvedValueOnce({ success: false, status: 503 }).mockResolvedValueOnce(response(false));
    render(<SystemMessageConsent />); fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: he.systemMessages.save }));
    await screen.findByText(he.systemMessages.saveError); fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: he.systemMessages.save })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: he.systemMessages.save }));
    await screen.findByText(he.systemMessages.saved);
    expect(ApiUtils.post.mock.calls[1][1]).toEqual({ optedIn: false, actionId: '40d9f678-b206-4af8-a8e8-993f532c5842', consentVersion: SYSTEM_MESSAGE_CONSENT_VERSION });
});
test('a disabled deployment hides optional settings without inventing an opt-in', async () => {
    ApiUtils.get.mockResolvedValue({ success: true, data: { available: false } });
    const { container } = render(<SystemMessageConsent />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(ApiUtils.post).not.toHaveBeenCalled();
});
test('an unacknowledged stale grant requires a fresh explicit choice and never posts automatically', async () => {
    ApiUtils.get.mockResolvedValue({ ...response(false), data: { ...response(false).data, confirmationRequired: true } });
    render(<SystemMessageConsent />);
    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(he.systemMessages.confirmationRequired)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: he.systemMessages.withdrawPrevious })).toBeEnabled();
    expect(ApiUtils.post).not.toHaveBeenCalled();
    fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: he.systemMessages.save }));
    await screen.findByText(he.systemMessages.saved);
    expect(ApiUtils.post).toHaveBeenCalledTimes(1);
    expect(ApiUtils.post.mock.calls[0][1].optedIn).toBe(true);
});
test('a recorded stale grant can be explicitly withdrawn without granting consent again', async () => {
    ApiUtils.get.mockResolvedValue({ ...response(false), data: { ...response(false).data, confirmationRequired: true } });
    ApiUtils.post.mockResolvedValue(response(false));
    render(<SystemMessageConsent />);
    const withdraw = await screen.findByRole('button', { name: he.systemMessages.withdrawPrevious });
    expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(ApiUtils.post).not.toHaveBeenCalled();
    fireEvent.click(withdraw); await screen.findByText(he.systemMessages.saved);
    expect(ApiUtils.post).toHaveBeenCalledWith('/billing/system-message-consent', {
        optedIn: false, actionId: '8206c4ca-9922-42dd-aa26-1d897e092ca3', consentVersion: SYSTEM_MESSAGE_CONSENT_VERSION,
    }, { timeout: 12000 });
});
test('preference load failure offers a retry and never disables other subscription actions', async () => {
    ApiUtils.get.mockResolvedValueOnce({ success: false, status: 500 }).mockResolvedValueOnce(response(false));
    render(<SystemMessageConsent />); await screen.findByText(he.systemMessages.loadError);
    fireEvent.click(screen.getByRole('button', { name: he.common.retry }));
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
    expect(ApiUtils.get).toHaveBeenCalledTimes(2);
});
test('duplicate clicks while a save is pending cannot create another source action', async () => {
    let finish; ApiUtils.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<SystemMessageConsent />); fireEvent.click(await screen.findByRole('checkbox'));
    const save = screen.getByRole('button', { name: he.systemMessages.save });
    fireEvent.click(save); fireEvent.click(save); expect(ApiUtils.post).toHaveBeenCalledTimes(1);
    await act(async () => { finish(response(true)); });
});
test.each([['he', he, 'rtl'], ['ar', ar, 'rtl'], ['en', en, 'ltr']])('consent copy is localized and direction-bound for %s', (language, values, direction) => {
    mockLanguage = language;
    const { container } = render(<SystemMessageConsentChoice checked={false} onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: values.systemMessages.consentLabel })).not.toBeChecked();
    expect(container.firstChild).toHaveAttribute('dir', direction);
    expect(screen.getByText(values.systemMessages.consentHint)).toBeInTheDocument();
});

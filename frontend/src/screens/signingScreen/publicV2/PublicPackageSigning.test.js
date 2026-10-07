import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import signingPublicApi from '../../../api/signingPublicApi';
import PublicPackageSigning, { latinDigits } from './PublicPackageSigning';
import he from '../../../i18n/locales/he.json';
import en from '../../../i18n/locales/en.json';

jest.mock('../../../api/signingPublicApi', () => {
    const actual = jest.requireActual('../../../api/signingPublicApi');
    return { __esModule: true, ...actual, default: { describe: jest.fn(), document: jest.fn() } };
});
jest.mock('../../../components/specializedComponents/signFiles/SignatureCanvas', () => (props) => (
    <div data-testid="signing-canvas">
        {props.nextDocument && <button type="button" onClick={props.nextDocument.onPress}>{props.nextDocument.label}</button>}
        <button type="button" onClick={props.onClose}>close</button>
    </div>
));

if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const TOKEN = 'A'.repeat(43);
async function translations() {
    const instance = createInstance();
    await instance.use(initReactI18next).init({
        resources: { he: { translation: he }, en: { translation: en } },
        lng: 'he', fallbackLng: false, interpolation: { escapeValue: false },
    });
    return instance;
}
const documentFor = (index, state) => ({
    packageId: `p-${index}`,
    documents: [{ documentId: `d-${index}`, name: `Agreement ${index}`, tasks: [{ taskId: `t-${index}`, state, required: true, fields: [] }] }],
});

test('codes typed on an Arabic keypad stay available as latin digits', () => {
    expect(latinDigits('\u0668\u0660\u0669\u0666\u0662\u0660')).toBe('809620');
});

test('a package link opens the regular signing screen, one document at a time', async () => {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue({ person: { name: 'לירוי' }, locale: 'he', consentVersion: 'consent-v',
        packages: [documentFor(1, 'ready'), documentFor(2, 'waiting')] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    render(<I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider>);
    expect(await screen.findByTestId('signing-canvas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signing.canvas.nextDocument') }));
    await waitFor(() => expect(signingPublicApi.describe).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('signing-canvas')).toBeTruthy();
});

test('a link without its token never calls the server', async () => {
    const i18n = await translations();
    window.history.replaceState({}, '', '/ViewSignedDocument/Sign');
    window.sessionStorage.removeItem('lw-signing-v2-grant');
    render(<I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider>);
    expect(await screen.findByText(i18n.t('signing.invalidLinkTitle'))).toBeTruthy();
    expect(signingPublicApi.describe).not.toHaveBeenCalled();
});

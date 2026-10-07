import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import signingPublicApi from '../../../api/signingPublicApi';
import PublicPackageSigning, { latinDigits } from './PublicPackageSigning';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

jest.mock('../../../api/signingPublicApi', () => {
    const actual = jest.requireActual('../../../api/signingPublicApi');
    return { __esModule: true, ...actual, default: {
        describe: jest.fn(), document: jest.fn(), evidence: jest.fn(), session: jest.fn(), challenge: jest.fn(), verify: jest.fn(), accept: jest.fn(),
    } };
});
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => () => <div data-testid="pdf-viewer" />);

if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const TOKEN = 'A'.repeat(43);
const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
async function translations() {
    const instance = createInstance();
    await instance.use(initReactI18next).init({ resources, lng: 'he', fallbackLng: false, interpolation: { escapeValue: false } });
    return instance;
}
const PLURAL = /_(zero|one|two|few|many|other)$/;
const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key.replace(PLURAL, '')}`]);
const failure = (code, status, fieldErrors = []) => Object.assign(new Error(code), { code, status, fieldErrors });

const signatureField = { id: 'sig', type: 'signature', pageNum: 2, required: true };
const pkg = (index, fields = [signatureField]) => ({
    packageId: `p-${index}`, runName: 'Onboarding October', ownerName: 'Synthetic Office', reference: `E${index}`, otherParticipants: [`Employee ${index}`],
    state: 'active', deadline: null, evidence: false,
    documents: [{ documentId: `d-${index}`, name: `Agreement ${index}`, final: false, tasks: [{ taskId: `t-${index}`, state: 'ready', required: true, fields }] }],
});
const view = (locale, packages) => ({ person: { name: 'Synthetic Lawyer' }, locale, consentVersion: 'consent-v', expiresAt: null,
    counts: { ready: packages.length, accepted: 0, waiting: 0 }, packages });

beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function getContext() {
        return { scale() {}, setTransform() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
            measureText: () => ({ width: 100 }) };
    };
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,UE5HU0lHTkFUVVJF';
});
beforeEach(() => {
    Object.values(signingPublicApi).forEach(fn => fn.mockReset());
    window.sessionStorage.clear();
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
});

async function open(locale, packages) {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue(view(locale, packages));
    render(<I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider>);
    const t = i18n.getFixedT(locale);
    await screen.findByRole('heading', { level: 1, name: t('signingV2.public.title') });
    return t;
}

test('every signer-facing string exists in Hebrew, Arabic and English', () => {
    const expected = new Set(keys(he.signingV2.public));
    for (const locale of [ar, en]) expect(new Set(keys(locale.signingV2.public))).toEqual(expected);
    for (const locale of [he, ar, en]) expect(locale.signingV2.delivery.bundled).toBeTruthy();
});

test('the link token leaves the address bar and is sent only as a header', async () => {
    await open('he', [pkg(1)]);
    expect(window.location.hash).toBe('');
    expect(signingPublicApi.describe).toHaveBeenCalledWith(TOKEN);
    expect(window.sessionStorage.getItem('lw-signing-v2-grant')).toBe(TOKEN);
});

test('Hebrew shared signer: one session and one code sign every selected package', async () => {
    const t = await open('he', [pkg(1), pkg(2), pkg(3)]);
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'he');
    const all = screen.getByRole('checkbox', { name: t('signingV2.public.selectAll', { count: 3, formattedCount: '3' }) });
    expect(all).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.sign.continue', { count: 3, formattedCount: '3' }) }));
    const problems = await screen.findByRole('alert', { name: t('signingV2.public.problems', { count: 2, formattedCount: '2' }) });
    expect(problems).toHaveFocus();
    expect(signingPublicApi.session).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: t('signingV2.public.sign.type') }));
    expect(screen.getByLabelText(t('signingV2.public.sign.typedName'))).toHaveValue('Synthetic Lawyer');
    fireEvent.click(screen.getByRole('checkbox', { name: t('signingV2.public.sign.consent', { count: 3, formattedCount: '3' }) }));
    signingPublicApi.session.mockResolvedValue({ sessionId: 's-1', taskCount: 3, channels: [{ channel: 'email', hint: 'l•••@example.invalid' }] });
    signingPublicApi.challenge.mockResolvedValue({ channel: 'email', hint: 'l•••@example.invalid', cooldownSeconds: 30, delivery: 'sent' });
    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.sign.continue', { count: 3, formattedCount: '3' }) }));

    const codeHeading = await screen.findByRole('heading', { name: t('signingV2.public.code.heading') });
    await waitFor(() => expect(codeHeading).toHaveFocus());
    expect(signingPublicApi.session).toHaveBeenCalledWith(TOKEN, { taskIds: ['t-1', 't-2', 't-3'], consentVersion: 'consent-v', locale: 'he' });
    expect(signingPublicApi.challenge).toHaveBeenCalledWith(TOKEN, 's-1', 'email');
    expect(await screen.findByRole('button', { name: t('signingV2.public.code.resendIn', { seconds: '30' }) })).toBeDisabled();

    const code = screen.getByLabelText(t('signingV2.public.code.label'));
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('dir', 'ltr');
    fireEvent.change(code, { target: { value: '12a3' } });
    expect(code).toHaveValue('123');
    const confirm = screen.getByRole('button', { name: t('signingV2.public.code.confirm', { count: 3, formattedCount: '3' }) });
    fireEvent.click(confirm);
    expect(await screen.findByText(t('signingV2.public.errors.CODE_FORMAT'))).toBeInTheDocument();
    expect(signingPublicApi.verify).not.toHaveBeenCalled();

    signingPublicApi.verify.mockRejectedValueOnce(failure('OTP_INVALID', 422, [{ path: 'remainingAttempts', code: '4' }]));
    fireEvent.change(code, { target: { value: '111111' } });
    fireEvent.click(confirm);
    expect(await screen.findByText(t('signingV2.public.errors.OTP_INVALID', { remaining: '4' }))).toBeInTheDocument();
    expect(code).toHaveAttribute('aria-invalid', 'true');

    signingPublicApi.verify.mockResolvedValueOnce({ verified: true });
    signingPublicApi.accept.mockResolvedValue({ tasks: [{ taskId: 't-1' }, { taskId: 't-2' }, { taskId: 't-3' }], packages: [] });
    const finished = view('he', [pkg(1), pkg(2), pkg(3)]);
    finished.packages.forEach(item => { item.documents[0].tasks[0].state = 'accepted'; item.state = 'complete'; item.evidence = true; item.documents[0].final = true; });
    signingPublicApi.describe.mockResolvedValue({ ...finished, counts: { ready: 0, accepted: 3, waiting: 0 } });
    fireEvent.change(code, { target: { value: '654321' } });
    fireEvent.click(confirm);

    expect(await screen.findByRole('heading', { name: t('signingV2.public.done.heading', { count: 3, formattedCount: '3' }) })).toBeInTheDocument();
    const [, , body, key] = signingPublicApi.accept.mock.calls[0];
    expect(body).toEqual({ consent: true, signature: 'UE5HU0lHTkFUVVJF', values: { 't-1': {}, 't-2': {}, 't-3': {} } });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText(t('signingV2.public.done.ready'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t('signingV2.public.downloadFinal') })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: t('signingV2.public.downloadEvidence') })).toHaveLength(3);
});

test('English employee: required text and tick box are checked before a session opens', async () => {
    const fields = [signatureField, { id: 'title', type: 'text', pageNum: 1, required: true, label: 'Job title' },
        { id: 'agree', type: 'checkbox', pageNum: 1, required: true }, { id: 'date', type: 'date', pageNum: 1, required: true }];
    const t = await open('en', [pkg(1, fields)]);
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText(t('signingV2.public.field.dateAuto'))).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Select all/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.sign.continue', { count: 1, formattedCount: '1' }) }));
    const summary = await screen.findByRole('alert', { name: t('signingV2.public.problems', { count: 4, formattedCount: '4' }) });
    const links = within(summary).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['Agreement 1: Job title', 'Agreement 1: Tick box on page 1',
        t('signingV2.public.errors.SIGNATURE_REQUIRED'), t('signingV2.public.errors.CONSENT_REQUIRED')]);
    fireEvent.click(links[0]);
    expect(screen.getByLabelText(/Job title/)).toHaveFocus();
    expect(screen.getByLabelText(/Job title/)).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: '  Analyst  ' } });
    expect(screen.queryByRole('link', { name: 'Agreement 1: Job title' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Job title/)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/Job title/)).toHaveFocus();
    fireEvent.click(screen.getByRole('checkbox', { name: /Tick box on page 1/ }));
    fireEvent.click(screen.getByRole('radio', { name: t('signingV2.public.sign.type') }));
    fireEvent.click(screen.getByRole('checkbox', { name: t('signingV2.public.sign.consent', { count: 1, formattedCount: '1' }) }));
    signingPublicApi.session.mockResolvedValue({ sessionId: 's-2', taskCount: 1, channels: [{ channel: 'sms', hint: '•••4321' }, { channel: 'email', hint: 'o•••@example.invalid' }] });
    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.sign.continue', { count: 1, formattedCount: '1' }) }));

    expect(await screen.findByRole('group', { name: t('signingV2.public.code.choose') })).toBeInTheDocument();
    expect(signingPublicApi.challenge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Email/ }));
    signingPublicApi.challenge.mockRejectedValueOnce(failure('OTP_COOLDOWN', 429, [{ path: 'retryAfterSeconds', code: '12' }]));
    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.code.send') }));
    expect(await screen.findByText(t('signingV2.public.errors.OTP_COOLDOWN', { seconds: '12' }))).toBeInTheDocument();
    expect(signingPublicApi.challenge).toHaveBeenCalledWith(TOKEN, 's-2', 'email');

    signingPublicApi.challenge.mockResolvedValueOnce({ channel: 'email', hint: 'o•••@example.invalid', cooldownSeconds: 30, delivery: 'sent' });
    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.code.send') }));
    fireEvent.change(await screen.findByLabelText(t('signingV2.public.code.label')), { target: { value: '123456' } });
    signingPublicApi.verify.mockResolvedValue({ verified: true });
    signingPublicApi.accept.mockRejectedValueOnce(failure('MANIFEST_CHANGED', 409));
    fireEvent.click(screen.getByRole('button', { name: t('signingV2.public.code.confirm', { count: 1, formattedCount: '1' }) }));
    expect(await screen.findByText(t('signingV2.public.errors.MANIFEST_CHANGED'))).toBeInTheDocument();
    expect(signingPublicApi.accept.mock.calls[0][2].values).toEqual({ 't-1': { title: 'Analyst', agree: true } });
    expect(signingPublicApi.describe).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: t('signingV2.public.sign.heading') })).toBeInTheDocument();
});

test('Arabic: an unknown or expired link explains itself without offering a retry', async () => {
    const i18n = await translations();
    signingPublicApi.describe.mockRejectedValue(failure('NOT_FOUND', 404));
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    Object.defineProperty(navigator, 'language', { value: 'ar-IL', configurable: true });
    render(<I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider>);
    const t = i18n.getFixedT('ar');
    expect(await screen.findByRole('heading', { name: t('signingV2.public.unavailableTitle') })).toBeInTheDocument();
    expect(screen.getByText(t('signingV2.public.errors.NOT_FOUND'))).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl');
    expect(screen.queryByRole('button', { name: t('signingV2.public.retry') })).not.toBeInTheDocument();
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
});

test('codes typed on an Arabic keypad reach the server as 0–9', () => {
    expect(latinDigits('\u0668\u0660\u0669\u0666\u0662\u0660')).toBe('809620');
    expect(latinDigits('\u06F1\u06F2\u06F3 456')).toBe('123 456');
});

test('a link without its token never calls the server', async () => {
    const i18n = await translations();
    window.history.replaceState({}, '', '/ViewSignedDocument/Sign');
    render(<I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider>);
    expect(await screen.findByText(/./, { selector: '[role="alert"] p' })).toBeInTheDocument();
    expect(signingPublicApi.describe).not.toHaveBeenCalled();
});

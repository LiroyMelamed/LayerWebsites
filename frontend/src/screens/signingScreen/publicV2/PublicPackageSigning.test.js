import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import signingPublicApi from '../../../api/signingPublicApi';
import PublicPackageSigning, { latinDigits, readyDocumentGroup } from './PublicPackageSigning';
import he from '../../../i18n/locales/he.json';
import en from '../../../i18n/locales/en.json';
import ar from '../../../i18n/locales/ar.json';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
jest.mock('../../../utils/downloadBlobAsFile', () => ({ downloadBlobAsFile: jest.fn().mockResolvedValue(undefined) }));

jest.mock('../../../api/signingPublicApi', () => {
    const actual = jest.requireActual('../../../api/signingPublicApi');
    return { __esModule: true, ...actual, default: { describe: jest.fn(), document: jest.fn(), evidence: jest.fn(), session: jest.fn() } };
});
jest.mock('../../../components/specializedComponents/signFiles/SignatureCanvas', () => (props) => (
    <div data-testid="signing-canvas">
        {props.multiDocumentAction && <button onClick={props.multiDocumentAction.onPress}>{props.multiDocumentAction.label}</button>}
        {props.documentGroup && <div data-testid="group">{props.documentGroup.documents.map(doc => doc.id).join(',')}</div>}
        {props.nextDocument && <button type="button" onClick={props.nextDocument.onPress}>{props.nextDocument.label}</button>}
        <button type="button" onClick={props.onClose}>close</button>
    </div>
));

if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const TOKEN = 'A'.repeat(43);
async function translations() {
    const instance = createInstance();
    await instance.use(initReactI18next).init({
        resources: { he: { translation: he }, ar: { translation: ar }, en: { translation: en } },
        lng: 'he', fallbackLng: false, interpolation: { escapeValue: false },
    });
    return instance;
}
const documentFor = (index, state) => ({
    packageId: `p-${index}`,
    documents: [{ documentId: `d-${index}`, name: `Agreement ${index}`, tasks: [{ taskId: `t-${index}`, state, required: true, fields: [] }] }],
});

test('a bounded group keeps all ready roles of each PDF together and starts with the viewed PDF', () => {
    const entries = [1, 2, 3].flatMap(id => [1, 2].map(role => ({ document: { documentId: `d${id}` }, task: { taskId: `${id}-${role}` } })));
    expect(readyDocumentGroup(entries, 3, 'd2').map(item => item.task.taskId)).toEqual(['2-1', '2-2']);
    expect(readyDocumentGroup(entries, 4, 'd3').map(item => item.task.taskId)).toEqual(['3-1', '3-2', '1-1', '1-2']);
});

test('600 ready PDFs use explicit 200-document groups, reload between groups and omit waiting stages', async () => {
    const i18n = await translations();
    await i18n.changeLanguage('en');
    const view = { person: { name: 'Synthetic representative' }, consentVersion: 'consent-v', maxTasksPerSession: 200,
        packages: [...Array.from({ length: 600 }, (_, index) => documentFor(index + 1, 'ready')), documentFor(700, 'waiting')] };
    signingPublicApi.describe.mockResolvedValueOnce(view);
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign 200 of 600 ready documents' }));
    expect(screen.getByTestId('group').textContent.split(',')).toHaveLength(200);
    expect(screen.getByTestId('group')).not.toHaveTextContent('d-201');
    expect(screen.getByTestId('group')).not.toHaveTextContent('d-700');
    // Finishing this frozen scope does not authorize the next group automatically.
    const nextView = JSON.parse(JSON.stringify(view));
    nextView.packages.slice(0, 200).forEach(pkg => { pkg.documents[0].tasks[0].state = 'accepted'; });
    signingPublicApi.describe.mockResolvedValueOnce(nextView);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to 400 remaining documents' }));
    expect(await screen.findByRole('button', { name: 'Sign 200 of 400 ready documents' })).toBeInTheDocument();
    expect(screen.queryByTestId('group')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign 200 of 400 ready documents' }));
    expect(screen.getByTestId('group').textContent.split(',')[0]).toBe('d-201');
    nextView.packages.slice(200, 400).forEach(pkg => { pkg.documents[0].tasks[0].state = 'accepted'; });
    signingPublicApi.describe.mockResolvedValueOnce(JSON.parse(JSON.stringify(nextView)));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to 200 remaining documents' }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.public.group.signAll') }));
    expect(screen.getByTestId('group').textContent.split(',')).toHaveLength(200);
    expect(screen.queryByRole('button', { name: /Continue to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('signing.canvas.nextDocument') })).not.toBeInTheDocument();
});

test('codes typed on an Arabic keypad stay available as latin digits', () => {
    expect(latinDigits('\u0668\u0660\u0669\u0666\u0662\u0660')).toBe('809620');
});

test('a package link signs only the document whose turn has arrived', async () => {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue({ person: { name: 'לירוי' }, locale: 'he', consentVersion: 'consent-v',
        packages: [documentFor(1, 'ready'), documentFor(2, 'ready')] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    expect(await screen.findByTestId('signing-canvas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signing.canvas.nextDocument') }));
    await waitFor(() => expect(signingPublicApi.describe).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('signing-canvas')).toBeTruthy();
});

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}

test.each([
    ['Admin', '/AdminStack/MainScreen'],
    ['User', '/ClientStack/ClientMainScreen'],
])('closing leaves the package for the %s home even when another document is waiting', async (role, home) => {
    const i18n = await translations();
    localStorage.setItem('token', 'synthetic-session');
    localStorage.setItem('role', role);
    signingPublicApi.describe.mockResolvedValue({ person: { name: 'לירוי' }, locale: 'he', consentVersion: 'consent-v',
        packages: [documentFor(1, 'ready'), documentFor(2, 'ready')] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${'D'.repeat(43)}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /><LocationProbe /></I18nextProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'close' }));
    expect(await screen.findByTestId('location')).toHaveTextContent(home);
    expect(signingPublicApi.describe).toHaveBeenCalledTimes(1);
});

test('a document that is still waiting for someone else is not offered', async () => {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue({ person: { name: 'לירוי' }, locale: 'he', consentVersion: 'consent-v',
        packages: [documentFor(1, 'waiting')] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${'B'.repeat(43)}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    expect(await screen.findByTestId('signing-canvas')).toBeTruthy();
    expect(screen.queryByRole('button', { name: i18n.t('signing.canvas.nextDocument') })).toBeNull();
});

test('an already signed document stays on the regular completion screen', async () => {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue({ person: { name: 'לירוי' }, locale: 'he', consentVersion: 'consent-v',
        packages: [documentFor(1, 'accepted')] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${'C'.repeat(43)}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    expect(await screen.findByTestId('signing-canvas')).toBeTruthy();
    expect(screen.queryByText(i18n.t('signing.public.closedTitle'))).toBeNull();
});

test('a link without its token never calls the server', async () => {
    const i18n = await translations();
    window.history.replaceState({}, '', '/ViewSignedDocument/Sign');
    window.sessionStorage.removeItem('lw-signing-v2-grant');
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    expect(await screen.findByText(i18n.t('signing.invalidLinkTitle'))).toBeTruthy();
    expect(signingPublicApi.describe).not.toHaveBeenCalled();
});


test.each([
    ['one PDF with many pages and spots', [{ ...documentFor(1, 'ready'), documents: [{ ...documentFor(1, 'ready').documents[0], pages: [1, 2, 3, 4] }] }]],
    ['two roles on the same PDF', [{ documents: [{ documentId: 'same', name: 'Same PDF', tasks: [{ taskId: 'a', state: 'ready' }, { taskId: 'b', state: 'ready' }] }] }]],
    ['a second PDF whose signing turn has not arrived', [documentFor(1, 'ready'), documentFor(2, 'waiting')]],
    ['a second PDF already signed', [documentFor(1, 'ready'), documentFor(2, 'accepted')]],
])('sign-all-documents is absent for %s', async (_name, packages) => {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue({ consentVersion: 'v', packages });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    await screen.findByTestId('signing-canvas');
    expect(screen.queryByRole('button', { name: i18n.t('signingV2.public.group.signAll') })).toBeNull();
});

test('only multiple distinct ready PDFs offer grouping, still through the regular SignatureCanvas', async () => {
    const i18n = await translations();
    signingPublicApi.describe.mockResolvedValue({ consentVersion: 'v',
        packages: [documentFor(1, 'ready'), documentFor(2, 'ready'), documentFor(3, 'waiting')] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.public.group.signAll') }));
    expect(await screen.findByTestId('group')).toHaveTextContent('d-1,d-2');
    expect(screen.queryByRole('button', { name: i18n.t('signing.canvas.nextDocument') })).toBeNull();
    expect(screen.getByTestId('signing-canvas')).toBeTruthy();
});


test.each(['he', 'ar', 'en'])('a read-only completed copy downloads fresh authorized PDFs without mounting a signing flow in %s', async language => {
    const i18n = await translations(); await i18n.changeLanguage(language);
    const file = new Blob(['final-pdf'], { type: 'application/pdf' });
    signingPublicApi.document.mockResolvedValue(file); signingPublicApi.evidence.mockResolvedValue(file);
    signingPublicApi.describe.mockResolvedValue({ readOnly: true, person: { name: 'Synthetic recipient' }, packages: [{
        packageId: 'one-package', reference: 'Employee 1', evidence: true,
        documents: [{ documentId: 'one-doc', name: 'Final agreement', final: true, tasks: [] }],
    }] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    await screen.findByText(i18n.t('signingV2.completedCopy.title'));
    expect(screen.queryByTestId('signing-canvas')).not.toBeInTheDocument();
    expect(signingPublicApi.session).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `${i18n.t('signingV2.public.downloadFinal')}: Final agreement` }));
    await waitFor(() => expect(downloadBlobAsFile).toHaveBeenCalledWith(file, 'Final agreement.pdf'));
    await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('signingV2.completedCopy.receipt') })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.completedCopy.receipt') }));
    await waitFor(() => expect(signingPublicApi.evidence).toHaveBeenCalledWith(TOKEN, 'one-package'));
});

test('a revoked final-document request reports failure and never downloads stale cached content', async () => {
    const i18n = await translations(); await i18n.changeLanguage('en');
    signingPublicApi.document.mockRejectedValue({ code: 'LINK_UNAVAILABLE', status: 404 });
    signingPublicApi.describe.mockResolvedValue({ readOnly: true, packages: [{ packageId: 'p', reference: 'Synthetic package',
        documents: [{ documentId: 'd', name: 'Agreement', final: true, tasks: [] }] }] });
    window.history.replaceState({}, '', `/ViewSignedDocument/Sign#${TOKEN}`);
    const downloads = downloadBlobAsFile.mock.calls.length;
    render(<MemoryRouter><I18nextProvider i18n={i18n}><PublicPackageSigning /></I18nextProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: `${i18n.t('signingV2.public.downloadFinal')}: Agreement` }));
    await screen.findByRole('alert');
    expect(downloadBlobAsFile).toHaveBeenCalledTimes(downloads);
    expect(screen.getByRole('button', { name: `${i18n.t('signingV2.public.downloadFinal')}: Agreement` })).toBeEnabled();
});

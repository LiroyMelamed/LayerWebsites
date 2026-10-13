import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ClientDocumentsScreen, { documentStatus, filterDocuments } from './ClientDocumentsScreen';
import clientPortalApi from '../../../api/clientPortalApi';
import signingFilesApi from '../../../api/signingFilesApi';
import filesApi from '../../../api/filesApi';

let mockFromApp = false;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'he' } }) }));
jest.mock('../../../api/clientPortalApi', () => ({ getDocuments: jest.fn(), openPackageDocument: jest.fn(), CLIENT_PORTAL_REQUEST_OPTIONS: { timeout: 15000 } }));
jest.mock('../../../api/signingFilesApi', () => ({ downloadSignedFile: jest.fn() }));
jest.mock('../../../api/filesApi', () => ({ readStageFile: jest.fn() }));
jest.mock('../../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));
jest.mock('../../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: true }) }));
jest.mock('../../../providers/FromAppProvider', () => ({ useFromApp: () => ({ isFromApp: mockFromApp }) }));
jest.mock('../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../../components/navBars/data/ClientNavBarData', () => ({ getClientNavBarData: jest.fn() }));
jest.mock('../../../components/simpleComponents/SimpleScreen', () => ({ children }) => <div>{children}</div>);
jest.mock('../../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('../../../components/simpleComponents/SimplePopUp', () => ({ children, isOpen, onClose }) => isOpen ? <div role="dialog">{children}<button onClick={onClose}>dismiss</button></div> : null);
jest.mock('../../../components/simpleComponents/SimpleInput', () => props => <input aria-label={props['aria-label']} value={props.value} onChange={props.onChange} />);
jest.mock('../../../components/styledComponents/buttons/PrimaryButton', () => ({ onPress, isPerforming, children }) => <button disabled={isPerforming} onClick={onPress}>{children}</button>);
jest.mock('../../../components/styledComponents/buttons/SecondaryButton', () => ({ onPress, isPerforming, children }) => <button disabled={isPerforming} onClick={onPress}>{children}</button>);
jest.mock('../../../components/styledComponents/buttons/TertiaryButton', () => ({ onPress, children }) => <button onClick={onPress}>{children}</button>);
jest.mock('../../../components/styledComponents/SegmentedSwitch', () => ({ options, value, onChange, ariaLabel }) => <div role="group" aria-label={ariaLabel}>{options.map(option => <button key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>);

const ready = { PortalId: 'signing:1', Source: 'signing', SigningFileId: 1, FileName: 'Ready contract', CaseName: 'Rental', CaseId: 17, Status: 'pending', PersonalStatus: 'pending', CanSignNow: true, CreatedAt: '2026-10-01' };
const signed = { ...ready, PortalId: 'signing:2', SigningFileId: 2, FileName: 'I signed already', PersonalStatus: 'signed', CanSignNow: false, PersonalSignedAt: '2026-10-12' };
const waiting = { ...ready, PortalId: 'signing:3', SigningFileId: 3, FileName: 'Other signer turn', PersonalStatus: 'waiting', CanSignNow: false };
const caseFile = { PortalId: 'case:4', Source: 'case', id: 4, FileName: 'Evidence.pdf', CaseName: 'Rental', CaseId: 17, CreatedAt: '2026-10-02', PersonalStatus: 'view_only', CanDownload: true };
const packageFile = { PortalId: 'package:5', Source: 'package', DocumentId: 5, GrantId: 'grant', FileName: 'Package contract', PersonalStatus: 'pending', CanSignNow: true };
const ok = (files = [], errors = []) => ({ status: 200, data: { files, errors } });
function LocationReadout() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>; }
function show(path = '/office/ClientStack/ClientDocumentsScreen', initialTab = 'all') {
    return render(<MemoryRouter initialEntries={[path]}><ClientDocumentsScreen initialTab={initialTab} /><LocationReadout /></MemoryRouter>);
}
beforeEach(() => {
    jest.resetAllMocks();
    mockFromApp = false;
    delete window.ReactNativeWebView;
    clientPortalApi.getDocuments.mockResolvedValue(ok([ready, signed, waiting, caseFile, packageFile]));
});
afterEach(() => { delete window.ReactNativeWebView; jest.restoreAllMocks(); });

test('pending filter is personal readiness, signed filter is personal signature, and search includes case names', () => {
    const input = [ready, signed, waiting, caseFile, { ...ready, PortalId: 'unknown', CanSignNow: undefined }];
    expect(filterDocuments(input, 'pending', '')).toEqual([ready]);
    expect(filterDocuments(input, 'signed', '')).toEqual([signed]);
    expect(filterDocuments(input, 'all', ' RENTAL ')).toHaveLength(5);
    expect(filterDocuments(input, 'all', 'absent')).toEqual([]);
    expect(filterDocuments(input, 'all', '')[0]).toBe(signed);
    expect(documentStatus(caseFile)).toBe('caseFile');
    expect(documentStatus({ PersonalStatus: 'invented' })).toBe('unavailable');
});

test('tab changes retain tenant scope and signed shortcut does not depend on global completion', async () => {
    show('/office/ClientStack/ClientSignedDocumentsScreen', 'signed');
    expect(await screen.findByRole('button', { name: /I signed already/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ready contract/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clientPortal.filters.pending' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/office/ClientStack/ClientDocumentsScreen?tab=pending');
    expect(screen.getByRole('button', { name: /Ready contract/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Other signer turn/ })).not.toBeInTheDocument();
});

test('search can be cleared and an unavailable query selection never calls a document API', async () => {
    show('/office/ClientStack/ClientDocumentsScreen?document=case%3A999');
    expect(await screen.findByText('clientPortal.documentUnavailable')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(filesApi.readStageFile).not.toHaveBeenCalled();
    expect(clientPortalApi.openPackageDocument).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'clientPortal.searchDocuments' }), { target: { value: 'missing-file' } });
    expect(screen.getByText('clientPortal.noSearchResults')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clientPortal.clearSearch' }));
    expect(screen.getByRole('button', { name: /Ready contract/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(screen.getByTestId('location')).not.toHaveTextContent('document=');
});

test('partial failure retains usable files and retries without showing a false empty library', async () => {
    clientPortalApi.getDocuments.mockResolvedValueOnce(ok([caseFile], ['packages'])).mockResolvedValueOnce(ok([ready, caseFile]));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('clientPortal.partialDocuments');
    expect(screen.getByRole('button', { name: /Evidence.pdf/ })).toBeInTheDocument();
    expect(screen.queryByText('clientPortal.noDocuments')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByRole('button', { name: /Ready contract/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('complete request failure is recoverable and distinguishes unavailability from no documents', async () => {
    clientPortalApi.getDocuments.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok([]));
    show();
    expect(await screen.findByText('clientPortal.documentsTemporarilyUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('clientPortal.noDocuments')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('clientPortal.noDocuments')).toBeInTheDocument();
});

test('legacy ready action and case status use the scoped incumbent routes', async () => {
    show('/office/ClientStack/ClientDocumentsScreen?document=signing%3A1');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'clientPortal.continueSigning' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/office/ClientStack/SigningScreen?fileId=1&open=sign');
    expect(signingFilesApi.downloadSignedFile).not.toHaveBeenCalled();
});

test('case status from the document retains the tenant and selected case', async () => {
    show('/office/ClientStack/ClientDocumentsScreen?document=signing%3A1');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'clientPortal.caseStatus' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/office/ClientStack/ClientCasesScreen?caseId=17');
});

test('waiting document does not offer signing and an incomplete personal signature download is labelled as a current copy', async () => {
    show('/ClientStack/ClientDocumentsScreen?document=signing%3A2');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'clientPortal.continueSigning' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('clientPortal.personalSignatureComplete')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'clientPortal.downloadCurrentCopy' })).toBeInTheDocument();
});

test('case download uses existing access-controlled API and native file handoff without creating a signing link', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    filesApi.readStageFile.mockResolvedValue({ status: 200, data: { readUrl: 'https://files.example.invalid/own-evidence' } });
    show('/ClientStack/ClientDocumentsScreen?document=case%3A4');
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'clientPortal.openFile' }));
    await waitFor(() => expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1));
    expect(filesApi.readStageFile).toHaveBeenCalledWith(4, { timeout: 15000 });
    expect(JSON.parse(window.ReactNativeWebView.postMessage.mock.calls[0][0])).toEqual({ type: 'DOWNLOAD_FILE', payload: { url: 'https://files.example.invalid/own-evidence', fileName: 'Evidence.pdf' } });
    expect(clientPortalApi.openPackageDocument).not.toHaveBeenCalled();
});

test('revoked download reports an error and permits a retry', async () => {
    filesApi.readStageFile.mockResolvedValueOnce({ status: 403 }).mockResolvedValueOnce({ status: 200, data: { readUrl: 'https://files.example.invalid/read' } });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show('/ClientStack/ClientDocumentsScreen?document=case%3A4');
    const button = within(await screen.findByRole('dialog')).getByRole('button', { name: 'clientPortal.openFile' });
    fireEvent.click(button);
    expect(await screen.findByText('clientPortal.openDocumentError')).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('clientPortal.openDocumentError')).not.toBeInTheDocument();
});

test.each(['javascript:alert(1)', 'https://external.example.invalid/steal', '/ViewSignedDocument/Sign?token=old', '/ViewSignedDocument/Sign#short'])('rejects an unsafe or unexpected package entry %s', async url => {
    clientPortalApi.openPackageDocument.mockResolvedValue({ status: 200, data: { url } });
    show('/ClientStack/ClientDocumentsScreen?document=package%3A5');
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'clientPortal.continueSigning' }));
    expect(await screen.findByText('clientPortal.openDocumentError')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('ClientDocumentsScreen');
});

test.each([false, true])('only an explicit package click opens the existing grant via the incumbent route (native=%s)', async native => {
    mockFromApp = native;
    const url = '/ViewSignedDocument/Sign#' + 'a'.repeat(43);
    window.ReactNativeWebView = { postMessage: jest.fn() };
    let resolveOpen;
    clientPortalApi.openPackageDocument.mockReturnValue(new Promise(resolve => { resolveOpen = resolve; }));
    show('/ClientStack/ClientDocumentsScreen?document=package%3A5');
    const button = within(await screen.findByRole('dialog')).getByRole('button', { name: 'clientPortal.continueSigning' });
    expect(clientPortalApi.openPackageDocument).not.toHaveBeenCalled();
    fireEvent.click(button); fireEvent.click(button);
    expect(clientPortalApi.openPackageDocument).toHaveBeenCalledTimes(1);
    expect(clientPortalApi.openPackageDocument).toHaveBeenCalledWith(packageFile);
    await act(async () => resolveOpen({ status: 200, data: { url } }));
    if (native) {
        expect(JSON.parse(window.ReactNativeWebView.postMessage.mock.calls[0][0])).toEqual({ type: 'OPEN_URL', payload: { url: window.location.origin + url } });
        expect(screen.getByTestId('location')).toHaveTextContent('ClientDocumentsScreen');
    } else {
        expect(screen.getByTestId('location')).toHaveTextContent(url);
        expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
    }
});


test('closing the document while its package entry is loading prevents a late navigation or native handoff', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    let resolveOpen;
    clientPortalApi.openPackageDocument.mockReturnValue(new Promise(resolve => { resolveOpen = resolve; }));
    show('/ClientStack/ClientDocumentsScreen?document=package%3A5');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'clientPortal.continueSigning' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'dismiss' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => resolveOpen({ status: 200, data: { url: '/ViewSignedDocument/Sign#' + 'a'.repeat(43) } }));
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/ClientStack/ClientDocumentsScreen');
});


test('loading keeps a selected query pending instead of claiming that its document is unavailable', async () => {
    let resolveList;
    clientPortalApi.getDocuments.mockReturnValue(new Promise(resolve => { resolveList = resolve; }));
    show('/ClientStack/ClientDocumentsScreen?document=case%3A4');
    expect(screen.getByLabelText('common.loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('clientPortal.documentUnavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('clientPortal.noDocuments')).not.toBeInTheDocument();
    await act(async () => resolveList(ok([caseFile])));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('document details focus their title and restore keyboard focus to the selected document on close', async () => {
    show();
    const row = await screen.findByRole('button', { name: /Evidence.pdf/ });
    row.focus();
    fireEvent.click(row);
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Evidence.pdf' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(row).toHaveFocus();
});

test('unmounting while a document is opening does not trigger a late native handoff', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    let resolveRead;
    filesApi.readStageFile.mockReturnValue(new Promise(resolve => { resolveRead = resolve; }));
    const view = show('/ClientStack/ClientDocumentsScreen?document=case%3A4');
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'clientPortal.openFile' }));
    view.unmount();
    await act(async () => resolveRead({ status: 200, data: { readUrl: 'https://files.example.invalid/read' } }));
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
});

test('a returning package signer appears in signed history and pending actions with explicit earlier-stage copy', async () => {
    const returning = { ...packageFile, PersonalSignedAt: '2026-10-01T12:00:00Z', PersonalStatus: 'pending', CanSignNow: true, IsFinal: false };
    const malformed = { ...packageFile, PortalId: 'package:bad-date', PersonalSignedAt: 'invalid' };
    expect(filterDocuments([returning, malformed], 'signed', '')).toEqual([returning]);
    expect(filterDocuments([returning], 'pending', '')).toEqual([returning]);
    clientPortalApi.getDocuments.mockResolvedValue(ok([returning]));
    show('/ClientStack/ClientSignedDocumentsScreen?document=package%3A5', 'signed');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('clientPortal.signedEarlierStage')).toBeInTheDocument();
    expect(within(dialog).getByText('clientPortal.status.pending')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'clientPortal.continueSigning' })).toBeEnabled();
    expect(within(dialog).queryByText('clientPortal.personalSignatureComplete')).not.toBeInTheDocument();
});

test.each(['package', 'case'])('native %s opening with a missing bridge stays on the library and can be retried safely', async source => {
    mockFromApp = true;
    const url = '/ViewSignedDocument/Sign#' + 'b'.repeat(43);
    clientPortalApi.openPackageDocument.mockResolvedValue({ status: 200, data: { url } });
    filesApi.readStageFile.mockResolvedValue({ status: 200, data: { readUrl: 'https://files.example.invalid/read' } });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show('/ClientStack/ClientDocumentsScreen?document=' + (source === 'package' ? 'package%3A5' : 'case%3A4'));
    const button = within(await screen.findByRole('dialog')).getByRole('button', { name: source === 'package' ? 'clientPortal.continueSigning' : 'clientPortal.openFile' });
    fireEvent.click(button);
    expect(await screen.findByText('clientPortal.openDocumentError')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/ClientStack/ClientDocumentsScreen');
    expect(click).not.toHaveBeenCalled();
    window.ReactNativeWebView = { postMessage: jest.fn() };
    fireEvent.click(button);
    await waitFor(() => expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('clientPortal.openDocumentError')).not.toBeInTheDocument();
    expect(JSON.parse(window.ReactNativeWebView.postMessage.mock.calls[0][0]).type).toBe(source === 'package' ? 'OPEN_URL' : 'DOWNLOAD_FILE');
});


test('legacy portal download passes the bounded timeout and remains retryable after timeout rejection', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    signingFilesApi.downloadSignedFile.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
        .mockResolvedValueOnce({ status: 200, data: { downloadUrl: 'https://files.example.invalid/signed-copy' } });
    show('/ClientStack/ClientDocumentsScreen?document=signing%3A2');
    const button = within(await screen.findByRole('dialog')).getByRole('button', { name: 'clientPortal.downloadCurrentCopy' });
    fireEvent.click(button);
    expect(await screen.findByText('clientPortal.openDocumentError')).toBeInTheDocument();
    expect(signingFilesApi.downloadSignedFile).toHaveBeenCalledWith(2, { timeout: 15000 });
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('clientPortal.openDocumentError')).not.toBeInTheDocument();
});

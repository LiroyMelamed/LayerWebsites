import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SigningScreen from './SigningScreen';
import signingFilesApi from '../../api/signingFilesApi';

const mockOpenPopup = jest.fn();
const mockClosePopup = jest.fn();
let mockFromApp = false;
jest.mock('../../api/signingFilesApi', () => ({ getClientSigningFiles: jest.fn(), createClientPublicSigningLink: jest.fn(), downloadSignedFile: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('../../providers/FromAppProvider', () => ({ useFromApp: () => ({ isFromApp: mockFromApp }) }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: mockOpenPopup, closePopup: mockClosePopup }) }));
jest.mock('../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));
jest.mock('../../components/ui/toast', () => ({ toastError: jest.fn() }));
jest.mock('../../navigation/ClientStack', () => ({ ClientStackName: '/ClientStack' }));
jest.mock('../../navigation/LoginStack', () => ({ LoginStackName: '/LoginStack' }));
jest.mock('../loginScreen/LoginScreen', () => ({ LoginScreenName: '/LoginScreen' }));
jest.mock('../client/clientMainScreen/ClientMainScreen', () => ({ ClientMainScreenName: '/ClientMainScreen' }));
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../components/navBars/data/ClientNavBarData', () => ({ getClientNavBarData: jest.fn() }));
jest.mock('../../components/simpleComponents/SimpleScreen', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/specializedComponents/signFiles/SignatureCanvas', () => ({ signingFileId, onClose }) => <div data-testid="incumbent-canvas">{signingFileId}<button onClick={onClose}>close canvas</button></div>);

const ready = { SigningFileId: 17, FileName: 'Own ready document', Status: 'pending', PersonalStatus: 'pending', CanSignNow: true };
const ok = files => ({ status: 200, data: { files } });
function show(search = '?fileId=17&open=sign') {
    return render(<MemoryRouter initialEntries={['/office/ClientStack/SigningScreen' + search]}><SigningScreen /></MemoryRouter>);
}
beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockFromApp = false;
    delete window.ReactNativeWebView;
    signingFilesApi.getClientSigningFiles.mockResolvedValue(ok([ready]));
});
afterEach(() => { delete window.ReactNativeWebView; });

test('waits for the authenticated list and then opens the incumbent canvas only for a personally ready document', async () => {
    let resolveList;
    signingFilesApi.getClientSigningFiles.mockReturnValue(new Promise(resolve => { resolveList = resolve; }));
    show();
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    expect(mockOpenPopup).not.toHaveBeenCalled();
    await act(async () => resolveList(ok([ready])));
    expect(screen.getByTestId('incumbent-canvas')).toHaveTextContent('17');
    expect(signingFilesApi.createClientPublicSigningLink).not.toHaveBeenCalled();
    expect(signingFilesApi.downloadSignedFile).not.toHaveBeenCalled();
});

test('arbitrary query ids outside the authenticated list cannot open signing or a public link', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    show('?fileId=999&open=sign');
    expect(await screen.findByRole('alert')).toHaveTextContent('clientPortal.documentUnavailable');
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    expect(mockOpenPopup).not.toHaveBeenCalled();
    expect(signingFilesApi.createClientPublicSigningLink).not.toHaveBeenCalled();
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
});

test.each([false, undefined])('a document without confirmed readiness opens details, never automatically signs (ready=%s)', async readiness => {
    signingFilesApi.getClientSigningFiles.mockResolvedValue(ok([{ ...ready, CanSignNow: readiness }]));
    show();
    await waitFor(() => expect(mockOpenPopup).toHaveBeenCalledTimes(1));
    expect(mockOpenPopup.mock.calls[0][0].props.file.SigningFileId).toBe(17);
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    expect(signingFilesApi.createClientPublicSigningLink).not.toHaveBeenCalled();
});

test('known not-ready document details omit the signing action even when global status is pending', async () => {
    signingFilesApi.getClientSigningFiles.mockResolvedValue(ok([{ ...ready, CanSignNow: false }]));
    show();
    await waitFor(() => expect(mockOpenPopup).toHaveBeenCalledTimes(1));
    render(mockOpenPopup.mock.calls[0][0]);
    expect(screen.queryByRole('button', { name: 'signing.screen.signDocument' })).not.toBeInTheDocument();
});

test('native entry follows the browser-only legacy signing route exactly once', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    signingFilesApi.createClientPublicSigningLink.mockResolvedValue({ status: 200, data: { token: 'synthetic-token' } });
    show();
    await waitFor(() => expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1));
    expect(signingFilesApi.createClientPublicSigningLink).toHaveBeenCalledWith(17);
    expect(JSON.parse(window.ReactNativeWebView.postMessage.mock.calls[0][0])).toEqual({ type: 'OPEN_URL', payload: { url: window.location.origin + '/ViewSignedDocument/Signing?token=synthetic-token' } });
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    expect(mockClosePopup).toHaveBeenCalledTimes(1);
});

test('closing browser signing refreshes the list once without reopening the same query automatically', async () => {
    show();
    const close = await screen.findByRole('button', { name: 'close canvas' });
    await act(async () => { fireEvent.click(close); });
    await waitFor(() => expect(signingFilesApi.getClientSigningFiles).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
});

test('failed list does not authorize query entry and retry resolves it using only the recovered list', async () => {
    signingFilesApi.getClientSigningFiles.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok([ready]));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.loadFailed');
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByTestId('incumbent-canvas')).toHaveTextContent('17');
});

test('signed tab query shows signed rows and excludes global pending rows', async () => {
    signingFilesApi.getClientSigningFiles.mockResolvedValue(ok([ready, { ...ready, SigningFileId: 18, FileName: 'Completed document', Status: 'signed', CanSignNow: false }]));
    show('?tab=signed');
    expect(await screen.findByRole('button', { name: /Completed document/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Own ready document/ })).not.toBeInTheDocument();
    expect(mockOpenPopup).not.toHaveBeenCalled();
});

test.each([
    { status: 403, data: { token: 'should-not-open' } },
    { status: 200, data: {} },
    new Error('offline'),
])('native opening fails visibly without falling back to an in-app signing pad, then retries (%j)', async failure => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    if (failure instanceof Error) signingFilesApi.createClientPublicSigningLink.mockRejectedValueOnce(failure);
    else signingFilesApi.createClientPublicSigningLink.mockResolvedValueOnce(failure);
    signingFilesApi.createClientPublicSigningLink.mockResolvedValueOnce({ status: 200, data: { token: 'retry-token' } });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('clientPortal.openDocumentError');
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1));
    expect(signingFilesApi.createClientPublicSigningLink).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.ReactNativeWebView.postMessage.mock.calls[0][0]).payload.url).toBe(window.location.origin + '/ViewSignedDocument/Signing?token=retry-token');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
});

test('rapid native retry clicks generate only one new link request', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    let resolveRetry;
    signingFilesApi.createClientPublicSigningLink.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(new Promise(resolve => { resolveRetry = resolve; }));
    show();
    const retry = await screen.findByRole('button', { name: 'common.retry' });
    fireEvent.click(retry); fireEvent.click(retry);
    expect(signingFilesApi.createClientPublicSigningLink).toHaveBeenCalledTimes(2);
    await act(async () => resolveRetry({ status: 200, data: { token: 'synthetic-retry' } }));
    expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1);
});

test('native context with an unavailable bridge offers retry and never embeds the signing pad', async () => {
    mockFromApp = true;
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('clientPortal.openDocumentError');
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
    expect(signingFilesApi.createClientPublicSigningLink).not.toHaveBeenCalled();
    window.ReactNativeWebView = { postMessage: jest.fn() };
    signingFilesApi.createClientPublicSigningLink.mockResolvedValue({ status: 200, data: { token: 'bridge-restored' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('incumbent-canvas')).not.toBeInTheDocument();
});

test('leaving native signing while its link request is in flight suppresses the late browser handoff', async () => {
    mockFromApp = true;
    window.ReactNativeWebView = { postMessage: jest.fn() };
    let resolveLink;
    signingFilesApi.createClientPublicSigningLink.mockReturnValue(new Promise(resolve => { resolveLink = resolve; }));
    const view = show();
    await waitFor(() => expect(signingFilesApi.createClientPublicSigningLink).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => resolveLink({ status: 200, data: { token: 'late-token' } }));
    expect(window.ReactNativeWebView.postMessage).not.toHaveBeenCalled();
});

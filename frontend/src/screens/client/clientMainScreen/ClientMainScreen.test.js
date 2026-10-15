import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ClientMainScreen from './ClientMainScreen';
import casesApi from '../../../api/casesApi';
import clientPortalApi from '../../../api/clientPortalApi';

const mockNavigate = jest.fn();
let mockPathname = '/ClientStack/ClientMainScreen';
let mockIsSmallScreen = false;

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: mockPathname }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, values) => values?.name ? `${key}:${values.name}` : key, i18n: { resolvedLanguage: 'en' } }),
}));
jest.mock('../../../api/casesApi', () => ({ getAllCases: jest.fn() }));
jest.mock('../../../api/clientPortalApi', () => ({ getSigningDocuments: jest.fn() }));
jest.mock('../../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));
jest.mock('../../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: mockIsSmallScreen }) }));
jest.mock('../../../components/navBars/data/ClientNavBarData', () => ({ getClientNavBarData: jest.fn() }));
jest.mock('../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => ({ LogoNavigate }) => <div data-testid="existing-mobile-toolbar">{LogoNavigate}</div>);

const readyFile = { PortalId: 'signing:ready / 1', FileName: 'Ready document', PersonalStatus: 'pending', CanSignNow: true, CaseName: 'My open case' };
const waitingFile = { PortalId: 'package:waiting', FileName: 'Waiting document', PersonalStatus: 'waiting', CanSignNow: false };
const signedFile = { PortalId: 'signing:signed', FileName: 'My signed document', Status: 'pending', PersonalStatus: 'signed', PersonalSignedAt: '2026-10-12T10:00:00Z', CanSignNow: false };
const caseResponse = { status: 200, data: [{ CaseId: 1, CaseName: 'My open case', IsClosed: false }, { CaseId: 2, CaseName: 'My closed case', IsClosed: true }] };
const fileResponse = (files = [], errors = []) => ({ status: 200, data: { files, errors } });

function expectLoadedCaseSummary() {
    const summary = screen.getByRole('complementary', { name: 'clientPortal.caseSummaryTitle' });
    expect(within(summary).getByText('cases.openCases')).toBeInTheDocument();
    expect(within(summary).getByText('cases.closedCases')).toBeInTheDocument();
    expect(within(summary).getAllByText('1')).toHaveLength(2);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/ClientStack/ClientMainScreen';
    mockIsSmallScreen = false;
    casesApi.getAllCases.mockResolvedValue(caseResponse);
    clientPortalApi.getSigningDocuments.mockResolvedValue(fileResponse());
});

test('only confirmed personal readiness becomes an action and personal signatures appear while a document is still globally pending', async () => {
    clientPortalApi.getSigningDocuments.mockResolvedValue(fileResponse([
        readyFile, waitingFile, signedFile,
        { PortalId: 'signing:legacy', FileName: 'Unconfirmed legacy document', Status: 'pending' },
    ]));
    render(<ClientMainScreen />);
    const actions = await screen.findByRole('region', { name: 'clientPortal.actionsTitle' });
    expect(await within(actions).findByRole('button', { name: 'clientPortal.reviewNamedDocument:Ready document' })).toBeEnabled();
    expect(within(actions).getAllByText('clientPortal.waitingForYourSignature')).toHaveLength(1);
    expect(within(actions).getByText('Waiting document')).toBeInTheDocument();
    expect(within(actions).getByText('clientPortal.statusWaiting')).toBeInTheDocument();
    expect(within(actions).getByText('Unconfirmed legacy document')).toBeInTheDocument();
    expect(within(actions).getByText('clientPortal.statusUnavailable')).toBeInTheDocument();
    const signed = screen.getByRole('region', { name: 'clientPortal.recentSigned' });
    expect(within(signed).getByText('My signed document')).toBeInTheDocument();
    expectLoadedCaseSummary();
    expect(screen.queryByRole('heading', { name: 'clientPortal.myCases' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'clientPortal.allCases' })).toHaveLength(1);
});

test('all shortcuts and individual documents retain the active tenant path, and mobile uses the existing toolbar', async () => {
    mockPathname = '/melamedia/ClientStack/ClientMainScreen';
    mockIsSmallScreen = true;
    clientPortalApi.getSigningDocuments.mockResolvedValue(fileResponse([readyFile, signedFile]));
    render(<ClientMainScreen />);
    const quickAccess = screen.getByRole('navigation', { name: 'clientPortal.quickAccess' });
    fireEvent.click(within(quickAccess).getByRole('button', { name: 'clientPortal.myDocuments' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/melamedia/ClientStack/ClientDocumentsScreen');
    expect(within(quickAccess).getAllByRole('button')).toHaveLength(1);
    expect(within(quickAccess).queryByRole('button', { name: 'clientPortal.signedDocuments' })).not.toBeInTheDocument();
    expect(within(quickAccess).queryByRole('button', { name: 'clientPortal.myCases' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clientPortal.allCases' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/melamedia/ClientStack/ClientCasesScreen');
    fireEvent.click(await screen.findByRole('button', { name: 'clientPortal.reviewNamedDocument:Ready document' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/melamedia/ClientStack/ClientDocumentsScreen?document=signing%3Aready%20%2F%201');
    fireEvent.click(screen.getByRole('button', { name: 'clientPortal.allSignedDocuments' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/melamedia/ClientStack/ClientDocumentsScreen?tab=signed');
    fireEvent.click(screen.getByRole('button', { name: 'clientPortal.viewNamedDocument:My signed document' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/melamedia/ClientStack/ClientDocumentsScreen?document=signing%3Asigned');
    expect(screen.getByTestId('existing-mobile-toolbar')).toHaveTextContent('/melamedia/ClientStack/ClientMainScreen');
});

test('a document request failure leaves cases available and retries documents without reloading cases', async () => {
    clientPortalApi.getSigningDocuments.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(fileResponse([readyFile]));
    render(<ClientMainScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.loadFailed');
    expectLoadedCaseSummary();
    expect(screen.queryByText('clientPortal.noActionsTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('Ready document')).toBeInTheDocument();
    expect(clientPortalApi.getSigningDocuments).toHaveBeenCalledTimes(2);
    expect(casesApi.getAllCases).toHaveBeenCalledTimes(1);
});

test('a case failure leaves signing documents available and retries only cases', async () => {
    casesApi.getAllCases.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(caseResponse);
    clientPortalApi.getSigningDocuments.mockResolvedValue(fileResponse([readyFile]));
    render(<ClientMainScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.loadFailed');
    expect(screen.getByText('Ready document')).toBeInTheDocument();
    expect(screen.queryByText('cases.openCases')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(expectLoadedCaseSummary);
    expect(casesApi.getAllCases).toHaveBeenCalledTimes(2);
    expect(clientPortalApi.getSigningDocuments).toHaveBeenCalledTimes(1);
});

test('partial document failure keeps available files visible and avoids claiming all actions or signed documents are empty', async () => {
    clientPortalApi.getSigningDocuments.mockResolvedValueOnce(fileResponse([waitingFile], ['signing'])).mockResolvedValueOnce(fileResponse([readyFile]));
    render(<ClientMainScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('clientPortal.partialDocumentsError');
    expect(screen.getByText('Waiting document')).toBeInTheDocument();
    expect(screen.queryByText('clientPortal.noActionsTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('clientPortal.noSignedDocuments')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('Ready document')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('loading documents never appears as an empty result while cases can finish independently', async () => {
    let resolveDocuments;
    clientPortalApi.getSigningDocuments.mockReturnValue(new Promise(resolve => { resolveDocuments = resolve; }));
    render(<ClientMainScreen />);
    expect(screen.getByRole('status', { name: 'clientPortal.loadingDocuments' })).toBeInTheDocument();
    expect(screen.queryByText('clientPortal.noActionsTitle')).not.toBeInTheDocument();
    await waitFor(expectLoadedCaseSummary);
    await act(async () => resolveDocuments(fileResponse()));
    expect(screen.getByText('clientPortal.noActionsTitle')).toBeInTheDocument();
    expect(screen.getByText('clientPortal.noSignedDocuments')).toBeInTheDocument();
});

test('recent signed documents use personal signature dates and show only the latest three', async () => {
    const files = [1, 4, 2, 3].map(day => ({
        PortalId: `package:${day}`, FileName: `Signed ${day}`, PersonalStatus: 'signed',
        PersonalSignedAt: `2026-10-0${day}T12:00:00Z`, SignedAt: `2026-10-0${5 - day}T12:00:00Z`,
    }));
    clientPortalApi.getSigningDocuments.mockResolvedValue(fileResponse(files));
    render(<ClientMainScreen />);
    const signed = screen.getByRole('region', { name: 'clientPortal.recentSigned' });
    await within(signed).findByText('Signed 4');
    expect(within(signed).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Signed 4', 'Signed 3', 'Signed 2']);
    expect(within(signed).queryByText('Signed 1')).not.toBeInTheDocument();
});

test('a returning signer sees the new ready action and earlier signature history without claiming final completion', async () => {
    const returning = { PortalId: 'package:returning', Source: 'package', FileName: 'Returning stage', PersonalStatus: 'pending', CanSignNow: true, PersonalSignedAt: '2026-10-12T12:00:00Z' };
    clientPortalApi.getSigningDocuments.mockResolvedValue(fileResponse([returning]));
    render(<ClientMainScreen />);
    const actions = screen.getByRole('region', { name: 'clientPortal.actionsTitle' });
    expect(await within(actions).findByRole('button', { name: 'clientPortal.reviewNamedDocument:Returning stage' })).toBeEnabled();
    const history = screen.getByRole('region', { name: 'clientPortal.recentSigned' });
    expect(within(history).getByText('Returning stage')).toBeInTheDocument();
    expect(within(history).getByText('clientPortal.signedEarlierStage')).toBeInTheDocument();
});

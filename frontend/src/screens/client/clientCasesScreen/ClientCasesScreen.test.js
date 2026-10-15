import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientCasesScreen from './ClientCasesScreen';
import { MemoryRouter, useLocation } from 'react-router-dom';
import casesApi from '../../../api/casesApi';

jest.mock('../../../api/casesApi', () => ({ getAllCases: jest.fn() }));
jest.mock('../../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('../../../navigation/ClientStack', () => ({ ClientStackName: '/client' }));
jest.mock('../clientMainScreen/ClientMainScreen', () => ({ ClientMainScreenName: '/home' }));
jest.mock('../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../../../components/navBars/data/ClientNavBarData', () => ({ getClientNavBarData: jest.fn() }));
jest.mock('../../../components/simpleComponents/SimpleScreen', () => ({ children }) => <div>{children}</div>);
jest.mock('../../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('../../../components/styledComponents/buttons/SecondaryButton', () => ({ onPress, children }) => <button onClick={onPress}>{children}</button>);
jest.mock('../clientMainScreen/components/OpenCasesCard', () => ({ openCases, isPerforming, initialOpenCaseId }) => <div data-testid="open-cases" data-initial-open={initialOpenCaseId}>{isPerforming ? 'loading' : `open:${openCases.length}`}{openCases.map(item => <span key={item.CaseId}>{item.CaseName}</span>)}</div>);
jest.mock('../clientMainScreen/components/ClosedCasesCard', () => ({ closedCases, isPerforming, initialOpenCaseId }) => <div data-testid="closed-cases" data-initial-open={initialOpenCaseId}>{isPerforming ? 'loading' : `closed:${closedCases.length}`}{closedCases.map(item => <span key={item.CaseId}>{item.CaseName}</span>)}</div>);

function LocationReadout() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function show(path = '/ClientStack/ClientCasesScreen') {
    return render(<MemoryRouter initialEntries={[path]}><ClientCasesScreen /><LocationReadout /></MemoryRouter>);
}
beforeEach(() => jest.resetAllMocks());

test('a failed load shows retry instead of empty cases, then recovers without a page reload', async () => {
    casesApi.getAllCases.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
        status: 200, data: [{ CaseId: 1, IsClosed: false }, { CaseId: 2, IsClosed: true }],
    });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.loadFailed');
    expect(screen.queryByText('open:0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(screen.getByText('open:1')).toBeInTheDocument());
    expect(screen.getByText('closed:1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
});


test.each([false, true])('selected permitted case uses the incumbent case card and opens its existing accordion (closed=%s)', async closed => {
    casesApi.getAllCases.mockResolvedValue({ status: 200, data: [
        { CaseId: 17, CaseName: 'Selected case', IsClosed: closed },
        { CaseId: 18, CaseName: 'Other case', IsClosed: !closed },
    ] });
    show('/office/ClientStack/ClientCasesScreen?caseId=17');
    expect(await screen.findByText('Selected case')).toBeInTheDocument();
    expect(screen.queryByText('Other case')).not.toBeInTheDocument();
    expect(screen.getByTestId(closed ? 'closed-cases' : 'open-cases')).toHaveAttribute('data-initial-open', '17');
    expect(screen.queryByTestId(closed ? 'open-cases' : 'closed-cases')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clientPortal.allCases' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/office/ClientStack/ClientCasesScreen');
    expect(screen.getByText('Other case')).toBeInTheDocument();
    expect(casesApi.getAllCases).toHaveBeenCalledTimes(1);
});

test('a case outside the authenticated list displays no details and performs no arbitrary case lookup', async () => {
    casesApi.getAllCases.mockResolvedValue({ status: 200, data: [{ CaseId: 17, CaseName: 'Allowed case', IsClosed: false }] });
    show('/ClientStack/ClientCasesScreen?caseId=999');
    expect(await screen.findByRole('alert')).toHaveTextContent('clientPortal.caseUnavailable');
    expect(screen.queryByTestId('open-cases')).not.toBeInTheDocument();
    expect(screen.queryByTestId('closed-cases')).not.toBeInTheDocument();
    expect(screen.queryByText('Allowed case')).not.toBeInTheDocument();
    expect(casesApi.getAllCases).toHaveBeenCalledTimes(1);
});

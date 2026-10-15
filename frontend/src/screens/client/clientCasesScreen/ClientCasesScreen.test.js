import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientCasesScreen from './ClientCasesScreen';
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
jest.mock('../clientMainScreen/components/OpenCasesCard', () => ({ openCases, isPerforming }) => <div>{isPerforming ? 'loading' : `open:${openCases.length}`}</div>);
jest.mock('../clientMainScreen/components/ClosedCasesCard', () => ({ closedCases, isPerforming }) => <div>{isPerforming ? 'loading' : `closed:${closedCases.length}`}</div>);

test('a failed load shows retry instead of empty cases, then recovers without a page reload', async () => {
    casesApi.getAllCases.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
        status: 200, data: [{ IsClosed: false }, { IsClosed: true }],
    });
    render(<ClientCasesScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.loadFailed');
    expect(screen.queryByText('open:0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(screen.getByText('open:1')).toBeInTheDocument());
    expect(screen.getByText('closed:1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
});

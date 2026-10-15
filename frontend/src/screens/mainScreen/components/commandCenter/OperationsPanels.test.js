import React from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import he from '../../../../i18n/locales/he.json';
import ManagerWorkloadChart from './ManagerWorkloadChart';
import CaseOperationsPanel from './CaseOperationsPanel';
import SigningOperationsPanel from './SigningOperationsPanel';
import signingFilesApi from '../../../../api/signingFilesApi';
import { openSigningFileModal } from './openSigningFileModal';

const mockNavigate = jest.fn();
const mockOpenCases = jest.fn();
const mockUnassigned = jest.fn();
const mockSigningQueue = jest.fn();
const mockPopup = { openPopup: jest.fn(), closePopup: jest.fn(), pushPopup: jest.fn() };
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../../../providers/PopUpProvider', () => ({ usePopup: () => mockPopup }));
jest.mock('./dashboardModalUtils', () => ({ createDashboardModalHandlers: () => ({ openOpenCases: mockOpenCases, openUnassignedCases: mockUnassigned, openSigningQueue: mockSigningQueue }) }));
jest.mock('./commandCenterUtils', () => ({
    resolveSigningQueueState: row => row.status || 'pending',
    signalTypeClassName: key => key,
    navigateOpenCasesByManager: (navigate, manager, viewMode) => navigate({ managerId: manager.managerId, viewMode }),
    navigateSigningRow: navigate => navigate('signing'),
}));
jest.mock('./openCaseModal', () => ({ openCaseModal: jest.fn() }));
jest.mock('./openSigningFileModal', () => ({ openSigningFileModal: jest.fn() }));
jest.mock('../../../../api/signingFilesApi', () => ({ getSigningFileSigners: jest.fn(), resendSigningInvite: jest.fn() }));
jest.mock('../../../../components/ui/toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn() }));
jest.mock('../../../../components/specializedComponents/charts/DoughnutChart', () => props => <button onClick={props.onCenterPress}>{props.subText}: {props.centerText}</button>);

const i18n = i18next.createInstance();
i18n.init({ lng: 'he', resources: { he: { translation: he } }, interpolation: { escapeValue: false } });
const show = component => render(<I18nextProvider i18n={i18n}>{component}</I18nextProvider>);
const managers = [
    { managerId: 1, managerName: 'מנהלת דמה א', activeCases: 3, closedCases: 2 },
    { managerId: 2, managerName: 'מנהל דמה ב', activeCases: 2, closedCases: 0 },
];

beforeEach(() => jest.clearAllMocks());

test('case modes preserve counts, shares and the manager selected for navigation', () => {
    const onManagerPress = jest.fn();
    show(<ManagerWorkloadChart managers={managers} onManagerPress={onManagerPress} />);
    expect(screen.getByRole('tab', { name: he.managerHome.operations.viewModeOpen })).toHaveAttribute('aria-selected', 'true');
    let row = screen.getByRole('button', { name: /מנהלת דמה א/ });
    expect(within(row).getByText('3')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onManagerPress).toHaveBeenLastCalledWith(managers[0], 'open');
    fireEvent.click(screen.getByRole('tab', { name: he.managerHome.operations.viewModeClosed }));
    expect(screen.queryByRole('button', { name: /מנהל דמה ב/ })).not.toBeInTheDocument();
    row = screen.getByRole('button', { name: /מנהלת דמה א/ });
    expect(within(row).getByText('2')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onManagerPress).toHaveBeenLastCalledWith(managers[0], 'closed');
    fireEvent.click(screen.getByRole('tab', { name: he.managerHome.operations.viewModeAll }));
    row = screen.getByRole('button', { name: /מנהלת דמה א/ });
    expect(within(row).getByText('5')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onManagerPress).toHaveBeenLastCalledWith(managers[0], 'all');
});

test('case shortcuts keep the same drill-down data', () => {
    const drillDown = { openCases: [{ caseId: 101 }] };
    show(<CaseOperationsPanel managerWorkload={managers} unassignedCases={{ count: 2 }} drillDown={drillDown} />);
    fireEvent.click(screen.getByRole('button', { name: he.managerHome.actions.viewAllCases }));
    expect(mockOpenCases).toHaveBeenCalledWith(drillDown);
    fireEvent.click(screen.getByRole('button', { name: /2.*ללא מנהל/ }));
    expect(mockUnassigned).toHaveBeenCalledWith(drillDown);
});

test('signing cards filter the original queue and open the original file', async () => {
    const signing = { summary: { pending: 2, expiring: 1, expired: 1, rejected: 1 }, queue: [
        { signingFileId: 9, filename: 'מסמך דמה', status: 'pending', caseName: 'תיק דמה', clientName: 'לקוח דמה' },
    ] };
    openSigningFileModal.mockResolvedValue(true);
    show(<SigningOperationsPanel signing={signing} />);
    for (const key of ['pending', 'expiring', 'expired', 'rejected']) {
        fireEvent.click(screen.getByRole('button', { name: `${signing.summary[key]} ${he.managerHome.signing[key]}`, exact: true }));
        expect(mockSigningQueue).toHaveBeenLastCalledWith(signing, key);
    }
    fireEvent.click(screen.getByRole('button', { name: /מסמך דמה/ }));
    await waitFor(() => expect(openSigningFileModal).toHaveBeenCalledWith(expect.objectContaining({ signingFileId: 9 })));
    fireEvent.click(screen.getByRole('button', { name: he.managerHome.actions.viewAll }));
    expect(mockNavigate).toHaveBeenCalledWith('signing');
    expect(signingFilesApi.resendSigningInvite).not.toHaveBeenCalled();
});

test('reminder action still includes only pending signers in pending or expiring files, using mocked delivery', async () => {
    const onDataChanged = jest.fn();
    const signing = { queue: ['pending', 'expiring', 'expired', 'rejected'].map((status, index) => ({ signingFileId: index + 1, filename: `דמה ${index}`, status })) };
    signingFilesApi.getSigningFileSigners.mockResolvedValue({ data: { signers: [{ AllSigned: false, SignerUserId: 7 }, { AllSigned: true, SignerUserId: 8 }] } });
    signingFilesApi.resendSigningInvite.mockResolvedValue({});
    show(<SigningOperationsPanel signing={signing} onDataChanged={onDataChanged} />);
    fireEvent.click(screen.getByRole('button', { name: he.managerHome.signing.remindAll }));
    await waitFor(() => expect(onDataChanged).toHaveBeenCalledTimes(1));
    expect(signingFilesApi.resendSigningInvite.mock.calls).toEqual([[1, [7]], [2, [7]]]);
});

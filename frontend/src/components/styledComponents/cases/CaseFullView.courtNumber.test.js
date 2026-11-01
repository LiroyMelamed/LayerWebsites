import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CaseFullView from './CaseFullView';
import casesApi from '../../../api/casesApi';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';

jest.mock('react-i18next', () => ({ ...jest.requireActual('react-i18next'), useTranslation: () => ({ t: key => key }) }));
jest.mock('../../../api/casesApi', () => ({ __esModule: true, default: { addCase: jest.fn(), updateCaseById: jest.fn(), deleteCaseById: jest.fn(), getCaseByName: jest.fn() }, casesTypeApi: { getCaseTypeByName: jest.fn() } }));
jest.mock('../../../hooks/useAutoHttpRequest');
jest.mock('../../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: jest.fn(), closePopup: jest.fn() }) }));
jest.mock('../../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => ({ canAction: () => true }) }));
jest.mock('../../../screens/signingScreen/templates/SigningPackagesHub', () => ({ useSigningV2Available: () => false }));
jest.mock('../../../screens/signingScreen/templates/CaseSigningFlow', () => () => null);
jest.mock('../../../screens/mainScreen/components/ClientPopUp', () => () => null);
jest.mock('../popups/ConfirmationDialog', () => () => null);
jest.mock('../../simpleComponents/SimplePopUp', () => () => null);
jest.mock('../../simpleComponents/SimpleInput', () => ({ title, value, onChange, error }) => <label>{title}<input value={value ?? ''} onChange={onChange} />{error && <span>{error}</span>}</label>);
jest.mock('../../specializedComponents/containers/SearchInput', () => ({ title, value, onSearch, queryResult, buttonPressFunction, getButtonTextFunction }) => <label>{title}<input value={value ?? ''} onChange={e => onSearch(e.target.value)} />{queryResult?.map((item, i) => <button key={i} onClick={() => buttonPressFunction(getButtonTextFunction(item), item)}>{getButtonTextFunction(item)}</button>)}</label>);

const draft = { CaseName: 'Synthetic case', CaseTypeName: 'Synthetic type', CaseTypeId: 2, CustomerName: 'Synthetic client', UserId: 1398, PhoneNumber: '0500000008', CustomerMail: 'test@example.invalid', CaseManager: 'Synthetic manager', CaseManagerId: 1397 };
beforeEach(() => {
    jest.clearAllMocks();
    useAutoHttpRequest.mockReturnValue({ result: [], isPerforming: false, performRequest: jest.fn() });
    casesApi.addCase.mockResolvedValue({ status: 201, data: { caseId: 302 } });
    casesApi.updateCaseById.mockResolvedValue({ status: 200, data: {} });
});

test('new case starts at stage one and sends its optional court reference with the case', async () => {
    render(<CaseFullView initialDraft={draft} />);
    expect(screen.getByLabelText('cases.currentStage')).toHaveValue('1');
    fireEvent.change(screen.getByLabelText('cases.courtCaseNumber'), { target: { value: '90003-10-26' } });
    fireEvent.click(screen.getByRole('button', { name: 'cases.saveCase' }));
    await waitFor(() => expect(casesApi.addCase).toHaveBeenCalledWith(expect.objectContaining({ CurrentStage: 1, CourtCaseNumber: '90003-10-26', CaseManagerId: 1397, UserIds: [1398] })));
});

test('existing case preserves its stage and court number; clearing the field is saved', async () => {
    render(<CaseFullView caseDetails={{ ...draft, CaseId: 302, CurrentStage: 5, CourtCaseNumber: '90003-10-26' }} />);
    expect(screen.getByLabelText('cases.currentStage')).toHaveValue('5');
    expect(screen.getByLabelText('cases.courtCaseNumber')).toHaveValue('90003-10-26');
    fireEvent.change(screen.getByLabelText('cases.courtCaseNumber'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'cases.updateCase' }));
    await waitFor(() => expect(casesApi.updateCaseById).toHaveBeenCalledWith(302, expect.objectContaining({ CurrentStage: 5, CourtCaseNumber: '', CaseTypeId: 2 })));
    expect(casesApi.addCase).not.toHaveBeenCalled();
});

test('choosing an existing search result edits that case instead of creating a duplicate', async () => {
    const existing = { ...draft, CaseId: 303, CurrentStage: 3, CourtCaseNumber: '91015-10-26' };
    useAutoHttpRequest.mockImplementation(fn => ({ result: fn === casesApi.getCaseByName ? [existing] : [], isPerforming: false, performRequest: jest.fn() }));
    render(<CaseFullView />);
    fireEvent.click(screen.getByRole('button', { name: existing.CaseName }));
    expect(screen.getByLabelText('cases.courtCaseNumber')).toHaveValue(existing.CourtCaseNumber);
    fireEvent.change(screen.getByLabelText('cases.courtCaseNumber'), { target: { value: '91016-10-26' } });
    fireEvent.click(screen.getByRole('button', { name: 'cases.updateCase' }));
    await waitFor(() => expect(casesApi.updateCaseById).toHaveBeenCalledWith(303, expect.objectContaining({ CurrentStage: 3, CourtCaseNumber: '91016-10-26' })));
    expect(casesApi.addCase).not.toHaveBeenCalled();
});

test('invalid court number is rejected locally and a duplicate server response stays visible', async () => {
    casesApi.addCase.mockResolvedValue({ status: 409, data: { message: 'Court number belongs to another case' } });
    render(<CaseFullView initialDraft={draft} />);
    fireEvent.change(screen.getByLabelText('cases.courtCaseNumber'), { target: { value: '123-99-26' } });
    fireEvent.click(screen.getByRole('button', { name: 'cases.saveCase' }));
    expect(screen.getByText('cases.invalidCourtCaseNumber')).toBeInTheDocument();
    expect(casesApi.addCase).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/cases.courtCaseNumber/), { target: { value: '90001-10-26' } });
    fireEvent.click(screen.getByRole('button', { name: 'cases.saveCase' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Court number belongs to another case'));
});

test('court number may be omitted when opening a case', async () => {
    render(<CaseFullView initialDraft={draft} />);
    fireEvent.click(screen.getByRole('button', { name: 'cases.saveCase' }));
    await waitFor(() => expect(casesApi.addCase).toHaveBeenCalledWith(expect.objectContaining({ CourtCaseNumber: '', CurrentStage: 1 })));
});

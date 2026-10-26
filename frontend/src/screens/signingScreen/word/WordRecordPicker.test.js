import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordRecordPicker from './WordRecordPicker';
import WordTemplatesWorkspace from './WordTemplatesWorkspace';
import templatesApi from '../../../api/signingTemplatesApi';
import packagesApi from '../../../api/signingPackagesApi';
import wordApi from '../../../api/wordTemplatesApi';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: { contacts: jest.fn() } }));
jest.mock('../../../api/signingPackagesApi', () => ({ __esModule: true, default: { cases: jest.fn() } }));
jest.mock('../../../api/wordTemplatesApi', () => ({ __esModule: true, default: { list: jest.fn(), load: jest.fn(), preview: jest.fn(), pdf: jest.fn() } }));
jest.mock('../../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn() }));
jest.mock('../templates/useSigningLocale', () => () => ({ direction: 'rtl', number: String, t: (key, values = {}) => key.replace(/^signingWord\./, '') + (values.role ? ` ${values.role}` : '') + (values.field ? ` ${values.field}` : '') }));
jest.mock('../../../components/styledComponents/buttons/TertiaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../../components/simpleComponents/SimpleInput', () => ({ title, value, onChange, disabled }) => <label>{title}<input value={value} disabled={disabled} onChange={onChange} /></label>);
jest.mock('../../../components/ui/StatusNotice', () => ({ children }) => <div role="alert">{children}</div>);
jest.mock('../../../components/simpleComponents/SimplePopUp', () => ({ children }) => <div role="dialog">{children}</div>);
jest.mock('../../../components/styledComponents/popups/ConfirmationDialog', () => () => null);
jest.mock('../templates/SigningBackButton', () => ({ onPress, children }) => <button onClick={onPress}>{children}</button>);
jest.mock('../templates/SigningSelect', () => ({ children, onChange, value, disabled }) => <select value={value} disabled={disabled} onChange={onChange}>{children}</select>);
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => () => <div data-testid="final-pdf" />);
jest.mock('../../../components/specializedComponents/containers/SearchInput', () => ({ title, value, onSearch, queryResult = [], buttonPressFunction, getButtonTextFunction, getSelectValueFunction, disabled }) => <div><label>{title}<input value={value} disabled={disabled} onChange={event => onSearch(event.target.value)} onFocus={() => onSearch(value || '')} /></label>{queryResult.map((item, index) => <button key={index} disabled={disabled} onClick={() => { const text = getSelectValueFunction(item); buttonPressFunction(text, item); onSearch(text); }}>{getButtonTextFunction(item)}</button>)}</div>);

beforeEach(() => {
    jest.clearAllMocks(); URL.createObjectURL = jest.fn(() => 'blob:human-selection'); URL.revokeObjectURL = jest.fn();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => '4f7890f6-619b-4d94-b5ec-48d41be634d6' } });
});

test('primary client context accepts phone clients with User role and email clients without offering office or external roles', async () => {
    templatesApi.contacts.mockResolvedValue({ contacts: [
        { userId: 61, name: 'Phone client', role: 'User', phone: '0000000000' },
        { userId: 62, name: 'Email client', role: 'Client', email: 'client@example.invalid' },
        { userId: 63, name: 'Office manager', role: 'Admin' },
        { userId: 64, name: 'Guest signer', role: 'ExternalSigner' },
    ] });
    const onChange = jest.fn();
    render(<WordRecordPicker kind="client" label="Client" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'client' } });
    await waitFor(() => expect(screen.getByText('Phone client · contactClient · 0000000000')).toBeInTheDocument());
    expect(screen.getByText('Email client · contactClient · client@example.invalid')).toBeInTheDocument();
    expect(screen.queryByText(/Office manager/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Guest signer/)).not.toBeInTheDocument();
    expect(templatesApi.contacts).toHaveBeenLastCalledWith('client', 'client');
    fireEvent.click(screen.getByText('Phone client · contactClient · 0000000000'));
    expect(onChange).toHaveBeenLastCalledWith({ id: 61, label: 'Phone client' });
});

test('ExternalSigner and unknown role labels do not claim office staff status', async () => {
    templatesApi.contacts.mockResolvedValue({ contacts: [
        { userId: 51, name: 'Guest signer', role: 'ExternalSigner' },
        { userId: 52, name: 'Other person', role: 'UnrecognizedRole' },
        { userId: 53, name: 'Office staff', role: 'Staff' },
        { userId: 54, name: 'Office manager', role: 'Admin' },
    ] });
    const onChange = jest.fn();
    render(<WordRecordPicker label="Person" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'person' } });
    await waitFor(() => expect(screen.getByText('Guest signer · contactExternal')).toBeInTheDocument());
    expect(screen.getByText('Other person · contactPerson')).toBeInTheDocument();
    expect(screen.getByText('Office staff · contactStaff')).toBeInTheDocument();
    expect(screen.getByText('Office manager · contactManager')).toBeInTheDocument();
    expect(screen.queryByText('Guest signer · contactStaff')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Guest signer · contactExternal'));
    expect(onChange).toHaveBeenLastCalledWith({ id: 51, label: 'Guest signer' });
});

test('primary context selects clients only while role selection includes managers clients staff and manual entry; clearing invalidates PDF', async () => {
    const contacts = [{ userId: 41, name: 'Office manager', role: 'Admin', email: 'manager@example.invalid' }, { userId: 42, name: 'Tenant client', role: 'Client', email: 'client@example.invalid' }, { userId: 43, name: 'Staff member', role: 'Staff', phone: '0000000000' }];
    templatesApi.contacts.mockResolvedValue({ contacts }); packagesApi.cases.mockResolvedValue({ cases: [] });
    const source = { id: 's', name: 'Rental', version: 1, sourceHash: 'sourcehash', bindingsHash: 'mappinghash', roles: [{ key: 'tenant', label: 'Tenant' }],
        bindings: [{ id: 'b', field: 'client.fullName', required: true, part: 'word/document.xml', paragraphId: 'p', start: 0, end: 2 },
            { id: 'role-b', field: 'role.tenant.fullName', required: true, part: 'word/document.xml', paragraphId: 'p', start: 2, end: 4 }],
        model: { parts: [{ name: 'word/document.xml', paragraphs: [{ id: 'p', text: '____', editable: true, blanks: [{ start: 0, end: 2 }, { start: 2, end: 4 }] }] }] } };
    wordApi.list.mockResolvedValue({ sources: [source], converterAvailable: true }); wordApi.load.mockResolvedValue({ source });
    wordApi.preview.mockResolvedValue({ preview: { id: 'p', requiresFreshSigningGeometry: true } }); wordApi.pdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    render(<WordTemplatesWorkspace onBack={jest.fn()} onContinue={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Rental' })).toBeInTheDocument()); fireEvent.change(screen.getByLabelText('library'), { target: { value: 's' } });
    await waitFor(() => expect(screen.getByLabelText('clientId')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: 'Tenant' } });
    await waitFor(() => expect(screen.getByText(/Tenant client · contactClient/)).toBeInTheDocument());
    expect(screen.queryByText(/Office manager · contactManager/)).not.toBeInTheDocument(); expect(screen.queryByText(/Staff member · contactStaff/)).not.toBeInTheDocument();
    expect(templatesApi.contacts).toHaveBeenLastCalledWith('Tenant', 'client');
    fireEvent.click(screen.getByText(/Tenant client · contactClient/)); expect(screen.getByLabelText('clientId')).toHaveValue('Tenant client');
    fireEvent.change(screen.getByLabelText('roleClientId Tenant'), { target: { value: 'Office' } });
    await waitFor(() => expect(screen.getByText(/Office manager · contactManager/)).toBeInTheDocument());
    expect(screen.getByText(/Tenant client · contactClient/)).toBeInTheDocument(); expect(screen.getByText(/Staff member · contactStaff/)).toBeInTheDocument();
    expect(templatesApi.contacts).toHaveBeenLastCalledWith('Office'); fireEvent.click(screen.getByText(/Office manager · contactManager/));
    fireEvent.click(screen.getByRole('button', { name: 'preview' })); await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument());
    expect(wordApi.preview).toHaveBeenLastCalledWith('s', expect.objectContaining({ inputs: { clientId: 42, roleClientIds: { tenant: 41 }, manualValues: {} } }), expect.any(String));
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: 'New external person' } });
    expect(screen.getByLabelText('clientId')).toHaveValue('New external person'); expect(screen.queryByTestId('final-pdf')).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:human-selection');
    // Explicit manual mode clears the query and saved ID without creating a DB contact.
    fireEvent.click(screen.getByText('withoutClient')); expect(screen.getByLabelText('clientId')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'preview' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('fieldLabel fields.fullName'), { target: { value: 'Document-only client' } });
    fireEvent.click(screen.getByRole('button', { name: 'preview' })); await waitFor(() => expect(wordApi.preview).toHaveBeenCalledTimes(2));
    expect(wordApi.preview.mock.calls[1][1].inputs).not.toHaveProperty('clientId');
    expect(wordApi.preview.mock.calls[1][1].inputs.roleClientIds).toEqual({ tenant: 41 });
    expect(wordApi.preview.mock.calls[1][1].inputs.manualValues).toEqual({ 'client.fullName': 'Document-only client' });
});

test('human case search shows names without numeric IDs, preserves the selection echo and ignores stale results after clearing', async () => {
    let completeOld; packagesApi.cases.mockImplementation(query => query === 'old' ? new Promise(resolve => { completeOld = resolve; }) : Promise.resolve({ cases: [{ id: 87, name: 'Rental dispute', company: 'Example company' }] }));
    function Harness() { const [value, setValue] = useState(null); return <><WordRecordPicker kind="case" label="Case" value={value} onChange={setValue} /><output data-testid="selection">{value ? JSON.stringify(value) : 'none'}</output></>; }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Case'), { target: { value: 'Rental' } });
    await waitFor(() => expect(screen.getByText('Rental dispute · Example company')).toBeInTheDocument()); expect(screen.queryByText('87')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Rental dispute · Example company'));
    expect(screen.getByLabelText('Case')).toHaveValue('Rental dispute'); expect(screen.getByTestId('selection')).toHaveTextContent('{"id":87,"label":"Rental dispute"}');
    fireEvent.change(screen.getByLabelText('Case'), { target: { value: 'old' } }); await waitFor(() => expect(packagesApi.cases).toHaveBeenCalledWith('old'));
    expect(screen.getByTestId('selection')).toHaveTextContent('none'); expect(screen.getByLabelText('Case')).toHaveValue('old');
    fireEvent.click(screen.getByText('withoutCase')); await act(async () => { completeOld({ cases: [{ id: 99, name: 'Stale case' }] }); });
    expect(screen.getByLabelText('Case')).toHaveValue(''); expect(screen.queryByText('Stale case')).not.toBeInTheDocument(); expect(screen.getByTestId('selection')).toHaveTextContent('none');
});

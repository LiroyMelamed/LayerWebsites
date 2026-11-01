import React from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ClientPopup from './ClientPopUp';
import ClientsCard from './ClientsCard';
import { customersApi } from '../../../api/customersApi';
import en from '../../../i18n/locales/en.json';
const mockOpen = jest.fn(), mockClose = jest.fn(), mockRequest = jest.fn();
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
let mockAvailable = true, mockUpload = true, mockView = true;
jest.mock('../../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: mockOpen, closePopup: mockClose }) }));
jest.mock('../../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => ({ canAction: (area, action) => (area === 'clients' && action === 'view' && mockView) || (area === 'signing' && action === 'upload' && mockUpload) }) }));
jest.mock('../../signingScreen/templates/SigningPackagesHub', () => ({ useSigningV2Available: () => mockAvailable }));
jest.mock('../../../hooks/useHttpRequest', () => () => ({ result: [], isPerforming: false, performRequest: mockRequest }));
jest.mock('../../../api/customersApi', () => ({ customersApi: {
    getCustomerById: jest.fn(async id => ({ status: 200, data: { UserId: id, ClientProfile: {} } })),
    getCustomersByName: jest.fn(async () => ({ status: 200, data: [] })),
    getCompaniesByName: jest.fn(), addCustomer: jest.fn(), updateCustomerById: jest.fn(), deleteCustomerById: jest.fn(),
} }));
jest.mock('../../signingScreen/templates/ClientSigningFlow', () => ({ clientId, onBack }) => <section aria-label={`Flow ${clientId}`}><button onClick={onBack}>Return to unchanged editor</button></section>);
const client = { userid: 71, name: 'Synthetic client', email: 'stored@example.invalid', phonenumber: '', companyname: 'Synthetic' };
async function mount(element) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { en: { translation: en } }, lng: 'en', interpolation: { escapeValue: false } });
    return render(<I18nextProvider i18n={i18n}>{element}</I18nextProvider>);
}
beforeEach(() => { jest.clearAllMocks(); mockAvailable = true; mockUpload = true; mockView = true; });
test('entering and returning uses persisted ID, preserves unsaved client edits, and never saves them implicitly', async () => {
    await mount(<ClientPopup clientDetails={client} closePopUpFunction={mockClose} />);
    const email = screen.getByDisplayValue('stored@example.invalid');
    fireEvent.focus(email);
    fireEvent.change(email, { target: { value: 'unsaved@example.invalid' } });
    fireEvent.blur(email); // The incumbent input commits its debounce on real focus change.
    fireEvent.click(screen.getByRole('button', { name: 'Send for signature' }));
    expect(screen.getByRole('region', { name: 'Flow 71' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Return to unchanged editor' }));
    expect(screen.getByDisplayValue('unsaved@example.invalid')).toHaveValue('unsaved@example.invalid');
    expect(mockRequest).not.toHaveBeenCalled();
});
test('the client row opens its popup and signing keeps the persisted client context without an inline list action', async () => {
    await mount(<ClientsCard customerList={[client]} hideButtons />);
    expect(screen.queryByRole('button', { name: 'Send for signature for Synthetic client' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Synthetic client/ }));
    expect(mockOpen).toHaveBeenCalledTimes(1);
    const popup = mockOpen.mock.calls[0][0];
    expect(popup.props.clientDetails).toEqual(client);
    expect(popup.props.closePopUpFunction).toBe(mockClose);
    await mount(popup);
    expect(screen.getByRole('button', { name: en.signingWord.openFromClient })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Send for signature' }));
    expect(screen.getByRole('region', { name: 'Flow 71' })).toBeVisible();
    expect(mockRequest).not.toHaveBeenCalled();
});
test.each(['disabled', 'noUpload', 'unsaved'])('unavailable %s entry is hidden', async condition => {
    if (condition === 'disabled') mockAvailable = false;
    if (condition === 'noUpload') mockUpload = false;
    await mount(<ClientPopup clientDetails={condition === 'unsaved' ? null : client} closePopUpFunction={mockClose} />);
    expect(screen.queryByRole('button', { name: 'Send for signature' })).not.toBeInTheDocument();
});

test('Word client action passes only saved identity and keeps unsaved profile changes out of navigation', async () => {
    await mount(<ClientPopup clientDetails={client} closePopUpFunction={mockClose} />);
    const email = screen.getByDisplayValue('stored@example.invalid');
    fireEvent.focus(email); fireEvent.change(email, { target: { value: 'unsaved@example.invalid' } }); fireEvent.blur(email);
    fireEvent.click(screen.getByRole('button', { name: en.signingWord.openFromClient || 'signingWord.openFromClient' }));
    expect(mockNavigate).toHaveBeenCalledWith('/AdminStack/SigningManagerScreen?panel=templates&mode=word', { state: { wordInitialContext: { clientRecord: { id: 71, label: 'Synthetic client' } } } });
    expect(mockClose).toHaveBeenCalledTimes(1); expect(mockRequest).not.toHaveBeenCalled();
});

test.each(['disabled', 'noUpload', 'unsaved'])('Word client action respects the %s boundary', async condition => {
    if (condition === 'disabled') mockAvailable = false;
    if (condition === 'noUpload') mockUpload = false;
    await mount(<ClientPopup clientDetails={condition === 'unsaved' ? null : client} closePopUpFunction={mockClose} />);
    expect(screen.queryByRole('button', { name: en.signingWord.openFromClient || 'signingWord.openFromClient' })).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled(); expect(mockRequest).not.toHaveBeenCalled();
});

test('a send-only viewer opens the read-only client popup and sends using saved identity without profile reads or writes', async () => {
    const visible = { ...client, phonenumber: '0501234567' };
    Object.defineProperty(visible, 'ClientProfile', { get: () => { throw new Error('Read-only entry must not read identification or address'); } });
    Object.defineProperty(visible, 'dateofbirth', { get: () => { throw new Error('Read-only entry must not read additional details'); } });
    await mount(<ClientsCard customerList={[visible]} allowEdit={false} hideButtons />);
    expect(screen.queryByRole('button', { name: 'Send for signature for Synthetic client' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Synthetic client/ }));
    const popup = mockOpen.mock.calls[0][0]; expect(popup.props.readOnly).toBe(true); expect(popup.props.clientDetails).toBe(visible);
    const view = await mount(popup); const readOnly = within(view.container);
    expect(readOnly.getByText(client.name)).toBeVisible(); expect(readOnly.getByText(client.companyname)).toBeVisible();
    expect(readOnly.getByText(client.email)).toBeVisible(); expect(readOnly.getByText(visible.phonenumber)).toBeVisible();
    expect(readOnly.queryByRole('textbox')).not.toBeInTheDocument(); expect(readOnly.queryByRole('combobox')).not.toBeInTheDocument();
    expect(readOnly.queryByRole('button', { name: en.signingWord.openFromClient })).not.toBeInTheDocument();
    expect(readOnly.queryByRole('button', { name: en.customers.updateCustomer })).not.toBeInTheDocument();
    expect(readOnly.queryByRole('button', { name: en.customers.deleteCustomer })).not.toBeInTheDocument();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)); });
    expect(customersApi.getCustomerById).not.toHaveBeenCalled(); expect(customersApi.getCustomersByName).not.toHaveBeenCalled();
    expect(customersApi.getCompaniesByName).not.toHaveBeenCalled();
    fireEvent.click(readOnly.getByRole('button', { name: 'Send for signature' }));
    expect(mockOpen).toHaveBeenCalledTimes(2);
    expect(mockOpen.mock.calls[1][0].props.clientId).toBe(71); expect(mockOpen.mock.calls[1][0].props.onBack).toBe(mockClose);
    await mount(mockOpen.mock.calls[1][0]); expect(screen.getByRole('region', { name: 'Flow 71' })).toBeVisible();
    expect(mockRequest).not.toHaveBeenCalled(); expect(customersApi.addCustomer).not.toHaveBeenCalled();
    expect(customersApi.updateCustomerById).not.toHaveBeenCalled(); expect(customersApi.deleteCustomerById).not.toHaveBeenCalled();
});

test.each(['noUpload', 'unavailable', 'noView'])('a client row with neither edit nor permitted signing stays non-interactive: %s', async condition => {
    if (condition === 'noUpload') mockUpload = false;
    if (condition === 'unavailable') mockAvailable = false;
    if (condition === 'noView') mockView = false;
    await mount(<ClientsCard customerList={[client]} allowEdit={false} hideButtons />);
    expect(screen.queryByRole('button', { name: /Synthetic client/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(client.name)); expect(mockOpen).not.toHaveBeenCalled();
});

test('a read-only popup without a permitted send callback exposes close only and performs no profile or write requests', async () => {
    await mount(<ClientPopup readOnly clientDetails={client} closePopUpFunction={mockClose} />);
    expect(screen.queryByRole('button', { name: 'Send for signature' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.signingWord.openFromClient })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.close })); expect(mockClose).toHaveBeenCalledTimes(1);
    await act(async () => Promise.resolve());
    expect(customersApi.getCustomerById).not.toHaveBeenCalled(); expect(mockRequest).not.toHaveBeenCalled();
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ClientPopup from './ClientPopUp';
import ClientsCard from './ClientsCard';
import en from '../../../i18n/locales/en.json';
const mockOpen = jest.fn(), mockClose = jest.fn(), mockRequest = jest.fn();
let mockAvailable = true, mockUpload = true;
jest.mock('../../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: mockOpen, closePopup: mockClose }) }));
jest.mock('../../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => ({ canAction: (area, action) => (area === 'clients' && action === 'view') || (area === 'signing' && action === 'upload' && mockUpload) }) }));
jest.mock('../../signingScreen/templates/SigningPackagesHub', () => ({ useSigningV2Available: () => mockAvailable }));
jest.mock('../../../hooks/useHttpRequest', () => () => ({ result: [], isPerforming: false, performRequest: mockRequest }));
jest.mock('../../signingScreen/templates/ClientSigningFlow', () => ({ clientId, onBack }) => <section aria-label={`Flow ${clientId}`}><button onClick={onBack}>Return to unchanged editor</button></section>);
const client = { userid: 71, name: 'Synthetic client', email: 'stored@example.invalid', phonenumber: '', companyname: 'Synthetic' };
async function mount(element) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { en: { translation: en } }, lng: 'en', interpolation: { escapeValue: false } });
    return render(<I18nextProvider i18n={i18n}>{element}</I18nextProvider>);
}
beforeEach(() => { mockOpen.mockClear(); mockRequest.mockClear(); mockAvailable = true; mockUpload = true; });
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
test('client viewers can send without client-edit permission through a separate accessible action', async () => {
    await mount(<ClientsCard customerList={[client]} allowEdit={false} hideButtons />);
    fireEvent.click(screen.getByRole('button', { name: 'Send for signature for Synthetic client' }));
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen.mock.calls[0][0].props.clientId).toBe(71);
    expect(mockOpen.mock.calls[0][0].props.onBack).toBe(mockClose);
});
test.each(['disabled', 'noUpload', 'unsaved'])('unavailable %s entry is hidden', async condition => {
    if (condition === 'disabled') mockAvailable = false;
    if (condition === 'noUpload') mockUpload = false;
    await mount(<ClientPopup clientDetails={condition === 'unsaved' ? null : client} closePopUpFunction={mockClose} />);
    expect(screen.queryByRole('button', { name: 'Send for signature' })).not.toBeInTheDocument();
});

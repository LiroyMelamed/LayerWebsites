import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ClientPopup from './ClientPopUp';
import { customersApi } from '../../../api/customersApi';
import { clientDocumentProfile, clientDocumentProfileErrors, invalidClientText } from '../../../functions/validation/clientDocumentProfile';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

jest.mock('../../../api/customersApi', () => ({ customersApi: {
    getCustomersByName: jest.fn(), getCustomerById: jest.fn(), getCompaniesByName: jest.fn(), addCustomer: jest.fn(),
    updateCustomerById: jest.fn(), deleteCustomerById: jest.fn(),
} }));
jest.mock('../../signingScreen/templates/ClientSigningFlow', () => () => null);
jest.mock('../../signingScreen/templates/SigningPackagesHub', () => ({ useSigningV2Available: () => false }));
jest.mock('../../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => null }));
jest.mock('../../../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));

const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
const profile = { version: 1, partyType: 'organization',
    identity: { type: 'passport', number: '000ABC123', country: 'United Kingdom' },
    organization: { registrationType: 'company', registrationNumber: '005123456', registrationCountry: 'ישראל' },
    address: { line1: 'Test street 5', line2: '', city: 'לונדון', postalCode: '00120', country: 'United Kingdom' } };
let i18n;

beforeEach(() => {
    jest.clearAllMocks();
    customersApi.getCustomersByName.mockResolvedValue({ status: 200, data: [] });
    customersApi.getCompaniesByName.mockResolvedValue({ status: 200, data: [] });
    customersApi.getCustomerById.mockResolvedValue({ status: 200, data: { UserId: 42, ClientProfile: profile } });
    customersApi.addCustomer.mockImplementation(async data => ({ status: 201, data: { UserId: 42, ClientProfile: data.clientProfile } }));
    customersApi.updateCustomerById.mockImplementation(async (_id, data) => ({ status: 200, data: { ClientProfile: data.clientProfile } }));
});

async function mount(language, props) {
    i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    return render(<I18nextProvider i18n={i18n}><ClientPopup {...props} /></I18nextProvider>);
}
const text = key => i18n.t(`customers.documentProfile.${key}`);

test('legacy editor profile defaults and field bounds preserve text identifiers', () => {
    expect(clientDocumentProfile({}).partyType).toBe('person');
    const loaded = clientDocumentProfile({ ClientProfile: profile });
    expect(loaded.identity.number).toBe('000ABC123');
    expect(loaded.organization.registrationNumber).toBe('005123456');
    expect(clientDocumentProfileErrors(loaded)).toEqual({});
    expect(clientDocumentProfileErrors({ ...loaded, identity: { ...loaded.identity, number: '1'.repeat(41) } })).toEqual({ 'identity.number': true });
    expect(invalidClientText('أحمد')).toBe(false);
    expect(invalidClientText('Jane Smith')).toBe(false);
    expect(invalidClientText('שם\u202eמטעה')).toBe(true);
});

for (const [language, name, company] of [['he', 'ישראל ישראלי', 'חברה לדוגמה'], ['ar', 'أحمد محمود', 'شركة مثال'], ['en', 'Jane Smith', 'Example Company']]) {
    test(`${language} edits and saves distinct personal/entity identifiers using the platform controls`, async () => {
        const saved = jest.fn();
        await mount(language, { clientDetails: { UserId: 42, Name: name, CompanyName: company,
            Email: 'contact@example.invalid', ClientProfile: profile }, rePerformRequest: saved });
        const save = screen.getByRole('button', { name: i18n.t('customers.updateCustomer') });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.change(screen.getByLabelText(text('identityNumber')), { target: { value: '000XYZ99' } });
        fireEvent.change(screen.getByLabelText(text('registrationNumber')), { target: { value: '001122334' } });
        fireEvent.change(screen.getByLabelText(text('postalCode')), { target: { value: '0012345' } });
        fireEvent.click(save);
        await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
        const [id, body] = customersApi.updateCustomerById.mock.calls[0];
        expect(id).toBe(42);
        expect(body.name).toBe(name);
        expect(body.companyName).toBe(company);
        expect(body.clientProfile.identity.number).toBe('000XYZ99');
        expect(body.clientProfile.organization.registrationNumber).toBe('001122334');
        expect(body.clientProfile.address.postalCode).toBe('0012345');
        expect(body.clientProfile.organization.name).toBeUndefined();
        await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({
            UserId: 42, ClientProfile: expect.objectContaining({ identity: expect.objectContaining({ number: '000XYZ99' }) }),
        })));
    });
}

test('creating an organization requires its registered name, then saves through the existing add API', async () => {
    await mount('en', { initialName: 'Human contact', initialEmail: 'contact@example.invalid' });
    fireEvent.click(screen.getByRole('radio', { name: text('organization') }));
    const save = screen.getByRole('button', { name: i18n.t('customers.saveCustomer') });
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByRole('status')).toHaveTextContent(text('requiredCompanyName'));
    fireEvent.change(screen.getByRole('textbox', { name: text('registeredName') }), { target: { value: 'Company' } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(customersApi.addCustomer).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Human contact', companyName: 'Company', clientProfile: expect.objectContaining({ partyType: 'organization' }),
    })));
});

test('switching client type retains company/contact values instead of copying one identifier into another', async () => {
    await mount('en', { clientDetails: { UserId: 42, Name: 'Human contact', Email: 'contact@example.invalid', CompanyName: 'Company', ClientProfile: profile } });
    fireEvent.click(screen.getByRole('radio', { name: text('person') }));
    expect(screen.getByLabelText(text('identityNumber'))).toHaveValue('000ABC123');
    fireEvent.click(screen.getByRole('radio', { name: text('organization') }));
    expect(screen.getByLabelText(text('registrationNumber'))).toHaveValue('005123456');
    expect(screen.getByLabelText(text('identityNumber'))).toHaveValue('000ABC123');
});

test('editing only contact details from a legacy stripped row never sends an empty replacement profile', async () => {
    customersApi.getCustomerById.mockRejectedValue(new Error('offline'));
    customersApi.updateCustomerById.mockResolvedValue({ status: 200, data: { ClientProfile: profile } });
    await mount('en', { clientDetails: { userid: 42, name: 'Legacy contact', email: 'contact@example.invalid', companyname: 'Company' } });
    await waitFor(() => expect(screen.getByText(text('loadFailed'))).toBeInTheDocument());
    expect(screen.getByRole('radio', { name: text('organization') })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('cases.customerName') }), { target: { value: 'Updated contact' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') }));
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    const [, body] = customersApi.updateCustomerById.mock.calls[0];
    expect(body.name).toBe('Updated contact');
    expect(body).not.toHaveProperty('clientProfile');
});

test('known unchanged profile is omitted from contact-only saves, preserving newer data on the server', async () => {
    await mount('en', { clientDetails: { UserId: 42, Name: 'Contact', Email: 'contact@example.invalid', CompanyName: 'Company', ClientProfile: profile } });
    fireEvent.change(screen.getByRole('textbox', { name: text('contactName') }), { target: { value: 'Updated contact' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') }));
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    expect(customersApi.updateCustomerById.mock.calls[0][1]).not.toHaveProperty('clientProfile');
    expect(customersApi.getCustomerById).not.toHaveBeenCalled();
});

test('legacy exact-profile fetch loads stored identifiers before allowing an explicit edit', async () => {
    await mount('en', { clientDetails: { userid: 42, name: 'Legacy contact', email: 'contact@example.invalid', companyname: 'Company' } });
    await waitFor(() => expect(screen.getByLabelText(text('registrationNumber'))).toHaveValue('005123456'));
    expect(customersApi.getCustomerById).toHaveBeenCalledWith(42);
    fireEvent.change(screen.getByLabelText(text('identityNumber')), { target: { value: '000NEW88' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') }));
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    expect(customersApi.updateCustomerById.mock.calls[0][1].clientProfile).toEqual({ ...profile, identity: { ...profile.identity, number: '000NEW88' } });
});

test('a late exact-profile fetch cannot replace the newly selected customer profile', async () => {
    let resolveFirst;
    customersApi.getCustomerById.mockImplementation(() => new Promise(resolve => { resolveFirst = resolve; }));
    const nextProfile = { ...profile, identity: { ...profile.identity, number: '000NEXT99' } };
    const next = { UserId: 43, Name: 'Different client', Email: 'next@example.invalid', CompanyName: 'New company', ClientProfile: nextProfile };
    customersApi.getCustomersByName.mockResolvedValue({ status: 200, data: [next] });
    await mount('en', { clientDetails: { userid: 42, name: 'Legacy contact', email: 'contact@example.invalid', companyname: 'Company' } });
    await waitFor(() => expect(customersApi.getCustomerById).toHaveBeenCalledWith(42));
    fireEvent.focus(screen.getByRole('textbox', { name: i18n.t('cases.customerName') }));
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Different client' }));
    expect(screen.getByLabelText(text('identityNumber'))).toHaveValue('000NEXT99');
    await act(async () => { resolveFirst({ status: 200, data: { UserId: 42, ClientProfile: profile } }); });
    expect(screen.getByLabelText(text('identityNumber'))).toHaveValue('000NEXT99');
    fireEvent.change(screen.getByLabelText(text('identityNumber')), { target: { value: '000NEXT00' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') }));
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    expect(customersApi.updateCustomerById.mock.calls[0][0]).toBe(43);
    expect(customersApi.updateCustomerById.mock.calls[0][1].clientProfile.identity.number).toBe('000NEXT00');
});

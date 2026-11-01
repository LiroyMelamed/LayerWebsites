import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    return render(<MemoryRouter><I18nextProvider i18n={i18n}><ClientPopup {...props} /></I18nextProvider></MemoryRouter>);
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
        expect(screen.getByLabelText(text('passportNumber'))).toBeVisible();
        expect(screen.getByLabelText(text('line1'))).toBeVisible();
        const save = screen.getByRole('button', { name: i18n.t('customers.updateCustomer') });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.change(screen.getByLabelText(text('passportNumber')), { target: { value: '000XYZ99' } });
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
    expect(screen.getByLabelText(text('passportNumber'))).toHaveValue('000ABC123');
    fireEvent.click(screen.getByRole('radio', { name: text('organization') }));
    expect(screen.getByLabelText(text('registrationNumber'))).toHaveValue('005123456');
    expect(screen.getByLabelText(text('passportNumber'))).toHaveValue('000ABC123');
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
    fireEvent.change(screen.getByLabelText(text('passportNumber')), { target: { value: '000NEW88' } });
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
    expect(screen.getByLabelText(text('passportNumber'))).toHaveValue('000NEXT99');
    await act(async () => { resolveFirst({ status: 200, data: { UserId: 42, ClientProfile: profile } }); });
    expect(screen.getByLabelText(text('passportNumber'))).toHaveValue('000NEXT99');
    fireEvent.change(screen.getByLabelText(text('passportNumber')), { target: { value: '000NEXT00' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') }));
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    expect(customersApi.updateCustomerById.mock.calls[0][0]).toBe(43);
    expect(customersApi.updateCustomerById.mock.calls[0][1].clientProfile.identity.number).toBe('000NEXT00');
});

test('document type changes visible labels and help while preserving international identifier text, country and saved type', async () => {
    const client = { UserId: 42, Name: 'Contact', CompanyName: 'Company', Email: 'contact@example.invalid', ClientProfile: profile };
    const view = await mount('en', { clientDetails: client });
    const type = screen.getByRole('combobox', { name: text('identityType') });
    expect(screen.getByRole('region', { name: text('title') })).toBeVisible();
    expect(screen.getByText(text('passportHelp'))).toBeVisible();
    fireEvent.click(type); fireEvent.pointerDown(screen.getByRole('option', { name: text('national_id') }));
    const number = screen.getByLabelText(text('nationalIdNumber'));
    expect(number).toHaveValue('000ABC123'); expect(number).toHaveAttribute('maxlength', '40'); expect(number).toHaveAttribute('inputmode', 'text');
    expect(screen.getByLabelText(text('nationalIdCountry'))).toHaveValue('United Kingdom');
    expect(screen.getByText(text('nationalIdHelp'))).toBeVisible();
    expect(document.getElementById(number.getAttribute('aria-describedby'))).toHaveTextContent(text('nationalIdHelp'));
    fireEvent.change(number, { target: { value: '00A-12.34' } });
    fireEvent.click(type); fireEvent.pointerDown(screen.getByRole('option', { name: text('other') }));
    expect(screen.getByLabelText(text('otherIdentityNumber'))).toHaveValue('00A-12.34');
    expect(screen.getByLabelText(text('otherIdentityCountry'))).toHaveValue('United Kingdom');
    expect(screen.getByText(text('otherIdentityHelp'))).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') }));
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    const saved = customersApi.updateCustomerById.mock.calls[0][1].clientProfile;
    expect(saved.identity).toEqual({ type: 'other', number: '00A-12.34', country: 'United Kingdom' });
    expect(saved.organization).toEqual(profile.organization);
    view.unmount(); await mount('en', { clientDetails: { ...client, ClientProfile: saved } });
    expect(screen.getByRole('combobox', { name: text('identityType') })).toHaveTextContent(text('other'));
    expect(screen.getByLabelText(text('otherIdentityNumber'))).toHaveValue('00A-12.34');
});

test('unchanged legacy phone and email allow profile edits without red errors or new-contact validation changes', async () => {
    await mount('en', { clientDetails: { UserId: 42, Name: 'Legacy contact', PhoneNumber: '0000001102', Email: 'legacy-without-at',
        ClientProfile: { ...profile, partyType: 'person' } } });
    const phone = screen.getByRole('textbox', { name: i18n.t('cases.phoneNumber') });
    const email = screen.getByRole('textbox', { name: i18n.t('common.email') });
    const save = screen.getByRole('button', { name: i18n.t('customers.updateCustomer') });
    await waitFor(() => expect(save).toBeEnabled());
    expect(phone).toHaveAttribute('aria-invalid', 'false'); expect(email).toHaveAttribute('aria-invalid', 'false');
    fireEvent.change(screen.getByLabelText(text('line2')), { target: { value: 'Suite 2' } }); fireEvent.click(save);
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledTimes(1));
    expect(customersApi.updateCustomerById.mock.calls[0]).toEqual([42, expect.objectContaining({
        phoneNumber: '0000001102', email: 'legacy-without-at', clientProfile: expect.objectContaining({ address: expect.objectContaining({ line2: 'Suite 2' }) }),
    })]);
});

const changeContact = (field, value) => { fireEvent.focus(field); fireEvent.change(field, { target: { value } }); fireEvent.blur(field); };

test('changing a legacy phone or email to another invalid value blocks saving; restoring the exact stored value is allowed', async () => {
    await mount('en', { clientDetails: { UserId: 42, Name: 'Legacy contact', PhoneNumber: '0000001102', Email: 'legacy-without-at', ClientProfile: {} } });
    const phone = screen.getByRole('textbox', { name: i18n.t('cases.phoneNumber') }); const email = screen.getByRole('textbox', { name: i18n.t('common.email') });
    const save = screen.getByRole('button', { name: i18n.t('customers.updateCustomer') });
    changeContact(phone, '0000001103'); await waitFor(() => expect(save).toBeDisabled());
    expect(phone).toHaveAttribute('aria-invalid', 'true'); fireEvent.click(save); expect(customersApi.updateCustomerById).not.toHaveBeenCalled();
    changeContact(phone, '0000001102'); await waitFor(() => expect(save).toBeEnabled()); expect(phone).toHaveAttribute('aria-invalid', 'false');
    changeContact(email, 'another-invalid-email'); await waitFor(() => expect(save).toBeDisabled()); expect(email).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(save); expect(customersApi.updateCustomerById).not.toHaveBeenCalled();
    changeContact(email, 'legacy-without-at'); await waitFor(() => expect(save).toBeEnabled()); expect(email).toHaveAttribute('aria-invalid', 'false');
});

test('a new client cannot reuse the legacy-contact exception', async () => {
    await mount('en', { initialName: 'New contact', initialPhone: '0000001102', initialEmail: 'legacy-without-at' });
    const save = screen.getByRole('button', { name: i18n.t('customers.saveCustomer') });
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByRole('textbox', { name: i18n.t('cases.phoneNumber') })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: i18n.t('common.email') })).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(save); expect(customersApi.addCustomer).not.toHaveBeenCalled();
});

test('customer selection and a late prior fetch cannot carry the previous legacy-contact exception into another record', async () => {
    let resolveFirst; customersApi.getCustomerById.mockImplementation(() => new Promise(resolve => { resolveFirst = resolve; }));
    const next = { UserId: 43, Name: 'Next authorized contact', PhoneNumber: '0501234567', Email: 'next@example.invalid', ClientProfile: {} };
    customersApi.getCustomersByName.mockResolvedValue({ status: 200, data: [next] });
    await mount('en', { clientDetails: { userid: 42, name: 'Old contact', phonenumber: '0000001102', email: 'legacy-without-at' } });
    await waitFor(() => expect(customersApi.getCustomerById).toHaveBeenCalledWith(42));
    fireEvent.focus(screen.getByRole('textbox', { name: i18n.t('cases.customerName') }));
    fireEvent.pointerDown(await screen.findByRole('button', { name: next.Name }));
    await act(async () => resolveFirst({ status: 200, data: { UserId: 42, PhoneNumber: '0000001102', Email: 'legacy-without-at', ClientProfile: {} } }));
    const phone = screen.getByRole('textbox', { name: i18n.t('cases.phoneNumber') }); const save = screen.getByRole('button', { name: i18n.t('customers.updateCustomer') });
    expect(phone).toHaveValue(next.PhoneNumber);
    changeContact(phone, '0000001102'); await waitFor(() => expect(save).toBeDisabled()); expect(phone).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(save); expect(customersApi.updateCustomerById).not.toHaveBeenCalled();
    changeContact(phone, next.PhoneNumber); await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
    await waitFor(() => expect(customersApi.updateCustomerById).toHaveBeenCalledWith(43, expect.objectContaining({ phoneNumber: next.PhoneNumber, email: next.Email })));
});

test('a freshly authorized record snapshot supersedes stale legacy contact values without overwriting current input', async () => {
    customersApi.getCustomerById.mockResolvedValue({ status: 200, data: { UserId: 42, PhoneNumber: '0000001103', Email: 'stored@example.invalid', ClientProfile: {} } });
    await mount('en', { clientDetails: { userid: 42, name: 'Stale row', phonenumber: '0000001102', email: 'stored@example.invalid' } });
    const phone = screen.getByRole('textbox', { name: i18n.t('cases.phoneNumber') });
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'));
    expect(phone).toHaveValue('0000001102'); expect(screen.getByRole('button', { name: i18n.t('customers.updateCustomer') })).toBeDisabled();
    expect(customersApi.updateCustomerById).not.toHaveBeenCalled();
});

test('document-profile vocabulary has matching Hebrew, Arabic and English keys', () => {
    expect(Object.keys(ar.customers.documentProfile).sort()).toEqual(Object.keys(he.customers.documentProfile).sort());
    expect(Object.keys(en.customers.documentProfile).sort()).toEqual(Object.keys(he.customers.documentProfile).sort());
});

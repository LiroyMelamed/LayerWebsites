import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { RolePeople, changePerson, clean } from './PackageComposer';
import { changeField } from '../../../testUtils/changeField';
import signingTemplatesApi from '../../../api/signingTemplatesApi';
import signingPackagesApi from '../../../api/signingPackagesApi';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: { contacts: jest.fn() }, signingRequest: jest.fn() }));
jest.mock('../../../api/signingPackagesApi', () => ({ __esModule: true, default: { directory: jest.fn(), personAuthorities: jest.fn() } }));
const empty = () => ({ name: '', email: '', phone: '', channel: '' });
const contact = { id: 71, name: 'Synthetic client', email: 'client@example.invalid', phone: '0501234567' };
const roles = [{ key: 'client', label: 'Client', audience: 'each', min: 1, max: 1 }, { key: 'lawyer', label: 'Lawyer', audience: 'shared', min: 1, max: 1 }];
const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };

function Harness({ initial = {}, onMutation, errors = {}, selectedRoles = roles, context = [] }) {
    const [people, setPeople] = useState(() => Object.fromEntries(selectedRoles.map(role => [role.key, initial[role.key] || empty()])));
    return <>{selectedRoles.map(role => <fieldset key={role.key}><legend>{role.label}</legend>
        <RolePeople scope="test" role={role} person={people[role.key]} errors={errors[role.key]} casePeople={context}
            otherRoles={selectedRoles.filter(item => item.key !== role.key)} bindContacts
            onChange={(key, field, value) => {
                onMutation?.(key, field, value);
                setPeople(previous => ({ ...previous, [key]: changePerson(previous[key], field, value) }));
            }} />
    </fieldset>)}</>;
}
async function setup(props = {}, language = 'en') {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    const view = render(<I18nextProvider i18n={i18n}><Harness {...props} /></I18nextProvider>);
    return { i18n, ...view };
}
const region = name => within(screen.getByRole('group', { name, exact: true }));
beforeEach(() => {
    jest.clearAllMocks();
    signingTemplatesApi.contacts.mockResolvedValue({ contacts: [contact] });
    signingPackagesApi.directory.mockResolvedValue({ people: [], parties: [], canManageAuthority: false });
    signingPackagesApi.personAuthorities.mockResolvedValue({ authorities: [], parties: [] });
});

test.each(['he', 'ar', 'en'])('search is local, selecting is atomic, and only the explicitly chosen role changes in %s', async language => {
    const mutation = jest.fn();
    const { i18n } = await setup({ onMutation: mutation }, language);
    const client = region('Client'), lawyer = region('Lawyer');
    expect(screen.queryByLabelText(i18n.t('signingV2.compose.fields.name'))).not.toBeInTheDocument();
    const search = client.getByLabelText(i18n.t('signingV2.compose.recipient.search'));
    fireEvent.focus(search); changeField(search, { target: { value: 'Synthetic' } });
    const result = await screen.findByRole('button', { name: 'Synthetic client | 0501234567' });
    expect(signingTemplatesApi.contacts).toHaveBeenCalledWith('Synthetic');
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.pointerDown(result);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith('client', '__person', expect.objectContaining({ name: contact.name, email: contact.email, phone: contact.phone, contactUserId: 71, channel: '' }));
    const chosen = mutation.mock.calls[0][2];
    expect(clean(chosen, language)).toEqual({ name: contact.name, email: contact.email, phone: contact.phone, locale: language });
    expect(client.getByText(contact.name)).toBeInTheDocument();
    expect(client.queryByLabelText(i18n.t('signingV2.compose.fields.name'))).not.toBeInTheDocument();
    expect(lawyer.getByLabelText(i18n.t('signingV2.compose.recipient.search'))).toHaveValue('');
    expect(lawyer.queryByText(contact.name)).not.toBeInTheDocument();
    expect(client.queryByRole('radio')).not.toBeInTheDocument();
});

test('linked client selection is explicit per role and preserves its delivery choice', async () => {
    const mutation = jest.fn(); await setup({ onMutation: mutation, context: [contact], initial: { client: { ...empty(), channel: 'sms' } } });
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.click(region('Client').getByRole('button', { name: /Synthetic client/ }));
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][2]).toMatchObject({ name: contact.name, contactUserId: 71, channel: 'sms' });
    expect(region('Lawyer').getByRole('button', { name: /Synthetic client/ })).toBeInTheDocument();
    expect(region('Lawyer').queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(region('Client').getByText('Delivery: SMS')).toBeInTheDocument();
});

test('change and cancel do not change a draft; editing a saved contact clears its binding only on a real edit', async () => {
    const mutation = jest.fn(); await setup({ onMutation: mutation, initial: { client: { ...empty(), ...contact, contactUserId: contact.id } } });
    const client = region('Client');
    fireEvent.click(client.getByRole('button', { name: 'Change person' }));
    const search = client.getByLabelText('Search name, email or phone');
    changeField(search, { target: { value: 'Someone else' } });
    fireEvent.click(client.getByRole('button', { name: 'Keep current person' }));
    expect(mutation).not.toHaveBeenCalled();
    expect(client.getByText(contact.email)).toBeInTheDocument();
    fireEvent.click(client.getByRole('button', { name: 'Edit details' }));
    expect(client.getByLabelText('Full name')).toHaveValue(contact.name);
    expect(mutation).not.toHaveBeenCalled();
    changeField(client.getByLabelText('Email'), { target: { value: 'edited@example.invalid' } });
    expect(mutation).toHaveBeenCalledTimes(1);
    const after = changePerson({ ...contact, contactUserId: contact.id }, ...mutation.mock.calls[0].slice(1));
    expect(after.contactUserId).toBeUndefined();
    expect(after.email).toBe('edited@example.invalid');
});

test('manual draft details remain visible; delivery changes require an explicit action', async () => {
    const mutation = jest.fn(); await setup({ onMutation: mutation, initial: { client: { name: 'Restored manual person', email: 'restored@example.invalid', phone: '', channel: '' } } });
    const client = region('Client');
    expect(client.getByLabelText('Full name')).toHaveValue('Restored manual person');
    expect(client.getByLabelText('Email')).toHaveValue('restored@example.invalid');
    expect(client.queryByLabelText('Search name, email or phone')).not.toBeInTheDocument();
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.click(client.getByRole('button', { name: 'Change delivery method' }));
    expect(client.getByRole('radio', { name: 'Automatic' })).toBeChecked();
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.click(client.getByRole('radio', { name: 'Email and SMS' }));
    expect(mutation).toHaveBeenCalledWith('client', 'channel', 'both');
});

test('a validation target reveals selected contact inputs and retains the established focus ID', async () => {
    await setup({ initial: { client: { ...empty(), ...contact, contactUserId: 71 } }, errors: { client: { email: 'INVALID_EMAIL' } } });
    const email = region('Client').getByLabelText('Email');
    expect(email).toHaveAttribute('id', 'compose-test-client-email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(en.signingV2.compose.rowErrors.INVALID_EMAIL);
    document.getElementById('compose-test-client-email').focus();
    expect(email).toHaveFocus();
});

test('new person is explicit and same-person linking stays under more options', async () => {
    const mutation = jest.fn(); await setup({ onMutation: mutation });
    const client = region('Client');
    fireEvent.click(client.getByRole('button', { name: 'New person' }));
    expect(client.getByLabelText('Full name')).toHaveValue('');
    changeField(client.getByLabelText('Full name'), { target: { value: 'Manual client' } });
    fireEvent.click(client.getByText('More options'));
    changeField(client.getByRole('combobox', { name: en.signingV2.compose.identity.label }), { target: { value: 'lawyer' } });
    expect(mutation.mock.calls.at(-2)).toEqual(['client', 'sameAsRole', 'lawyer']);
    expect(client.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(region('Lawyer').getByLabelText('Search name, email or phone')).toHaveValue('');
});

test('a representative retains directory, represented party and authority requirements instead of generic contact substitution', async () => {
    await setup({ context: [contact], selectedRoles: [{ ...roles[0], capacity: 'representative' }] });
    expect(screen.queryByLabelText('Search name, email or phone')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Synthetic client/ })).not.toBeInTheDocument();
    expect(screen.getByText(en.signingV2.authority.representativeTitle)).toBeInTheDocument();
    expect(screen.getByLabelText(en.signingV2.authority.searchPerson)).toBeInTheDocument();
    await waitFor(() => expect(signingPackagesApi.directory).toHaveBeenCalled());
    expect(signingTemplatesApi.contacts).not.toHaveBeenCalled();
});


test('an invalid saved contact can still be replaced or kept without discarding its draft while searching', async () => {
    const mutation = jest.fn();
    await setup({ onMutation: mutation, initial: { client: { ...empty(), ...contact, contactUserId: 71 } }, errors: { client: { email: 'INVALID_EMAIL' } } });
    const client = region('Client');
    expect(client.getByLabelText('Email')).toHaveValue(contact.email);
    fireEvent.click(client.getByRole('button', { name: 'Change person' }));
    expect(client.getByLabelText('Search name, email or phone')).toHaveValue('');
    expect(client.queryByLabelText('Email')).not.toBeInTheDocument();
    fireEvent.click(client.getByRole('button', { name: 'Keep current person' }));
    expect(client.getByLabelText('Email')).toHaveValue(contact.email);
    expect(mutation).not.toHaveBeenCalled();
    fireEvent.click(client.getByRole('button', { name: 'Change person' }));
    const search = client.getByLabelText('Search name, email or phone');
    fireEvent.focus(search); changeField(search, { target: { value: 'Synthetic' } });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Synthetic client | 0501234567' }));
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith('client', '__person', expect.objectContaining({ name: contact.name, email: contact.email, phone: contact.phone }));
});

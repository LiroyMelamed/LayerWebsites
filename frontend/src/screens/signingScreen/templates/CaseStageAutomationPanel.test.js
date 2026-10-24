import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { changeField } from '../../../testUtils/changeField';
import CaseStageAutomationPanel from './CaseStageAutomationPanel';
import PackageComposer from './PackageComposer';
import signingTemplatesApi from '../../../api/signingTemplatesApi';
import signingPackagesApi from '../../../api/signingPackagesApi';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

// Keep the actual panel, RolePeople, SearchInput, pickers and platform buttons.
// Only external services are replaced; no test can create a package or send.
jest.mock('../../../api/signingTemplatesApi', () => ({
    __esModule: true, default: { contacts: jest.fn() }, signingRequest: jest.fn(),
}));
jest.mock('../../../api/signingPackagesApi', () => ({
    __esModule: true, default: { directory: jest.fn(), personAuthorities: jest.fn(), create: jest.fn() },
}));

const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
const contacts = [
    { id: 501, name: 'Synthetic tenant', email: 'tenant@example.invalid', phone: '' },
    { id: 502, name: 'Synthetic office lawyer', email: 'lawyer@example.invalid', phone: '' },
];
const template = {
    versionId: 'fixed-revision-3', name: 'Rental agreement',
    roles: [
        { key: 'tenant', label: 'Tenant', audience: 'each', min: 1, max: 1, capacity: 'personal' },
        { key: 'lawyer', label: 'Lawyer', audience: 'shared', min: 1, max: 1, capacity: 'personal' },
    ],
    dataKeys: [{ key: 'property', label: 'Property reference', type: 'identifier', required: true }],
};
const savedStages = [
    { descriptionId: 'saved-stage-2', stage: 2, title: 'Saved court filing' },
    { descriptionId: 'saved-stage-4', stage: 4, title: 'Saved final review' },
];
const state = (extra = {}) => ({ caseId: 41, stages: savedStages, rules: [], runs: [], ...extra });
const valid = (previewHash = 'review-token-1') => ({ valid: true, errors: [], previewHash });

beforeEach(() => {
    jest.clearAllMocks();
    signingTemplatesApi.contacts.mockResolvedValue({ contacts: contacts.map(({ id, ...person }) => ({ ...person, userId: id })) });
    signingPackagesApi.directory.mockResolvedValue({ people: [], parties: [], canManageAuthority: false });
    signingPackagesApi.personAuthorities.mockResolvedValue({ authorities: [], parties: [] });
});

async function setup({ language = 'en', data = state(), canEdit = true, api: overrides = {} } = {}) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    const api = { list: jest.fn().mockResolvedValue(data), preview: jest.fn().mockResolvedValue(valid()), save: jest.fn().mockResolvedValue({}), retry: jest.fn().mockResolvedValue({}), ...overrides };
    const packagesApi = { templates: jest.fn().mockResolvedValue({ templates: [template] }), caseContext: jest.fn().mockResolvedValue({ people: contacts }), create: jest.fn() };
    const view = render(<I18nextProvider i18n={i18n}>
        <CaseStageAutomationPanel key="case-41" caseId={41} canEdit={canEdit} initiallyOpen api={api} packagesApi={packagesApi} />
    </I18nextProvider>);
    await screen.findByRole('heading', { name: /Saved court filing/ });
    return { api, packagesApi, i18n, ...view };
}

async function configure(i18n, stageIndex = 0) {
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('stageAutomation.configure') })[stageIndex]);
    changeField(screen.getByRole('combobox', { name: i18n.t('stageAutomation.template') }), { target: { value: template.versionId } });
    await screen.findByRole('group', { name: 'Tenant' });
}

function selectCasePerson(i18n, role, id) {
    changeField(within(screen.getByRole('group', { name: role })).getByRole('combobox', { name: i18n.t('signingV2.compose.context.fill') }), { target: { value: String(id) } });
}

function fillConfiguredPeople(i18n) {
    selectCasePerson(i18n, 'Tenant', 501);
    selectCasePerson(i18n, 'Lawyer', 502);
    changeField(screen.getByLabelText(`Property reference (${i18n.t('signingV2.compose.mapping.required')})`), { target: { value: '000507' } });
}

const button = (i18n, key) => screen.getByRole('button', { name: i18n.t(`stageAutomation.${key}`) });

test.each(['he', 'ar', 'en'])('configure and preview only enable an explicit save for the selected saved stage in %s', async (language) => {
    const { api, packagesApi, i18n } = await setup({ language });
    await configure(i18n, 1);
    fillConfiguredPeople(i18n);
    expect(button(i18n, 'save')).toBeDisabled();
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(i18n.t('stageAutomation.reviewReady'));
    expect(screen.getByText(i18n.t('stageAutomation.confirmHelp'))).toBeInTheDocument();
    expect(api.preview).toHaveBeenCalledWith(41, 'saved-stage-4', expect.objectContaining({
        expectedVersion: 0, enabled: true, templateVersionId: 'fixed-revision-3',
        shared: { lawyer: { name: contacts[1].name, email: contacts[1].email, phone: '', locale: language, contactUserId: 502 } },
        rows: [{ data: { property: '000507' }, recipients: { tenant: { name: contacts[0].name, email: contacts[0].email, phone: '', locale: language, contactUserId: 501 } } }],
    }));
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button(i18n, 'save'));
    await screen.findByText(i18n.t('stageAutomation.saved'));
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(41, 'saved-stage-4', { ...api.preview.mock.calls[0][2], previewHash: 'review-token-1' });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(41);
    expect(packagesApi.caseContext).toHaveBeenCalledWith(41);
    expect(packagesApi.create).not.toHaveBeenCalled();
    expect(signingPackagesApi.create).not.toHaveBeenCalled();
});

test('invalid settings cannot save, and editing document data removes an accepted review', async () => {
    const { api, i18n } = await setup();
    await configure(i18n);
    fillConfiguredPeople(i18n);
    api.preview.mockResolvedValueOnce({ valid: false, errors: [{ path: 'rows.0.data.property', code: 'DATA_REQUIRED' }] });
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewFailed);
    expect(screen.getByText('Property reference')).toBeInTheDocument();
    expect(button(i18n, 'save')).toBeDisabled();
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    changeField(screen.getByLabelText('Property reference (required)'), { target: { value: '000508' } });
    expect(screen.queryByText(en.stageAutomation.reviewReady)).not.toBeInTheDocument();
    expect(button(i18n, 'save')).toBeDisabled();
    expect(api.save).not.toHaveBeenCalled();
});

test('a stale server review is cleared after save rejection and cannot be submitted twice', async () => {
    let reject;
    const pendingSave = new Promise((_resolve, rejectRequest) => { reject = rejectRequest; });
    const { api, i18n } = await setup({ api: { save: jest.fn().mockReturnValue(pendingSave) } });
    await configure(i18n);
    fillConfiguredPeople(i18n);
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    const save = button(i18n, 'save');
    fireEvent.click(save);
    fireEvent.click(save);
    expect(api.save).toHaveBeenCalledTimes(1);
    await act(async () => reject(Object.assign(new Error('stale review'), { code: 'STAGE_RULE_CHANGED' })));
    await screen.findByText(en.stageAutomation.errors.STAGE_RULE_CHANGED);
    expect(screen.queryByText(en.stageAutomation.reviewReady)).not.toBeInTheDocument();
    expect(button(i18n, 'save')).toBeDisabled();
    expect(api.save).toHaveBeenCalledTimes(1);
});

test.each([
    ['name', 'Synthetic tenant changed'],
    ['email', 'changed@example.invalid'],
    ['phone', '0501234567'],
])('real contact suggestions retain record binding, while manual %s changes clear it', async (field, nextValue) => {
    const { api, i18n } = await setup();
    await configure(i18n);
    const tenant = within(screen.getByRole('group', { name: 'Tenant' }));
    changeField(tenant.getByLabelText('Full name'), { target: { value: 'Synthetic' } });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Synthetic tenant | tenant@example.invalid' }));
    await waitFor(() => expect(tenant.getByLabelText('Full name')).toHaveValue('Synthetic tenant'));
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    expect(api.preview.mock.calls[0][2].rows[0].recipients.tenant).toEqual(expect.objectContaining({ name: 'Synthetic tenant', email: 'tenant@example.invalid', contactUserId: 501 }));
    changeField(tenant.getByLabelText(en.signingV2.compose.fields[field]), { target: { value: nextValue } });
    expect(button(i18n, 'save')).toBeDisabled();
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    expect(api.preview.mock.calls[1][2].rows[0].recipients.tenant).not.toHaveProperty('contactUserId');
    selectCasePerson(i18n, 'Tenant', 501);
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    expect(api.preview.mock.calls[2][2].rows[0].recipients.tenant).toEqual(expect.objectContaining({ contactUserId: 501, name: 'Synthetic tenant', email: 'tenant@example.invalid', phone: '' }));
    expect(api.save).not.toHaveBeenCalled();
});

test('pause and blocked retry use the saved case, stage and current versions without creating a package', async () => {
    const data = state({ rules: [{ descriptionId: 'saved-stage-2', version: 7, enabled: true, templateVersionId: template.versionId, templateName: template.name }],
        runs: [{ id: 'blocked-run', version: 4, status: 'blocked', stageTitle: 'Saved court filing', createdAt: '2026-10-24T00:00:00.000Z', errorCode: 'STAGE_CONTACT_CHANGED' }] });
    const { api, packagesApi, i18n } = await setup({ data });
    fireEvent.click(button(i18n, 'pause'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(api.save).toHaveBeenCalledWith(41, 'saved-stage-2', { expectedVersion: 7, enabled: false });
    fireEvent.click(button(i18n, 'retry'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
    expect(api.retry).toHaveBeenCalledWith(41, 'blocked-run', 4);
    expect(api.preview).not.toHaveBeenCalled();
    expect(packagesApi.create).not.toHaveBeenCalled();
});

test('read-only case access shows history but exposes no configuration, pause or retry action', async () => {
    const data = state({ rules: [{ descriptionId: 'saved-stage-2', version: 7, enabled: true, templateName: template.name }],
        runs: [{ id: 'blocked-run', version: 4, status: 'blocked', stageTitle: 'Saved court filing', createdAt: '2026-10-24T00:00:00.000Z' }] });
    const { api, i18n } = await setup({ data, canEdit: false });
    expect(screen.getByRole('region', { name: i18n.t('stageAutomation.runs') })).toBeInTheDocument();
    for (const action of ['configure', 'edit', 'pause', 'retry', 'check', 'save']) {
        expect(screen.queryByRole('button', { name: i18n.t(`stageAutomation.${action}`) })).not.toBeInTheDocument();
    }
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(api.retry).not.toHaveBeenCalled();
});

test('a pending preview from an unmounted case cannot enable save in the next keyed case', async () => {
    let resolve;
    const pendingPreview = new Promise(done => { resolve = done; });
    const first = await setup({ api: { preview: jest.fn().mockReturnValue(pendingPreview) } });
    await configure(first.i18n);
    fillConfiguredPeople(first.i18n);
    fireEvent.click(button(first.i18n, 'check'));
    first.unmount();
    const second = await setup();
    await configure(second.i18n);
    await act(async () => resolve(valid('stale-case-token')));
    expect(screen.queryByText(en.stageAutomation.reviewReady)).not.toBeInTheDocument();
    expect(button(second.i18n, 'save')).toBeDisabled();
    expect(second.api.save).not.toHaveBeenCalled();
    expect(second.api.preview).not.toHaveBeenCalled();
});

test('the dependent ordinary composer suggestion still fills all contact values without stage binding or sending', async () => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources, lng: 'en', fallbackLng: false, interpolation: { escapeValue: false } });
    const contact = { userId: 501, name: 'Synthetic tenant', email: 'tenant@example.invalid', phone: '0507654321' };
    signingTemplatesApi.contacts.mockResolvedValue({ contacts: [contact] });
    const api = { templates: jest.fn().mockResolvedValue({ templates: [{ ...template, roles: [template.roles[0]], dataKeys: [] }], legacy: [] }),
        previewCreation: jest.fn().mockResolvedValue({ valid: false, errors: [{ path: 'rows.0.tenant.name', code: 'INVALID_ROW' }], errorCount: 1 }), create: jest.fn() };
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId={template.versionId} /></I18nextProvider>);
    await screen.findByLabelText('Run name');
    const recipient = within(screen.getByRole('group', { name: 'Row 1' }));
    changeField(recipient.getByLabelText('Full name'), { target: { value: 'Synthetic' } });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Synthetic tenant | 0507654321' }));
    expect(recipient.getByLabelText('Full name')).toHaveValue(contact.name);
    expect(recipient.getByLabelText('Email')).toHaveValue(contact.email);
    expect(recipient.getByLabelText('Phone')).toHaveValue(contact.phone);
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.check }));
    await screen.findByRole('alert', { name: i18n.t('signingV2.compose.errorsHeading', { count: 1, formattedCount: '1' }) });
    expect(api.previewCreation).toHaveBeenCalledTimes(1);
    expect(api.previewCreation.mock.calls[0][0].rows[0].recipients.tenant).toEqual({ name: contact.name, email: contact.email, phone: contact.phone, locale: 'en' });
    expect(api.create).not.toHaveBeenCalled();
});

test('switching a bound account to an explicit signing directory person removes the old account binding', async () => {
    signingPackagesApi.directory.mockResolvedValue({ people: [{ id: 'new-directory-person', name: 'Synthetic directory signer', endpoints: { email: 'directory@example.invalid' } }], parties: [], canManageAuthority: false });
    const { api, i18n } = await setup();
    await configure(i18n);
    selectCasePerson(i18n, 'Tenant', 501);
    const tenant = within(screen.getByRole('group', { name: 'Tenant' }));
    fireEvent.click(tenant.getByText(i18n.t('signingV2.authority.directoryTitle')));
    changeField(tenant.getByLabelText(i18n.t('signingV2.authority.searchPerson')), { target: { value: 'Synthetic directory' } });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Synthetic directory signer · directory@example.invalid' }));
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    const person = api.preview.mock.calls[0][2].rows[0].recipients.tenant;
    expect(person).toEqual(expect.objectContaining({ personId: 'new-directory-person', name: 'Synthetic directory signer', email: 'directory@example.invalid' }));
    expect(person).not.toHaveProperty('contactUserId');
    expect(api.save).not.toHaveBeenCalled();
});

test('the same person in two roles retains the role link after its occurrence update', async () => {
    const { api, i18n } = await setup();
    await configure(i18n);
    selectCasePerson(i18n, 'Lawyer', 502);
    const tenant = within(screen.getByRole('group', { name: 'Tenant' }));
    changeField(tenant.getByRole('combobox', { name: i18n.t('signingV2.compose.identity.label') }), { target: { value: 'lawyer' } });
    expect(tenant.queryByLabelText(i18n.t('signingV2.compose.fields.name'))).not.toBeInTheDocument();
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    expect(api.preview.mock.calls[0][2].rows[0].recipients.tenant).toEqual({ sameAsRole: 'lawyer' });
    expect(api.preview.mock.calls[0][2].shared.lawyer).toEqual(expect.objectContaining({ contactUserId: 502 }));
    expect(api.save).not.toHaveBeenCalled();
});

test('editing a saved rule restores automatic channels and preserves explicit channels and signer bindings', async () => {
    const person = { name: 'Synthetic signer', email: 'signer@example.invalid', phone: '', locale: 'en' };
    const savedTemplate = { ...template, roles: [...template.roles,
        { key: 'witness', label: 'Witnesses', audience: 'each', min: 3, max: 3, capacity: 'personal' },
        { key: 'office', label: 'Office signers', audience: 'shared', min: 3, max: 3, capacity: 'personal' },
    ] };
    const recipients = {
        tenant: { ...person, contactUserId: 501 },
        witness: { people: [{ ...person, contactUserId: 503 }, { ...person, channel: 'email' }, { ...person, channel: 'sms' }] },
    };
    const shared = {
        lawyer: { ...person, personId: 'directory-lawyer', partyId: 'represented-party', authorityId: 'signing-authority' },
        office: { people: [{ ...person, contactUserId: 502 }, { ...person, channel: 'both' }, { sameAsRole: 'witness', sameAsOccurrence: 1 }] },
    };
    const rows = [{ key: 'saved-case-row', data: { property: '000507' }, recipients }];
    const { api, i18n } = await setup({ data: state({ rules: [{ descriptionId: 'saved-stage-2', version: 7,
        enabled: true, template: savedTemplate, templateVersionId: template.versionId, templateName: template.name, shared, rows }] }) });
    fireEvent.click(button(i18n, 'edit'));
    for (const [role, channels] of [['Tenant', ['auto']], ['Lawyer', ['auto']], ['Witnesses', ['auto', 'email', 'sms']], ['Office signers', ['auto', 'both']]]) {
        const groups = within(screen.getByRole('group', { name: role })).getAllByRole('radiogroup', { name: i18n.t('signingV2.compose.fields.channel') });
        expect(groups).toHaveLength(channels.length);
        groups.forEach((group, index) => {
            expect(within(group).getAllByRole('radio', { checked: true })).toHaveLength(1);
            expect(within(group).getByRole('radio', { name: i18n.t(`signingV2.compose.channel.${channels[index]}`) })).toHaveAttribute('aria-checked', 'true');
        });
    }
    fireEvent.click(button(i18n, 'check'));
    await screen.findByText(en.stageAutomation.reviewReady);
    expect(api.preview).toHaveBeenCalledWith(41, 'saved-stage-2', expect.objectContaining({ expectedVersion: 7, shared, rows }));
    fireEvent.click(button(i18n, 'save'));
    await screen.findByText(en.stageAutomation.saved);
    expect(api.save).toHaveBeenCalledWith(41, 'saved-stage-2', { ...api.preview.mock.calls[0][2], previewHash: 'review-token-1' });
    expect(signingPackagesApi.create).not.toHaveBeenCalled();
});

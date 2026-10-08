import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import PackageComposer from './PackageComposer';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const resources = { he: { translation: he }, ar: { translation: ar }, en: { translation: en } };
async function translations(language) {
    const instance = createInstance();
    await instance.use(initReactI18next).init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    return instance;
}
const PLURAL = /_(zero|one|two|few|many|other)$/;
const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key.replace(PLURAL, '')}`]);

const roles = [{ key: 'first', label: 'Employee', audience: 'each', stage: 0 }, { key: 'lawyer', label: 'Lawyer', audience: 'shared', stage: 0 }];
const converted = { templateId: 't-1', versionId: 'v-1', name: 'Employment pack', version: 1, documentCount: 3, roles, origin: { kind: 'legacy_template' } };

function fakeApi() {
    let catalog = { templates: [], legacy: [{ id: 7, name: 'Employment pack', version: 1, documentCount: 3, roles: [{ label: 'Employee' }, { label: 'Lawyer' }] }] };
    return {
        templates: jest.fn(async () => catalog),
        importLegacy: jest.fn(async () => { catalog = { templates: [converted], legacy: [] }; return { versionId: 'v-1', reused: false }; }),
        inspectWorkbook: jest.fn(async () => ({ sheets: [{ id: 1, name: 'People', columns: [
            { index: 1, header: 'ID', suggestedKey: 'key', samples: ['E1'] },
            { index: 2, header: 'Name', suggestedKey: 'first.name', samples: ['Synthetic one'] },
            { index: 3, header: 'Email', suggestedKey: 'first.email', samples: ['one@example.invalid'] },
            { index: 4, header: 'Phone', suggestedKey: 'first.phone', samples: ['0501234567'] },
        ] }] })),
        parseWorkbook: jest.fn(),
        workbook: jest.fn(),
        previewCreation: jest.fn(),
        create: jest.fn(),
    };
}
const validPreview = rows => ({ valid: true, errors: [], errorCount: 0, previewHash: 'hash-1', packageCount: rows, documentCount: rows * 3, recipientCount: rows + 1,
    shared: [{ roleKey: 'lawyer', name: 'Synthetic lawyer', channels: ['email'] }],
    sample: [{ key: 'row-1', recipients: [{ roleKey: 'first', name: 'Synthetic employee', channels: ['sms'] }] }],
    template: { versionId: 'v-1', name: 'Employment pack', documents: [{ key: 'd1', name: 'Agreement' }], roles } });

async function toRecipients(i18n, api) {
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} onBack={jest.fn()} onCreated={api.onCreated} /></I18nextProvider>);
    const version = new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[i18n.language]).format(1);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.compose.template.convertNamed', { name: 'Employment pack', version }) }));
    await screen.findByRole('button', { name: /Employment pack/, pressed: true });
    expect(api.importLegacy).toHaveBeenCalledWith(7, i18n.language, 1);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.next') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.rows.heading') });
    expect(screen.queryByLabelText(i18n.t('signingV2.compose.rows.key'))).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('signingV2.compose.directoryHelp.client'))).toBeInTheDocument();
}
const field = (container, label) => within(container).getByLabelText(label);

test('every creation string exists in Hebrew, Arabic and English', () => {
    const reference = new Set(keys(he.signingV2.compose));
    for (const locale of [ar, en]) expect(new Set(keys(locale.signingV2.compose))).toEqual(reference);
    for (const locale of [he, ar, en]) expect(locale.signingManager.signingRuns).toBeTruthy();
    for (const locale of [he, ar, en]) for (const key of ['signingOrderLabel', 'signingOrderParallel', 'signingOrderSequential', 'sequentialOrderTitle']) {
        expect(locale.signing.upload[key]).toBeTruthy();
    }
});

test.each(['he', 'ar', 'en'])('explicit conversion, field errors linked to their input, one approved creation in %s', async language => {
    const i18n = await translations(language), api = fakeApi();
    api.onCreated = jest.fn();
    await toRecipients(i18n, api);
    expect(screen.getByRole('region', { name: i18n.t('signingV2.compose.title') })).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    const shared = screen.getByRole('group', { name: 'Lawyer' });
    fireEvent.change(field(shared, i18n.t('signingV2.compose.fields.name')), { target: { value: 'Synthetic lawyer' } });
    fireEvent.change(field(shared, i18n.t('signingV2.compose.fields.email')), { target: { value: 'lawyer@example.invalid' } });
    const row = screen.getByRole('group', { name: i18n.t('signingV2.compose.rows.row', { number: new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language]).format(1) }) });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.name')), { target: { value: 'Synthetic employee' } });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.email')), { target: { value: 'not-an-email' } });

    api.previewCreation.mockResolvedValueOnce({ valid: false, errors: [{ path: 'rows.0.first.email', code: 'INVALID_EMAIL' }], errorCount: 1 });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByText(i18n.t('signingV2.compose.errorsHeading', { count: 1, formattedCount: '1' }))).toBeInTheDocument();
    const email = field(row, i18n.t('signingV2.compose.fields.email'));
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(i18n.t('signingV2.compose.rowErrors.INVALID_EMAIL'));
    fireEvent.click(within(summary).getByRole('button'));
    expect(email).toHaveFocus();

    fireEvent.change(email, { target: { value: '' } });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.phone')), { target: { value: '050-123-4567' } });
    fireEvent.click(within(row).getByRole('radio', { name: i18n.t('signingV2.compose.channel.sms') }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    api.previewCreation.mockResolvedValueOnce(validPreview(1));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.review.heading') });
    expect(screen.queryByRole('radio', { name: i18n.t('signingV2.compose.locale.template') })).not.toBeInTheDocument();
    expect(api.previewCreation).toHaveBeenLastCalledWith({ templateVersionId: 'v-1', name: 'Employment pack', omittedRoles: [],
        signingOrder: { mode: 'parallel' },
        shared: { lawyer: { name: 'Synthetic lawyer', email: 'lawyer@example.invalid', phone: '', locale: language } },
        rows: [{ recipients: { first: { name: 'Synthetic employee', email: '', phone: '050-123-4567', channel: 'sms', locale: language } } }] });

    let finish;
    api.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const confirm = screen.getByRole('button', { name: i18n.t('signingV2.compose.review.confirm', { count: 1, formattedCount: new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language]).format(1) }) });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(api.create).toHaveBeenCalledTimes(1);
    const [body, key] = api.create.mock.calls[0];
    expect(body.previewHash).toBe('hash-1');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    finish({ submissionId: 'sub-1', reused: false });
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.compose.done.open') }));
    expect(api.onCreated).toHaveBeenCalledWith('sub-1');
});

test('a signer can be left out of this send and put back without changing the template', async () => {
    const i18n = await translations('he'), api = fakeApi();
    await toRecipients(i18n, api);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.signers.remove', { name: 'Lawyer' }) }));
    expect(screen.queryByRole('group', { name: 'Lawyer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('signingV2.compose.signers.remove', { name: 'Employee' }) })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.signers.restore', { name: 'Lawyer' }) }));
    expect(screen.getByRole('group', { name: 'Lawyer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.signers.remove', { name: 'Lawyer' }) }));
    const row = screen.getByRole('group', { name: i18n.t('signingV2.compose.rows.row', { number: '1' }) });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.name')), { target: { value: 'Synthetic employee' } });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.email')), { target: { value: 'employee@example.invalid' } });
    api.previewCreation.mockResolvedValueOnce(validPreview(1));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByText(i18n.t('signingV2.compose.signers.review', { names: 'Lawyer' }));
    expect(api.previewCreation).toHaveBeenLastCalledWith({ templateVersionId: 'v-1', name: 'Employment pack', omittedRoles: ['lawyer'],
        signingOrder: { mode: 'parallel' },
        shared: {},
        rows: [{ recipients: { first: { name: 'Synthetic employee', email: 'employee@example.invalid', phone: '', locale: 'he' } } }] });
});

test('Excel row errors block partial replacement until a corrected file is reviewed', async () => {
    const i18n = await translations('he'), api = fakeApi();
    await toRecipients(i18n, api);
    fireEvent.click(screen.getByRole('radio', { name: i18n.t('signingV2.compose.rows.excel') }));
    api.parseWorkbook.mockResolvedValueOnce({
        rows: [{ sourceRow: 2, key: 'E1', recipients: { first: { name: 'Synthetic one', email: '', phone: '0501234567', channel: 'sms' } } },
            { sourceRow: 4, key: 'E3', recipients: { first: { name: 'Synthetic three', email: 'three@example.invalid', phone: '', locale: 'en' } } }],
        errors: [{ row: 3, code: 'UNSUPPORTED_CELL' }],
    });
    const upload = screen.getByLabelText(i18n.t('signingV2.compose.excel.upload'));
    fireEvent.change(upload, { target: { files: [new File([new Uint8Array([80, 75, 3, 4])], 'people.xlsx')] } });
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.compose.mapping.preview') }));
    expect(await screen.findByRole('button', { name: i18n.t('signingV2.compose.mapping.apply') })).toBeDisabled();
    expect(screen.getByText(new RegExp(i18n.t('signingV2.compose.rowErrors.UNSUPPORTED_CELL')))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.cancel') }));
    api.parseWorkbook.mockResolvedValueOnce({ rows: [
        { sourceRow: 2, key: 'E1', recipients: { first: { name: 'Synthetic one', email: '', phone: '0501234567', channel: 'sms' } } },
        { sourceRow: 3, key: 'E3', recipients: { first: { name: 'Synthetic three', email: 'three@example.invalid', phone: '' } } }], errors: [] });
    fireEvent.change(upload, { target: { files: [new File(['corrected synthetic'], 'corrected.xlsx')] } });
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.compose.mapping.preview') }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('signingV2.compose.mapping.apply') }));
    await screen.findByText(i18n.t('signingV2.compose.excel.imported', { count: 2, formattedCount: '2' }));
    expect(api.parseWorkbook).toHaveBeenCalledWith('v-1', expect.any(String), { mapping: { sheetId: 1, columns: { key: 1, 'first.name': 2, 'first.email': 3, 'first.phone': 4 } } });
    expect(screen.queryByText(new RegExp(i18n.t('signingV2.compose.rowErrors.UNSUPPORTED_CELL')))).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue(/Synthetic (one|three)/)).toHaveLength(2);
    expect(screen.getByDisplayValue('0501234567')).toHaveAttribute('dir', 'ltr');

    fireEvent.change(upload, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.xlsx')] } });
    expect(await screen.findByText(i18n.t('signingV2.compose.errors.WORKBOOK_TOO_LARGE'))).toBeInTheDocument();
    expect(api.parseWorkbook).toHaveBeenCalledTimes(2);
});

test('a change made elsewhere after the preview sends the user back to check again, without a second run', async () => {
    const i18n = await translations('en'), api = fakeApi();
    await toRecipients(i18n, api);
    const shared = screen.getByRole('group', { name: 'Lawyer' });
    fireEvent.change(field(shared, 'Full name'), { target: { value: 'Synthetic lawyer' } });
    fireEvent.change(field(shared, 'Email'), { target: { value: 'lawyer@example.invalid' } });
    fireEvent.change(field(screen.getByRole('group', { name: 'Row 1' }), 'Full name'), { target: { value: 'Synthetic employee' } });
    fireEvent.change(field(screen.getByRole('group', { name: 'Row 1' }), 'Email'), { target: { value: 'e@example.invalid' } });
    api.previewCreation.mockResolvedValueOnce(validPreview(1));
    fireEvent.click(screen.getByRole('button', { name: 'Check data' }));
    api.create.mockRejectedValueOnce(Object.assign(new Error('changed'), { code: 'PREVIEW_CHANGED' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create 1 package' }));
    await screen.findByRole('heading', { name: 'Recipients' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.signingV2.errors.PREVIEW_CHANGED);
    expect(api.create).toHaveBeenCalledTimes(1);
});

test('sequential signing uses the same choice as a regular document and keeps the dragged order', async () => {
    const i18n = await translations('he'), api = fakeApi();
    await toRecipients(i18n, api);
    expect(screen.getByRole('radio', { name: i18n.t('signing.upload.signingOrderParallel') })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: i18n.t('signing.upload.signingOrderSequential') }));
    expect(screen.getByText(i18n.t('signing.upload.sequentialOrderTitle'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.order.up', { name: 'Lawyer' }) }));
    const row = screen.getByRole('group', { name: i18n.t('signingV2.compose.rows.row', { number: '1' }) });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.name')), { target: { value: 'Synthetic employee' } });
    fireEvent.change(field(row, i18n.t('signingV2.compose.fields.phone')), { target: { value: '0501234567' } });
    fireEvent.click(within(row).getByRole('radio', { name: i18n.t('signingV2.compose.channel.sms') }));
    const shared = screen.getByRole('group', { name: 'Lawyer' });
    fireEvent.change(field(shared, i18n.t('signingV2.compose.fields.name')), { target: { value: 'Synthetic lawyer' } });
    fireEvent.change(field(shared, i18n.t('signingV2.compose.fields.email')), { target: { value: 'lawyer@example.invalid' } });
    api.previewCreation.mockResolvedValueOnce(validPreview(1));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.review.heading') });
    expect(api.previewCreation).toHaveBeenLastCalledWith(expect.objectContaining({
        signingOrder: { mode: 'sequential', roles: ['lawyer', 'first'] },
    }));
    expect(screen.getByText(i18n.t('signing.upload.signingOrderSequential'))).toBeInTheDocument();
});

test('requires a run name and at least one recipient before asking the server', async () => {
    const i18n = await translations('en'), api = fakeApi();
    await toRecipients(i18n, api);
    fireEvent.click(screen.getByRole('button', { name: 'Check data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one recipient');
    fireEvent.change(screen.getByLabelText('Run name'), { target: { value: '' } });
    fireEvent.change(field(screen.getByRole('group', { name: 'Row 1' }), 'Full name'), { target: { value: 'Synthetic employee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give this run a name');
    expect(api.previewCreation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    expect(field(screen.getByRole('group', { name: 'Row 2' }), 'Full name')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 2' }));
    expect(screen.queryByRole('group', { name: 'Row 2' })).not.toBeInTheDocument();
});

test('sending from an existing template preselects its latest published import', async () => {
    const i18n = await translations('en'), api = fakeApi();
    api.templates.mockResolvedValue({ legacy: [], templates: [
        { ...converted, versionId: 'older', name: 'Older version', origin: { templateId: 'legacy-1', version: 1 } },
        { ...converted, versionId: 'newer', name: 'Latest version', origin: { templateId: 'legacy-1', version: 2 } },
    ] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="legacy-1" onBack={jest.fn()} /></I18nextProvider>);
    await screen.findByLabelText('Run name');
    expect(screen.getByLabelText('Run name')).toHaveValue('Latest version');
    expect(screen.queryByRole('heading', { name: en.signingV2.compose.template.heading })).not.toBeInTheDocument();
    expect(api.importLegacy).not.toHaveBeenCalled();
});

test('a newer selected version is prepared once and opens recipients, never the older revision', async () => {
    const i18n = await translations('he'), api = fakeApi();
    api.templates.mockResolvedValueOnce({ legacy: [{ id: 'legacy-1', name: 'Updated agreement', version: 2 }],
        templates: [{ ...converted, origin: { templateId: 'legacy-1', version: 1 } }] })
        .mockResolvedValue({ legacy: [], templates: [{ ...converted, versionId: 'new-v2', name: 'Updated agreement', origin: { templateId: 'legacy-1', version: 2 } }] });
    api.importLegacy.mockResolvedValue({ versionId: 'new-v2' });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="legacy-1" initialTemplateVersion="2" onBack={jest.fn()} /></I18nextProvider>);
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.rows.heading') });
    expect(screen.getByLabelText(i18n.t('signingV2.compose.runName'))).toHaveValue('Updated agreement');
    expect(api.importLegacy).toHaveBeenCalledTimes(1);
    expect(api.importLegacy).toHaveBeenCalledWith('legacy-1', 'he', 2);
    expect(api.create).not.toHaveBeenCalled();
});

test('a changed or missing selection is explained without picking another template silently', async () => {
    const i18n = await translations('en'), api = fakeApi();
    api.templates.mockResolvedValue({ legacy: [], templates: [{ ...converted, origin: { templateId: 'legacy-1', version: 2 } }] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="legacy-1" initialTemplateVersion="1" /></I18nextProvider>);
    await screen.findByText(en.signingV2.compose.errors.SELECTED_TEMPLATE_CHANGED);
    expect(screen.queryByLabelText('Run name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another template' }));
    expect(await screen.findByRole('button', { name: /Employment pack/ })).toHaveAttribute('aria-pressed', 'false');
    expect(api.importLegacy).not.toHaveBeenCalled();
});

test('opening retry recovers a network failure and does not create a submission', async () => {
    const i18n = await translations('en'), api = fakeApi();
    api.templates.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ legacy: [], templates: [converted] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="t-1" /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('common.retry') }));
    await screen.findByLabelText('Run name');
    expect(api.create).not.toHaveBeenCalled();
});

test('back to templates retains entered data; replacing a template requires an explicit choice', async () => {
    const i18n = await translations('en'), api = fakeApi();
    api.templates.mockResolvedValue({ legacy: [], templates: [converted, { ...converted, versionId: 'different', name: 'Another agreement' }] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="t-1" /></I18nextProvider>);
    const name = await screen.findByLabelText('Run name');
    fireEvent.change(name, { target: { value: 'Keep my send name' } });
    fireEvent.change(field(screen.getByRole('group', { name: 'Row 1' }), 'Full name'), { target: { value: 'Synthetic client' } });
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.previous }));
    fireEvent.click(await screen.findByRole('button', { name: /Another agreement/ }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: en.signingV2.compose.keepEditing }));
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.next }));
    expect(screen.getByDisplayValue('Synthetic client')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Keep my send name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.previous }));
    fireEvent.click(await screen.findByRole('button', { name: /Another agreement/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace template and clear signers' }));
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.next }));
    expect(screen.queryByDisplayValue('Synthetic client')).not.toBeInTheDocument();
});

test('abandoned template load cannot replace the currently open draft', async () => {
    const i18n = await translations('en'), api = fakeApi();
    let resolve;
    api.templates.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="old" /></I18nextProvider>);
    view.unmount();
    api.templates.mockResolvedValue({ legacy: [], templates: [converted] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="t-1" /></I18nextProvider>);
    await screen.findByLabelText('Run name');
    await act(async () => resolve({ legacy: [], templates: [{ ...converted, templateId: 'old', name: 'Old response' }] }));
    await waitFor(() => expect(screen.getByLabelText('Run name')).toHaveValue('Employment pack'));
});

test('audience is chosen per send and changing it never copies one person to every package', async () => {
    const i18n = await translations('en'), api = fakeApi();
    await toRecipients(i18n, api);
    fireEvent.change(field(screen.getByRole('group', { name: 'Row 1' }), 'Full name'), { target: { value: 'Keep individual client' } });
    const choose = screen.getByRole('radiogroup', { name: 'Who fills Employee' });
    fireEvent.click(within(choose).getByRole('radio', { name: 'Same person in every package' }));
    const shared = screen.getByRole('group', { name: 'Employee', exact: true });
    expect(field(shared, 'Full name')).toHaveValue('');
    fireEvent.change(field(shared, 'Full name'), { target: { value: 'Shared client' } });
    fireEvent.click(within(choose).getByRole('radio', { name: 'Different person per package' }));
    expect(field(screen.getByRole('group', { name: 'Row 1' }), 'Full name')).toHaveValue('Keep individual client');
    fireEvent.click(within(choose).getByRole('radio', { name: 'Same person in every package' }));
    expect(field(screen.getByRole('group', { name: 'Employee', exact: true }), 'Full name')).toHaveValue('Shared client');
});

test('a preview response for earlier field values cannot advance to confirmation', async () => {
    const i18n = await translations('en'), api = fakeApi();
    await toRecipients(i18n, api);
    const name = field(screen.getByRole('group', { name: 'Row 1' }), 'Full name');
    fireEvent.change(name, { target: { value: 'Earlier' } });
    let resolve;
    api.previewCreation.mockReturnValue(new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'Check data' }));
    fireEvent.change(name, { target: { value: 'Current' } });
    await act(async () => resolve(validPreview(1)));
    expect(screen.queryByRole('heading', { name: en.signingV2.compose.review.heading })).not.toBeInTheDocument();
    expect(name).toHaveValue('Current');
    expect(api.create).not.toHaveBeenCalled();
});

test.each(['he', 'ar', 'en'])('case contacts require a role choice and case association reaches approval in %s', async language => {
    const i18n = await translations(language), api = fakeApi();
    const record = { id: 42, name: 'Synthetic case', people: [{ id: 71, name: 'Synthetic buyer', email: 'buyer@example.invalid', phone: '0501234567' }] };
    api.caseContext = jest.fn().mockResolvedValue(record); api.cases = jest.fn();
    api.templates.mockResolvedValue({ templates: [converted], legacy: [] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialCaseId="42" initialTemplateId="t-1" /></I18nextProvider>);
    await screen.findByText('Synthetic case');
    await screen.findByLabelText(i18n.t('signingV2.compose.runName'));
    const row = screen.getByRole('group', { name: i18n.t('signingV2.compose.rows.row', { number: new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language]).format(1) }) });
    expect(field(row, i18n.t('signingV2.compose.fields.name'))).toHaveValue('');
    fireEvent.change(within(row).getByLabelText(i18n.t('signingV2.compose.context.fill')), { target: { value: '71' } });
    expect(field(row, i18n.t('signingV2.compose.fields.name'))).toHaveValue('Synthetic buyer');
    expect(field(row, i18n.t('signingV2.compose.fields.email'))).toHaveValue('buyer@example.invalid');
    expect(field(screen.getByRole('group', { name: 'Lawyer' }), i18n.t('signingV2.compose.fields.name'))).toHaveValue('');
    api.previewCreation.mockResolvedValue(validPreview(1));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.review.heading') });
    expect(api.previewCreation.mock.calls[0][0].caseId).toBe(42);
    expect(screen.getByText('Synthetic case', { selector: 'dd bdi' })).toBeVisible();
    expect(api.cases).not.toHaveBeenCalled();
});

test('an unavailable deep-linked case blocks creation until explicitly removed', async () => {
    const i18n = await translations('en'), api = fakeApi();
    api.caseContext = jest.fn().mockRejectedValue({ code: 'NOT_FOUND' });
    api.templates.mockResolvedValue({ templates: [converted], legacy: [] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialCaseId="42" initialTemplateId="t-1" /></I18nextProvider>);
    const check = await screen.findByRole('button', { name: 'Check data' });
    expect(check).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue without a case' }));
    expect(check).toBeEnabled();
    expect(api.create).not.toHaveBeenCalled();
});

test('choosing an existing case through the real search control does not cancel its detail request', async () => {
    const i18n = await translations('en'), api = fakeApi();
    const record = { id: 42, name: 'Synthetic case', people: [] };
    api.cases = jest.fn().mockResolvedValue({ cases: [record] });
    let resolve;
    api.caseContext = jest.fn().mockReturnValue(new Promise(done => { resolve = done; }));
    api.templates.mockResolvedValue({ templates: [converted], legacy: [] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId="t-1" /></I18nextProvider>);
    fireEvent.change(screen.getByLabelText('Case for this send (optional)'), { target: { value: 'Synthetic' } });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Synthetic case · 42' }));
    expect(api.caseContext).toHaveBeenCalledWith(42);
    expect(screen.getByRole('button', { name: 'Check data' })).toBeDisabled();
    await act(async () => resolve(record));
    expect(await screen.findByText('Linked case:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check data' })).toBeEnabled();
});

test('an explicit same-person role sends a reference, preserves original details when detached and never copies a row into all packages', async () => {
    const i18n = await translations('en'), api = fakeApi();
    const listRoles = [
        { key:'opening',label:'Opening lawyer',audience:'shared',stage:0 },
        { key:'client',label:'Client',audience:'each',stage:1 },
        { key:'closing',label:'Closing lawyer',audience:'shared',stage:2 },
    ];
    api.templates.mockResolvedValue({templates:[{...converted,roles:listRoles}],legacy:[]});
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api}/></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button',{name:/Employment pack/}));
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.compose.next')}));
    const opening = screen.getByRole('group',{name:'Opening lawyer'});
    const closing = screen.getByRole('group',{name:'Closing lawyer'});
    fireEvent.change(within(opening).getByLabelText(i18n.t('signingV2.compose.fields.name')),{target:{value:'Same synthetic lawyer'}});
    fireEvent.change(within(opening).getByLabelText(i18n.t('signingV2.compose.fields.email')),{target:{value:'lawyer@example.invalid'}});
    fireEvent.change(within(closing).getByLabelText(i18n.t('signingV2.compose.fields.name')),{target:{value:'Separate draft details'}});
    const choice = within(closing).getByRole('combobox',{name:i18n.t('signingV2.compose.identity.label')});
    expect(within(choice).queryByRole('option',{name:'Same person as: Client'})).not.toBeInTheDocument();
    fireEvent.change(choice,{target:{value:'opening'}});
    expect(within(closing).queryByLabelText(i18n.t('signingV2.compose.fields.email'))).not.toBeInTheDocument();
    fireEvent.change(choice,{target:{value:''}});
    expect(within(closing).getByLabelText(i18n.t('signingV2.compose.fields.name'))).toHaveValue('Separate draft details');
    fireEvent.change(choice,{target:{value:'opening'}});
    const row = screen.getByRole('group',{name:i18n.t('signingV2.compose.rows.row',{number:'1'})});
    fireEvent.change(within(row).getByLabelText(i18n.t('signingV2.compose.fields.name')),{target:{value:'Client'}});
    fireEvent.change(within(row).getByLabelText(i18n.t('signingV2.compose.fields.email')),{target:{value:'client@example.invalid'}});
    api.previewCreation.mockResolvedValue({...validPreview(1), shared:[{roleKey:'opening',name:'Same synthetic lawyer'},{roleKey:'closing',name:'Same synthetic lawyer'}]});
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.compose.check')}));
    await screen.findByRole('heading',{name:i18n.t('signingV2.compose.review.heading')});
    expect(screen.queryByText(/Same synthetic lawyer, Same synthetic lawyer/)).not.toBeInTheDocument();
    expect(api.previewCreation.mock.calls[0][0].shared.closing).toEqual({sameAsRole:'opening'});
    expect(api.previewCreation.mock.calls[0][0].signingOrder).toEqual({mode:'sequential',roles:['opening','client','closing']});
});

test('a committed draft restores the actual package count without creating again or needing its old preview', async () => {
    const i18n = await translations('en'); const api = fakeApi();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/?draft=10000000-0000-4000-8000-000000000001');
    api.draft = jest.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001', version: 4, state: 'submitted',
        payload: {}, result: { submissionId: 'already-committed', packageCount: 7, documentCount: 21, reused: true } }));
    api.saveDraft = jest.fn(); api.submitDraft = jest.fn();
    try {
        render(<I18nextProvider i18n={i18n}><PackageComposer api={api} /></I18nextProvider>);
        await screen.findByRole('heading', { name: i18n.t('signingV2.compose.done.heading') });
        expect(screen.getByText(i18n.t('signingV2.compose.done.body', { count: 7, formattedCount: '7' }))).toBeVisible();
        expect(api.create).not.toHaveBeenCalled(); expect(api.submitDraft).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled();
    } finally { window.history.replaceState(null, '', previousUrl); }
});

const businessFields = [
    { key: 'identity', label: 'Identity number', type: 'identifier', required: true },
    { key: 'amount', label: 'Exact amount', type: 'decimal' },
    { key: 'confirmed', label: 'Confirmed', type: 'boolean', defaultValue: false },
    { key: 'kind', label: 'Matter kind', type: 'enum', options: ['A', 'B'] },
    { key: 'date', label: 'Meeting date', type: 'date' },
];
async function openDataComposer(i18n, api, dataRoles = roles) {
    api.templates.mockResolvedValue({ templates: [{ ...converted, roles: dataRoles, dataKeys: businessFields }], legacy: [] });
    render(<I18nextProvider i18n={i18n}><PackageComposer api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /Employment pack/ }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.next') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.data.heading') });
}

test.each(['he', 'ar', 'en'])('document data keeps identifiers, exact amounts and false, links field errors and survives review in %s', async language => {
    const i18n = await translations(language), api = fakeApi();
    await openDataComposer(i18n, api);
    const person = screen.getByRole('group', { name: i18n.t('signingV2.compose.rows.row', { number: new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-EG', en: 'en-GB' }[language]).format(1) }) });
    fireEvent.change(within(person).getByLabelText(i18n.t('signingV2.compose.fields.name')), { target: { value: 'Synthetic data client' } });
    const identity = screen.getByLabelText(/Identity number/), amount = screen.getByLabelText('Exact amount');
    expect(identity).toHaveAttribute('type', 'text');
    expect(screen.getByRole('combobox', { name: 'Confirmed' })).toHaveValue('false');
    fireEvent.change(identity, { target: { value: '000001234' } });
    fireEvent.change(amount, { target: { value: '9007199254740993.120000' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Confirmed' }), { target: { value: 'true' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Confirmed' }), { target: { value: 'false' } });
    const dateGroup = screen.getByRole('group', { name: 'Meeting date' });
    fireEvent.change(within(dateGroup).getByRole('textbox', { name: i18n.t('calendar.dateSegmentDay') }), { target: { value: '29' } });
    fireEvent.change(within(dateGroup).getByRole('textbox', { name: i18n.t('calendar.dateSegmentMonth') }), { target: { value: '02' } });
    fireEvent.change(within(dateGroup).getByRole('textbox', { name: i18n.t('calendar.dateSegmentYear') }), { target: { value: '2028' } });
    api.previewCreation.mockResolvedValueOnce({ valid: false, errorCount: 1, errors: [{ path: 'rows.0.data.amount', code: 'INVALID_DATA' }] });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    const error = await screen.findByRole('alert');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(within(error).getByRole('button', { name: /Exact amount/ }));
    expect(amount).toHaveFocus();
    const data = { identity: '000001234', amount: '9007199254740993.120000', confirmed: false, date: '2028-02-29' };
    const result = validPreview(1); result.sample[0].data = data;
    api.previewCreation.mockResolvedValueOnce(result);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.review.heading') });
    expect(api.previewCreation.mock.calls.at(-1)[0].rows[0]).toMatchObject({ data, dataSources: { identity: 'manual', amount: 'manual', confirmed: 'manual', date: 'manual' } });
    expect(screen.getByText('000001234')).toBeInTheDocument();
    expect(screen.getByText('9007199254740993.120000')).toBeInTheDocument();
    expect(screen.getByText(new Intl.DateTimeFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2028-02-29T00:00:00Z')))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.review.edit') }));
    expect(screen.getByLabelText(/Identity number/)).toHaveValue('000001234');
    expect(screen.getByRole('combobox', { name: 'Confirmed' })).toHaveValue('false');
});

test('shared signers can create separate data-only packages and data changes invalidate the approved preview', async () => {
    const i18n = await translations('en'), api = fakeApi();
    await openDataComposer(i18n, api, [{ ...roles[0], audience: 'shared' }]);
    fireEvent.change(screen.getByLabelText(/Identity number/), { target: { value: '0001' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.rows.add') }));
    fireEvent.change(screen.getAllByLabelText(/Identity number/)[1], { target: { value: '0002' } });
    api.previewCreation.mockResolvedValue({ ...validPreview(2), sample: [] });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.review.heading') });
    expect(api.previewCreation.mock.calls[0][0].rows.map(row => row.data.identity)).toEqual(['0001', '0002']);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.review.edit') }));
    fireEvent.change(screen.getAllByLabelText(/Identity number/)[1], { target: { value: '0003' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i18n.t('signingV2.compose.review.heading') });
    expect(api.previewCreation.mock.calls[1][0].rows[1].data.identity).toBe('0003');
    expect(api.create).not.toHaveBeenCalled();
});

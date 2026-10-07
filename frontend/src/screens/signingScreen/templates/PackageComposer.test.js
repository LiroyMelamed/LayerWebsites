import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    expect(api.importLegacy).toHaveBeenCalledWith(7, i18n.language);
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

test('Excel rows replace manual rows and skipped rows are reported by their sheet row', async () => {
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
    await screen.findByText(i18n.t('signingV2.compose.excel.imported', { count: 2, formattedCount: '2' }));
    expect(api.parseWorkbook).toHaveBeenCalledWith('v-1', expect.any(String));
    expect(screen.getByText(new RegExp(i18n.t('signingV2.compose.rowErrors.UNSUPPORTED_CELL')))).toBeInTheDocument();
    expect(screen.getAllByDisplayValue(/Synthetic (one|three)/)).toHaveLength(2);
    expect(screen.getByDisplayValue('0501234567')).toHaveAttribute('dir', 'ltr');

    fireEvent.change(upload, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.xlsx')] } });
    expect(await screen.findByText(i18n.t('signingV2.compose.errors.WORKBOOK_TOO_LARGE'))).toBeInTheDocument();
    expect(api.parseWorkbook).toHaveBeenCalledTimes(1);
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

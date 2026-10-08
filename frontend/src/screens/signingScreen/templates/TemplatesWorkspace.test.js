import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import he from '../../../i18n/locales/he.json';
import en from '../../../i18n/locales/en.json';
import ar from '../../../i18n/locales/ar.json';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import api from '../../../api/signingTemplatesApi';
import BatchComposer from './BatchComposer';
import TemplatesWorkspace from './TemplatesWorkspace';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: {
    create: jest.fn(), list: jest.fn(), batches: jest.fn(), batch: jest.fn(), send: jest.fn(), contacts: jest.fn(), archive: jest.fn(), link: jest.fn(), downloadPackage: jest.fn(), completion: jest.fn(),
} }));

jest.mock('../../../utils/downloadBlobAsFile', () => ({ downloadBlobAsFile: jest.fn() }));

async function showWorkspace(props = {}, lng = 'he') {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { he: { translation: he }, en: { translation: en }, ar: { translation: ar } }, lng, fallbackLng: false, interpolation: { escapeValue: false } });
    render(<I18nextProvider i18n={i18n}><TemplatesWorkspace onClose={() => {}} canUpload canManage {...props} /></I18nextProvider>);
    await waitFor(() => expect(screen.queryByText(i18n.t('signingV2.workspace.loading'))).not.toBeInTheDocument());
    return i18n;
}

// CRA's jsdom has no Web Crypto; browsers do.
if (!window.crypto?.randomUUID) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const deferred = () => { let resolve;const promise = new Promise(done => { resolve = done; });return { promise, resolve }; };
// Both clicks land before React re-renders, so the disabled attribute cannot stop the second one.
const doubleClick = button => act(() => { button.click();button.click(); });

beforeEach(() => jest.clearAllMocks());

test('a double click on create submits one batch with one idempotency key', async () => {
    const pending = deferred();api.create.mockReturnValue(pending.promise);
    const onCreated = jest.fn();
    const template = { id: 't-1', version: 1, name: 'Synthetic template', definition: { roles: [{ id: 'employee', name: 'Employee', shared: false }], documents: [{ id: 'd-1' }] } };
    render(<BatchComposer template={template} onBack={() => {}} onCreated={onCreated} />);
    const button = screen.getByRole('button', { name: 'יצירת החבילות לבדיקה' });
    doubleClick(button);
    expect(api.create).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ batch: { id: 'b-1' } }));
    expect(onCreated).toHaveBeenCalledWith('b-1');
});

test('a double click on send invites recipients once', async () => {
    const view = { batch: { id: 'b-1', name: 'Synthetic batch', status: 'ready', template_version: 1, snapshot: { packages: [{ label: 'Employee 1' }], definition: { documents: [{ id: 'd-1' }] } } },
        files: [], canDeliver: true, recipients: [{ id: 'r-1', name: 'Synthetic employee', status: 'pending', delivery_method: 'email' }] };
    api.list.mockResolvedValue({ templates: [] });
    api.batches.mockResolvedValue({ batches: [{ id: 'b-1', name: 'Synthetic batch', status: 'ready', created_at: '2026-10-07T08:00:00Z' }] });
    api.batch.mockResolvedValue(view);
    const pending = deferred();api.send.mockReturnValue(pending.promise);
    await showWorkspace();
    const details = await screen.findByRole('button', { name: 'פרטי השליחה' });
    act(() => details.click());
    const button = await screen.findByRole('button', { name: 'שליחת ההזמנות לנמענים' });
    await waitFor(() => expect(button).toBeEnabled());
    doubleClick(button);
    expect(api.send).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ...view, recipients: [{ ...view.recipients[0], status: 'sent' }] }));
    expect(screen.queryByRole('button', { name: 'שליחת ההזמנות לנמענים' })).toBeNull();
});

test('sending from a template hands off to the enabled package workflow instead of creating a legacy batch', async () => {
    const template = { id: 'template-1', name: 'Family agreement', version: 2, document_count: 3 };
    api.list.mockResolvedValue({ templates: [template] }); api.batches.mockResolvedValue({ batches: [] });
    const onSendTemplate = jest.fn();
    await showWorkspace({ onSendTemplate });
    const send = await screen.findByRole('button', { name: 'שליחה מהתבנית' });
    act(() => send.click());
    await waitFor(() => expect(onSendTemplate).toHaveBeenCalledWith(template));
    expect(api.create).not.toHaveBeenCalled();
});

test.each(['he', 'ar', 'en'])('workspace list, details and actions use platform language %s', async lng => {
    const template = { id: 'template-1', name: 'Family agreement', version: 12, document_count: 3 };
    const created = '2026-10-07T08:00:00Z';
    const view = {
        batch: { id: 'batch-1', name: 'Existing family send', status: 'partial', template_version: 12, snapshot: {
            packages: [{ label: 'Family A' }, { label: 'Family B' }],
            definition: { completionMode: 'package', documents: [{ id: 'pdf-1' }] },
        } },
        canDeliver: true,
        files: [
            { signingfileid: 1, filename: 'Complete agreement.pdf', status: 'signed', package_index: 0, signed_count: 2, required_count: 2 },
            { signingfileid: 2, filename: 'Pending agreement.pdf', status: 'pending', package_index: 1, signed_count: 1, required_count: 2 },
        ],
        recipients: [{ id: 'r-1', name: 'Synthetic client', status: 'uncertain', delivery_method: 'phone' }],
        completion: [{ package_index: 0, recipient_email: 'qa@example.invalid', status: 'sent' }],
    };
    api.list.mockResolvedValue({ templates: [template] });
    api.batches.mockResolvedValue({ batches: [{ ...view.batch, created_at: created }] });
    api.batch.mockResolvedValue(view);
    api.link.mockResolvedValue({ url: 'https://example.invalid/Sign#synthetic' });
    api.downloadPackage.mockResolvedValue(new Blob(['synthetic archive']));
    api.completion.mockResolvedValue(view);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = jest.fn();
    const i18n = await showWorkspace({ onClose }, lng);
    const t = (key, args) => i18n.t(`signingV2.workspace.${key}`, args);
    const locale = { he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[lng];
    const number = value => new Intl.NumberFormat(locale).format(value);
    await screen.findByText('Family agreement');
    expect(screen.getByRole('region', { name: t('title') })).toHaveAttribute('dir', lng === 'en' ? 'ltr' : 'rtl');
    expect(screen.getByText(`${t('documents', { count: 3, formattedCount: number(3) })} · ${t('version', { version: number(12) })}`)).toBeVisible();
    expect(screen.getByText(new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(created)))).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: t('archive') }));
    expect(confirm).toHaveBeenCalledWith(t('archiveConfirm', { name: template.name }));
    expect(api.archive).not.toHaveBeenCalled();
    confirm.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: t('batchDetails') }));
    await screen.findByRole('heading', { name: view.batch.name });
    expect(screen.getByText(t('uncertainHelp'))).toBeVisible();
    expect(screen.queryByRole('button', { name: t('sendInvitations') })).not.toBeInTheDocument();
    expect(screen.getByText(t('completionSent'))).toBeVisible();
    expect(screen.queryByRole('button', { name: t('downloadEvidence', { name: 'Family B' }) })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('downloadEvidence', { name: 'Family A' }) }));
    await waitFor(() => expect(downloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'signed-package-1.zip'));
    expect(api.downloadPackage).toHaveBeenCalledWith('batch-1', 0);
    fireEvent.click(screen.getByRole('button', { name: t('signingLink') }));
    expect(await screen.findByLabelText(t('linkForRecipient'))).toHaveValue('https://example.invalid/Sign#synthetic');
    expect(screen.getByLabelText(t('linkForRecipient'))).toHaveAttribute('dir', 'ltr');
    fireEvent.click(screen.getByRole('button', { name: t('copyLink') }));
    await screen.findByText(t('copyFailed'));
    fireEvent.click(screen.getByRole('button', { name: t('backToTemplates') }));
    await waitFor(() => expect(screen.queryByText(t('loading'))).not.toBeInTheDocument());
    await screen.findByText('Family agreement');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.backToDocuments') }));
    expect(onClose).toHaveBeenCalledTimes(1);
});

test.each(['ar', 'en'])('request failures use translated messages and recover in %s', async lng => {
    api.list.mockRejectedValueOnce(Object.assign(new Error('INTERNAL_ERROR_DETAIL'), { code: 'FORBIDDEN' })).mockResolvedValue({ templates: [] });
    api.batches.mockResolvedValue({ batches: [] });
    const i18n = await showWorkspace({}, lng);
    await screen.findByText(i18n.t('signingV2.errors.FORBIDDEN'));
    expect(screen.queryByText('INTERNAL_ERROR_DETAIL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.refresh') }));
    await screen.findByText(i18n.t('signingV2.workspace.emptyTitle'));
    expect(screen.queryByText(i18n.t('signingV2.errors.FORBIDDEN'))).not.toBeInTheDocument();
});

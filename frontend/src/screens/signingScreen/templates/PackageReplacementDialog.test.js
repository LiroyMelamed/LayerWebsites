import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import PackageReplacementDialog from './PackageReplacementDialog';
import PackageComposer from './PackageComposer';
import SigningPackagesWorkspace from './SigningPackagesWorkspace';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => { const React = require('react'); return () => React.createElement('div', null, 'Synthetic PDF'); });
jest.mock('../../../utils/downloadBlobAsFile', () => ({ downloadBlobAsFile: jest.fn().mockResolvedValue(true) }));
if (!window.crypto?.getRandomValues) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const roles = [{ key: 'first', label: 'Employee', audience: 'each', stage: 0 }];
const template = { versionId: 'v-1', name: 'Agreement', roles, documents: [{ key: 'd1', name: 'Agreement' }],
    dataKeys: [{ key: 'amount', label: 'Amount', type: 'decimal', required: true }] };
const content = { templateVersionId: 'v-1', name: 'One package', deadline: '2026-11-01T10:00:00.000Z', caseId: 7, clientId: 8,
    signingOrder: { mode: 'parallel' }, shared: {}, omittedRoles: [], rows: [{ key: 'E1', data: { amount: '100' }, dataSources: { amount: 'manual' },
        recipients: { first: { name: 'Synthetic person', email: 'person@example.invalid', locale: 'ar', channel: 'email', personId: 'person-1' } } }] };
const source = { packageId: 'pkg-1', revisionId: 'revision-1', packageVersion: 3, revisionVersion: 2, sourceState: 'active', acceptedCount: 1,
    sourceReviewHash: 'source-review-1', templateVersionId: 'v-1', reasonRequired: true, content, template, stopDefault: true, history: [] };
const reviewed = { valid: true, errors: [], errorCount: 0, previewHash: 'replacement-hash', packageCount: 1, documentCount: 1, recipientCount: 1,
    shared: [], sample: [{ key: 'E1', recipients: [{ roleKey: 'first', name: 'Synthetic person', channels: ['email'] }], data: { amount: '250' } }], template };
function apiFor() {
    return { replacement: jest.fn().mockResolvedValue(source), startReplacement: jest.fn().mockResolvedValue({ ...source, expectedPackageVersion: 4,
        expectedRevisionId: 'revision-1', sourceState: 'replacement_pending', stopCurrent: true }),
        previewReplacement: jest.fn().mockResolvedValue(reviewed), publishReplacement: jest.fn().mockResolvedValue({ packageId: 'pkg-1', revisionId: 'revision-2', replacedRevisionId: 'revision-1', submissionId: 'sub-1', state: 'authorized_preparing' }),
        previewCreation: jest.fn(), create: jest.fn(), saveDraft: jest.fn(), draft: jest.fn(), submitDraft: jest.fn() };
}
async function translations(language = 'en') {
    const i = createInstance();
    await i.use(initReactI18next).init({ resources: { he: { translation: he }, ar: { translation: ar }, en: { translation: en } }, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    return i;
}
async function mountDialog(api, language = 'en', onStarted = jest.fn()) {
    const i = await translations(language);
    render(<I18nextProvider i18n={i}><PackageReplacementDialog api={api} packageId="pkg-1" onClose={jest.fn()} onStarted={onStarted} /></I18nextProvider>);
    await screen.findByRole('textbox', { name: i.t('signingV2.replacement.reason') });
    return i;
}
function reason(i, value = 'Correct amount') { fireEvent.change(screen.getByRole('textbox', { name: i.t('signingV2.replacement.reason') }), { target: { value } }); }
async function mountComposer(api, context = { ...source, expectedPackageVersion: 4, reason: 'Correct amount', stopCurrent: true }, onCreated = jest.fn()) {
    const i = await translations();
    render(<I18nextProvider i18n={i}><PackageComposer api={api} replacementContext={context} onBack={jest.fn()} onCreated={onCreated} /></I18nextProvider>);
    await screen.findByRole('textbox', { name: 'Amount (' + i.t('signingV2.compose.mapping.required') + ')' });
    return i;
}

test.each(['he', 'ar', 'en'])('new replacement reviews preserved signatures, requires reason and defaults to stopping in %s', async language => {
    const api = apiFor(), started = jest.fn(), i = await mountDialog(api, language, started);
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    const formattedCount = new Intl.NumberFormat({ he: 'he-IL', ar: 'ar-IL', en: 'en-GB' }[language]).format(1);
    expect(screen.getByText(i.t('signingV2.replacement.preserved', { count: 1, formattedCount }))).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    const start = screen.getByRole('button', { name: i.t('signingV2.replacement.start') });
    expect(start).toBeDisabled(); reason(i);
    fireEvent.click(start); fireEvent.click(start);
    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
    expect(api.startReplacement).toHaveBeenCalledTimes(1);
    expect(api.startReplacement.mock.calls[0][1]).toEqual({ expectedPackageVersion: 3, expectedRevisionId: 'revision-1', sourceReviewHash: 'source-review-1', reason: 'Correct amount', stopCurrent: true });
    expect(started.mock.calls[0][0]).toEqual(expect.objectContaining({ expectedPackageVersion: 4, reason: 'Correct amount', content, template }));
});
test('new replacement explicitly explains keeping the source active until publication', async () => {
    const api = apiFor(), i = await mountDialog(api);
    fireEvent.click(screen.getByRole('checkbox')); reason(i);
    expect(screen.getByText(i.t('signingV2.replacement.activeHelp'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await waitFor(() => expect(api.startReplacement).toHaveBeenCalled());
    expect(api.startReplacement.mock.calls[0][1].stopCurrent).toBe(false);
});
test('new replacement lost response retries the exact stopped-source decision and key', async () => {
    const api = apiFor(); api.startReplacement.mockRejectedValueOnce({ code: 'REQUEST_FAILED' });
    const i = await mountDialog(api); reason(i);
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await screen.findByText(i.t('signingV2.errors.REQUEST_FAILED'));
    expect(screen.getByRole('textbox')).toBeDisabled(); expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await waitFor(() => expect(api.startReplacement).toHaveBeenCalledTimes(2));
    expect(api.startReplacement.mock.calls[1]).toEqual(api.startReplacement.mock.calls[0]);
});
test('new replacement concurrent signing blocks stale stopping and refreshes the source consequences', async () => {
    const api = apiFor(); api.startReplacement.mockRejectedValueOnce({ code: 'PREVIEW_CHANGED' });
    const i = await mountDialog(api); reason(i);
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await screen.findByText(i.t('signingV2.errors.PREVIEW_CHANGED'));
    expect(screen.getByRole('button', { name: i.t('signingV2.replacement.start') })).toBeDisabled();
    api.replacement.mockResolvedValueOnce({ ...source, acceptedCount: 2, sourceReviewHash: 'new-source' });
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.refresh') }));
    await screen.findByText(i.t('signingV2.replacement.preserved', { count: 2, formattedCount: '2' }));
    reason(i, 'Reviewed new signatures'); fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await waitFor(() => expect(api.startReplacement).toHaveBeenCalledTimes(2));
    expect(api.startReplacement.mock.calls[1][1].sourceReviewHash).toBe('new-source');
    expect(api.startReplacement.mock.calls[1][2]).not.toBe(api.startReplacement.mock.calls[0][2]);
});
test('new replacement permission loss hides the private review and form', async () => {
    const api = apiFor(); api.startReplacement.mockRejectedValueOnce({ code: 'FORBIDDEN' });
    const i = await mountDialog(api); reason(i);
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await screen.findByText(i.t('signingV2.errors.FORBIDDEN'));
    expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByRole('checkbox')).toBeNull();
});
test('new replacement composer edits one package, preserves deadline and language, previews and publishes one reviewed revision', async () => {
    const api = apiFor(), onCreated = jest.fn(), i = await mountComposer(api, undefined, onCreated);
    expect(screen.getByRole('textbox', { name: i.t('signingV2.compose.fields.name') })).toHaveValue('Synthetic person');
    expect(screen.queryByRole('button', { name: i.t('signingV2.compose.rows.add') })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: i.t('signingV2.compose.rows.source') })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount (' + i.t('signingV2.compose.mapping.required') + ')' }), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.compose.check') }));
    await screen.findByRole('heading', { name: i.t('signingV2.compose.review.heading') });
    const publish = screen.getByRole('button', { name: i.t('signingV2.replacement.publish') });
    expect(publish).toBeDisabled();
    expect(api.previewReplacement.mock.calls[0][1]).toEqual(expect.objectContaining({ expectedPackageVersion: 4, expectedRevisionId: 'revision-1', reason: 'Correct amount', content: expect.objectContaining({
        deadline: content.deadline, caseId: 7, clientId: 8, rows: [{ key: 'E1', data: { amount: '250' }, dataSources: { amount: 'manual' }, recipients: { first: {
            name: 'Synthetic person', email: 'person@example.invalid', phone: '', locale: 'ar', channel: 'email', personId: 'person-1' } } }],
    }) }));
    fireEvent.click(screen.getByRole('checkbox', { name: i.t('signingV2.replacement.confirmFresh') }));
    fireEvent.click(publish); fireEvent.click(publish);
    await screen.findByRole('heading', { name: i.t('signingV2.replacement.saved') });
    expect(api.publishReplacement).toHaveBeenCalledTimes(1);
    expect(api.publishReplacement.mock.calls[0][1]).toEqual({ ...api.previewReplacement.mock.calls[0][1], previewHash: 'replacement-hash' });
    expect(api.previewCreation).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.openPackage') }));
    expect(onCreated).toHaveBeenCalledWith('sub-1', expect.objectContaining({ packageId: 'pkg-1', revisionId: 'revision-2' }));
});
test('new replacement publish retry keeps the exact preview and changed source requires a new acknowledgment', async () => {
    const api = apiFor(); api.publishReplacement.mockRejectedValueOnce({ code: 'REQUEST_FAILED' }).mockRejectedValueOnce({ code: 'PREVIEW_CHANGED' });
    const i = await mountComposer(api);
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.compose.check') }));
    await screen.findByRole('checkbox', { name: i.t('signingV2.replacement.confirmFresh') });
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.publish') }));
    await screen.findByText(i.t('signingV2.errors.REQUEST_FAILED'));
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.publish') }));
    await screen.findByText(i.t('signingV2.errors.PREVIEW_CHANGED'));
    expect(api.publishReplacement.mock.calls[1]).toEqual(api.publishReplacement.mock.calls[0]);
    api.replacement.mockResolvedValueOnce({ ...source, packageVersion: 5 });
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.refresh') }));
    await waitFor(() => expect(api.replacement).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: i.t('signingV2.compose.check') })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.compose.check') }));
    await screen.findByRole('checkbox', { name: i.t('signingV2.replacement.confirmFresh') });
    expect(api.previewReplacement.mock.calls[1][1].expectedPackageVersion).toBe(5);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: i.t('signingV2.replacement.publish') })).toBeDisabled();
});
test('new replacement composer hides private form after publication permission is revoked', async () => {
    const api = apiFor(); api.publishReplacement.mockRejectedValueOnce({ code: 'FORBIDDEN' });
    const i = await mountComposer(api);
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.compose.check') }));
    fireEvent.click(await screen.findByRole('checkbox', { name: i.t('signingV2.replacement.confirmFresh') }));
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.publish') }));
    await screen.findByText(i.t('signingV2.errors.FORBIDDEN'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('Synthetic person')).toBeNull();
    expect(screen.queryByText(content.name)).toBeNull();
});
function workspaceApi() {
    const api = apiFor();
    api.list = jest.fn().mockResolvedValue({ rows: [{ id: 'pkg-1', name: 'One package', is_batch: false, created_at: '2026-10-08T10:00:00Z', package_count: 1, accepted_count: 1, required_count: 2, document_count: 1, prepared_count: 1 }], total: 1 });
    api.details = jest.fn().mockResolvedValue({ package: { id: 'pkg-1', external_key: 'One package', workflow_state: 'active', accepted_count: 1, required_count: 2, prepared_count: 1, document_count: 1 },
        capabilities: { packageRevise: true }, participants: [], documents: [], deliveries: [], issues: [],
        revisionHistory: [{ revisionId: 'old-revision', revisionNumber: 1, state: 'superseded', acceptedCount: 1, createdAt: '2026-10-07T10:00:00Z', reason: 'Correct amount',
            documents: [{ id: 'old-document', name: 'Historical agreement', final: true }], evidence: true }] });
    api.revisionDocumentFile = jest.fn().mockResolvedValue(new Blob(['historical document']));
    api.revisionEvidenceFile = jest.fn().mockResolvedValue(new Blob(['historical evidence']));
    return api;
}
test('new workspace replacement opens the existing composer after the reviewed stop', async () => {
    const api = workspaceApi(), i = await translations();
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /One package/ }));
    fireEvent.click(await screen.findByRole('button', { name: i.t('signingV2.replacement.title') }));
    await screen.findByRole('textbox', { name: i.t('signingV2.replacement.reason') }); reason(i);
    fireEvent.click(screen.getByRole('button', { name: i.t('signingV2.replacement.start') }));
    await screen.findByRole('heading', { name: i.t('signingV2.replacement.composeTitle') });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('textbox', { name: i.t('signingV2.compose.fields.name') })).toHaveValue('Synthetic person');
});
test('new revision history downloads the selected historical document and evidence through scoped APIs', async () => {
    const api = workspaceApi(), i = await translations();
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /One package/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('radio', { name: i.t('signingV2.replacement.history') }));
    expect(within(dialog).getByText('Correct amount')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: i.t('signingV2.replacement.downloadDocument') + ': Historical agreement' }));
    await waitFor(() => expect(api.revisionDocumentFile).toHaveBeenCalledWith('pkg-1', 'old-revision', 'old-document'));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: i.t('signingV2.public.downloadEvidence') })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole('button', { name: i.t('signingV2.public.downloadEvidence') }));
    await waitFor(() => expect(api.revisionEvidenceFile).toHaveBeenCalledWith('pkg-1', 'old-revision'));
    expect(downloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'Historical agreement-1.pdf');
});
test.each([
    ['reminder', 'provider_accepted', { send: true, packageRemind: false, deliveryResend: true, linkRenew: true }, 'reminder'],
    ['resend', 'failed', { send: true, packageRemind: true, deliveryResend: false, linkRenew: true }, 'resend'],
    ['renewal', 'provider_accepted', { send: true, packageRemind: true, deliveryResend: false, linkRenew: true }, 'renew_link'],
])('new explicit %s permission gate hides its targeted action despite general send permission', async (_name, state, capabilities, hidden) => {
    const api = workspaceApi(), i = await translations();
    const detail = { package: { id: 'pkg-1', external_key: 'One package', workflow_state: 'active', accepted_count: 0, required_count: 1, prepared_count: 1, document_count: 1 }, capabilities,
        participants: [{ id: 'participation', personId: 'person', name: 'Synthetic person', capacity: 'personal', tasks: [{ id: 'task', state: 'ready' }] }],
        documents: [], deliveries: [{ id: 'delivery', personId: 'person', state, channel: 'email' }], issues: [] };
    api.details.mockResolvedValue(detail);
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /One package/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Synthetic person');
    expect(within(dialog).queryByRole('button', { name: i.t('signingV2.action.' + hidden + '.open') })).toBeNull();
});
test('new purpose gates retain the completed-copy action under its existing send permission', async () => {
    const api = workspaceApi(), i = await translations();
    api.details.mockResolvedValue({ package: { id: 'pkg-1', external_key: 'One package', workflow_state: 'complete', accepted_count: 1, required_count: 1, prepared_count: 1, document_count: 1 },
        capabilities: { send: true, packageRemind: false, deliveryResend: false, linkRenew: false },
        participants: [{ id: 'participation', personId: 'person', name: 'Synthetic person', capacity: 'personal', tasks: [{ id: 'task', state: 'accepted' }] }],
        documents: [], deliveries: [], issues: [] });
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /One package/ }));
    expect(await within(await screen.findByRole('dialog')).findByRole('button', { name: i.t('signingV2.action.completed_copy.open') })).toBeInTheDocument();
});
test('new stopped replacement hides old-link reminders and renewal even when tasks were ready', async () => {
    const api = workspaceApi(), i = await translations();
    api.details.mockResolvedValue({ package: { id: 'pkg-1', external_key: 'One package', workflow_state: 'replacement_pending', accepted_count: 0, required_count: 1, prepared_count: 1, document_count: 1 },
        capabilities: { send: true, packageRemind: true, deliveryResend: true, linkRenew: true, packageRevise: true },
        participants: [{ id: 'participation', personId: 'person', name: 'Synthetic person', capacity: 'personal', tasks: [{ id: 'task', state: 'ready' }] }],
        documents: [], deliveries: [], issues: [] });
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /One package/ }));
    const dialog = await screen.findByRole('dialog'); await within(dialog).findByText('Synthetic person');
    expect(within(dialog).queryByRole('button', { name: i.t('signingV2.action.reminder.open') })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: i.t('signingV2.action.renew_link.open') })).toBeNull();
    expect(within(dialog).getByRole('button', { name: i.t('signingV2.replacement.title') })).toBeInTheDocument();
});
test('new access-denial refresh clears cached names and PDFs while transient failures retain the current review', async () => {
    const api = workspaceApi(), i = await translations();
    const detail = { package: { id: 'pkg-1', external_key: 'Private package', workflow_state: 'active', accepted_count: 0, required_count: 1, prepared_count: 1, document_count: 1 },
        capabilities: {}, participants: [], documents: [{ id: 'private-document', name: 'Private contract', state: 'ready', spots: [] }], deliveries: [], issues: [] };
    api.details.mockResolvedValue(detail);
    api.documentFile = jest.fn().mockResolvedValue(new Blob(['private pdf']));
    jest.useFakeTimers();
    render(<I18nextProvider i18n={i}><SigningPackagesWorkspace api={api} /></I18nextProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /One package/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('radio', { name: i.t('signingV2.tabs.documents') }));
    const show = () => fireEvent.click(within(dialog).getByRole('button', { name: i.t('signingV2.public.view') + ': Private contract' }));
    show(); await screen.findByText('Synthetic PDF');
    const poll = () => act(async () => { jest.advanceTimersByTime(8000); });
    try {
        api.details.mockRejectedValueOnce({ code: 'REQUEST_FAILED' });
        await poll();
        expect(within(dialog).getByText(i.t('signingV2.errors.REQUEST_FAILED'))).toBeInTheDocument();
        expect(within(dialog).getByText('Private contract')).toBeInTheDocument();
        expect(within(dialog).getByText('Synthetic PDF')).toBeInTheDocument();
        for (const code of ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED', 'ACCESS_CHANGED']) {
            api.details.mockRejectedValueOnce({ code });
            await poll();
            expect(within(dialog).queryByText('Private package')).toBeNull();
            expect(within(dialog).queryByText('Private contract')).toBeNull();
            expect(within(dialog).queryByText('Synthetic PDF')).toBeNull();
            await poll();
            expect(within(dialog).getByText('Private contract')).toBeInTheDocument();
            expect(within(dialog).queryByText('Synthetic PDF')).toBeNull();
            const previousLoads = api.documentFile.mock.calls.length;
            show();
            expect(api.documentFile).toHaveBeenCalledTimes(previousLoads + 1);
            expect(await within(dialog).findByText('Synthetic PDF')).toBeInTheDocument();
        }
        api.list.mockRejectedValueOnce({ code: 'ACCESS_CHANGED' });
        await poll();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('button', { name: /One package/ })).toBeNull();
        expect(screen.queryByText('Synthetic PDF')).toBeNull();
    } finally { jest.useRealTimers(); }
});

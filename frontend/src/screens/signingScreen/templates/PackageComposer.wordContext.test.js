import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import PackageComposer from './PackageComposer';
import en from '../../../i18n/locales/en.json';
import { changeField } from '../../../testUtils/changeField';

const origin = { kind: 'word_preview', previewId: '11111111-1111-4111-8111-111111111111',
    sourceId: '22222222-2222-4222-8222-222222222222', sourceVersion: 3, pdfHash: 'a'.repeat(64) };
const word = { templateId: '33333333-3333-4333-8333-333333333333', versionId: '44444444-4444-4444-8444-444444444444',
    version: 1, name: 'Synthetic saved Word PDF', documentCount: 1, dataKeys: [], origin,
    roles: [{ key: 'first', label: 'Explicit signer', audience: 'each', capacity: 'personal', stage: 0, min: 1, max: 1 }] };
const ordinary = { ...word, templateId: '55555555-5555-4555-8555-555555555555', versionId: '66666666-6666-4666-8666-666666666666',
    name: 'Synthetic ordinary PDF', origin: null };
const preview = { id: origin.previewId, sourceId: origin.sourceId, sourceVersion: 3, pdfHash: origin.pdfHash, clientId: 71, caseId: 41 };
function fakeApi() {
    return { templates: jest.fn().mockResolvedValue({ templates: [word, ordinary], legacy: [] }),
        templateVersion: jest.fn().mockResolvedValue({ version: { id: word.versionId, state: 'published', definition: { origin } } }),
        wordPreviewInfo: jest.fn().mockResolvedValue({ preview }),
        clientContext: jest.fn().mockResolvedValue({ id: 71, name: 'Synthetic pinned client' }),
        caseContext: jest.fn().mockResolvedValue({ id: 41, name: 'Synthetic pinned case', people: [] }), cases: jest.fn(),
        previewCreation: jest.fn().mockResolvedValue({ valid: true, errors: [], errorCount: 0, previewHash: 'synthetic-proof', packageCount: 1,
            documentCount: 1, recipientCount: 1, shared: [], sample: [], template: { versionId: word.versionId, name: word.name,
                documents: [{ key: 'wordFinal', name: 'Synthetic.pdf' }], roles: word.roles } }), create: jest.fn() };
}
async function mount(api, props = {}) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { en: { translation: en } }, lng: 'en', interpolation: { escapeValue: false } });
    const view = render(<I18nextProvider i18n={i18n}><PackageComposer api={api} initialTemplateId={word.versionId}
        onBack={jest.fn()} onCreated={jest.fn()} {...props} /></I18nextProvider>);
    return { ...view, i18n };
}
let originalCrypto;
beforeEach(() => {
    window.history.replaceState(null, '', '/');
    originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const existing = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
        randomUUID: () => '77777777-7777-4777-8777-777777777777',
        ...(existing?.getRandomValues ? { getRandomValues: existing.getRandomValues.bind(existing) } : {}),
    } });
});
afterEach(() => {
    window.history.replaceState(null, '', '/');
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else delete globalThis.crypto;
});
async function checkWithExplicitRecipient(api) {
    const row = screen.getByRole('group', { name: 'Row 1' });
    expect(within(row).getByLabelText('Full name')).toHaveValue('');
    changeField(within(row).getByLabelText('Full name'), { target: { value: 'Synthetic explicit signer' } });
    changeField(within(row).getByLabelText('Email'), { target: { value: 'signer@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.check }));
    await waitFor(() => expect(api.previewCreation).toHaveBeenCalledTimes(1));
}
function recoverable(api, selected, state = 'editing') {
    const id = '88888888-8888-4888-8888-888888888888';
    window.history.replaceState(null, '', '/?draft=' + id);
    api.draft = jest.fn().mockResolvedValue({ id, version: 1, state, updatedAt: '2026-10-26T00:00:00Z',
        result: { submissionId: 'synthetic-already-created', packageCount: 1, documentCount: 1 }, payload: {
            request: { templateVersionId: selected.versionId, name: selected.name },
            editor: { template: selected, name: selected.name, rows: [{ key: 'only', recipients: {
                first: { name: 'Synthetic recovered signer', email: 'restored@example.invalid', phone: '' } } }],
                shared: {}, roleAudience: {}, omitted: [], orderMode: 'parallel', orderRoles: ['first'], orderGroups: [['first']] } } });
    api.saveDraft = jest.fn().mockResolvedValue({ id, version: 2, updatedAt: '2026-10-26T00:00:01Z' }); api.submitDraft = jest.fn();
    return id;
}

test('saved Word selected through the generic catalog recovers locked context and sends the required IDs', async () => {
    const api = fakeApi(); await mount(api);
    await screen.findByText('Synthetic pinned client'); await screen.findByText('Synthetic pinned case');
    expect(screen.queryByRole('button', { name: en.signingV2.compose.clientContext.remove })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.signingV2.compose.context.remove })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(en.signingV2.compose.context.label)).not.toBeInTheDocument();
    await checkWithExplicitRecipient(api);
    expect(api.previewCreation.mock.calls[0][0]).toEqual(expect.objectContaining({ templateVersionId: word.versionId, clientId: 71, caseId: 41 }));
});

test('draft recovery uses the server version origin and restores pinned IDs absent from the old cached editor', async () => {
    const api = fakeApi(), id = '88888888-8888-4888-8888-888888888888';
    window.history.replaceState(null, '', '/?draft=' + id);
    api.draft = jest.fn().mockResolvedValue({ id, version: 1, state: 'editing', updatedAt: '2026-10-26T00:00:00Z', payload: {
        request: { templateVersionId: word.versionId, name: word.name }, editor: { template: { ...word, origin: null }, name: word.name,
            rows: [{ key: 'only', recipients: { first: { name: 'Synthetic restored signer', email: 'restored@example.invalid', phone: '' } } }],
            shared: {}, roleAudience: {}, omitted: [], orderMode: 'parallel', orderRoles: ['first'], orderGroups: [['first']] } } });
    api.saveDraft = jest.fn().mockResolvedValue({ id, version: 2, updatedAt: '2026-10-26T00:00:01Z' }); api.submitDraft = jest.fn();
    await mount(api);
    await screen.findByText('Synthetic pinned client'); await screen.findByDisplayValue('Synthetic restored signer');
    expect(api.templateVersion).toHaveBeenCalledWith(word.versionId);
    expect(screen.queryByRole('button', { name: en.signingV2.compose.clientContext.remove })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.check }));
    await waitFor(() => expect(api.previewCreation).toHaveBeenCalled());
    expect(api.previewCreation.mock.calls[0][0]).toEqual(expect.objectContaining({ clientId: 71, caseId: 41 }));
});

test.each(['hash', 'caller', 'permission'])('%s failure blocks preview, creation and draft autosave', async kind => {
    const api = fakeApi();
    api.draft = jest.fn(); api.saveDraft = jest.fn(); api.submitDraft = jest.fn();
    if (kind === 'hash') api.wordPreviewInfo.mockResolvedValue({ preview: { ...preview, pdfHash: 'b'.repeat(64) } });
    if (kind === 'permission') api.caseContext.mockRejectedValue(Object.assign(new Error('Access unavailable'), { code: 'NOT_FOUND' }));
    await mount(api, kind === 'caller' ? { initialClientId: 99 } : {});
    await screen.findByRole('alert');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)); });
    expect(api.previewCreation).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: en.signingV2.compose.check })).not.toBeInTheDocument();
});

test('a late private-preview response cannot overwrite a later ordinary-template selection', async () => {
    const api = fakeApi(); let finish;
    api.wordPreviewInfo.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount(api);
    await waitFor(() => expect(api.wordPreviewInfo).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.template.chooseAnother }));
    fireEvent.click(await screen.findByRole('button', { name: /Synthetic ordinary PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.next }));
    await act(async () => finish({ preview }));
    expect(screen.queryByText('Synthetic pinned client')).not.toBeInTheDocument();
    await checkWithExplicitRecipient(api);
    expect(api.previewCreation.mock.calls[0][0].templateVersionId).toBe(ordinary.versionId);
    expect(api.previewCreation.mock.calls[0][0].clientId).toBeUndefined();
    expect(api.previewCreation.mock.calls[0][0].caseId).toBeUndefined();
});

test('pending private context cannot autosave or start a send', async () => {
    const api = fakeApi(); let finish;
    api.wordPreviewInfo.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    api.draft = jest.fn(); api.saveDraft = jest.fn(); api.submitDraft = jest.fn();
    await mount(api);
    await waitFor(() => expect(api.wordPreviewInfo).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)); });
    expect(api.saveDraft).not.toHaveBeenCalled(); expect(api.previewCreation).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.template.chooseAnother }));
    await act(async () => finish({ preview }));
    expect(screen.queryByText('Synthetic pinned client')).not.toBeInTheDocument();
});

test('null original associations stay empty and ordinary templates make no Word request', async () => {
    const api = fakeApi(); api.wordPreviewInfo.mockResolvedValue({ preview: { ...preview, clientId: null, caseId: null } });
    const first = await mount(api);
    await screen.findByRole('group', { name: 'Row 1' });
    expect(api.clientContext).not.toHaveBeenCalled(); expect(api.caseContext).not.toHaveBeenCalled();
    first.unmount();
    const generic = fakeApi(); await mount(generic, { initialTemplateId: ordinary.versionId });
    await screen.findByRole('group', { name: 'Row 1' }); expect(generic.wordPreviewInfo).not.toHaveBeenCalled();
});

test.each(['editing', 'submitted'])('a stale %s URL draft cannot replace an explicitly selected new Word PDF', async state => {
    const api = fakeApi(); recoverable(api, ordinary, state);
    await mount(api);
    await screen.findByText(en.signingV2.compose.errors.SELECTED_TEMPLATE_CHANGED);
    expect(screen.queryByDisplayValue('Synthetic recovered signer')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: en.signingV2.compose.done.heading })).not.toBeInTheDocument();
    expect(api.wordPreviewInfo).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.draft.startNew }));
    await screen.findByText('Synthetic pinned client');
    expect(window.location.search).toBe('');
    expect(api.wordPreviewInfo).toHaveBeenCalledWith(origin.previewId);
});

test('a matching explicit head and expected version restores its Word draft', async () => {
    const api = fakeApi(); recoverable(api, word);
    await mount(api, { initialTemplateId: word.templateId, initialTemplateVersion: '1' });
    await screen.findByDisplayValue('Synthetic recovered signer'); await screen.findByText('Synthetic pinned client');
    expect(screen.queryByText(en.signingV2.compose.errors.SELECTED_TEMPLATE_CHANGED)).not.toBeInTheDocument();
});

test('an older version of the same head cannot replace a newer explicit version', async () => {
    const api = fakeApi(); recoverable(api, word);
    const newer = { ...word, versionId: '99999999-9999-4999-8999-999999999999', version: 2 };
    api.templates.mockResolvedValue({ templates: [newer, ordinary], legacy: [] });
    await mount(api, { initialTemplateId: word.templateId, initialTemplateVersion: '2' });
    await screen.findByText(en.signingV2.compose.errors.SELECTED_TEMPLATE_CHANGED);
    expect(api.wordPreviewInfo).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled();
});

test('ordinary draft-first entry keeps generic recovery semantics', async () => {
    const api = fakeApi(); recoverable(api, ordinary);
    api.templateVersion.mockResolvedValue({ version: { id: ordinary.versionId, state: 'published', definition: { origin: null } } });
    await mount(api, { initialTemplateId: undefined });
    await screen.findByDisplayValue('Synthetic recovered signer');
    expect(api.wordPreviewInfo).not.toHaveBeenCalled();
    expect(screen.queryByText(en.signingV2.compose.errors.SELECTED_TEMPLATE_CHANGED)).not.toBeInTheDocument();
});

test('replacement context can retry a failed private read without losing its exact version or explicit IDs', async () => {
    const api = fakeApi();
    api.wordPreviewInfo.mockRejectedValueOnce(Object.assign(new Error('Access temporarily unavailable'), { code: 'NOT_FOUND' }))
        .mockResolvedValue({ preview });
    api.previewReplacement = jest.fn().mockImplementation((_id, body) => api.previewCreation(body.content));
    const replacementContext = { packageId: 'synthetic-package', template: word, reason: 'Synthetic correction',
        content: { templateVersionId: word.versionId, name: word.name, clientId: 71, caseId: 41,
            shared: {}, rows: [{ key: 'only', recipients: { first: { name: 'Synthetic replacement signer', email: 'replacement@example.invalid', phone: '' } } }] } };
    await mount(api, { replacementContext });
    await screen.findByText(en.signingWord.savedContextFailure);
    expect(api.previewReplacement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: en.common.retry }));
    await screen.findByDisplayValue('Synthetic replacement signer');
    expect(screen.queryByText(en.signingWord.savedContextFailure)).not.toBeInTheDocument();
    expect(api.wordPreviewInfo).toHaveBeenCalledTimes(2);
    expect(api.wordPreviewInfo).toHaveBeenNthCalledWith(2, origin.previewId);
    fireEvent.click(screen.getByRole('button', { name: en.signingV2.compose.check }));
    await waitFor(() => expect(api.previewReplacement).toHaveBeenCalledTimes(1));
    expect(api.previewReplacement.mock.calls[0][1].content).toEqual(expect.objectContaining({
        templateVersionId: word.versionId, clientId: 71, caseId: 41 }));
});

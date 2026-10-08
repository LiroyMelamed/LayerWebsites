import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import he from '../../../i18n/locales/he.json';
import en from '../../../i18n/locales/en.json';
import ar from '../../../i18n/locales/ar.json';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import api from '../../../api/signingTemplatesApi';
import packagesApi from '../../../api/signingPackagesApi';
import BatchComposer from './BatchComposer';
import TemplatesWorkspace from './TemplatesWorkspace';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: {
    create: jest.fn(), list: jest.fn(), batches: jest.fn(), batch: jest.fn(), send: jest.fn(), contacts: jest.fn(), archive: jest.fn(), link: jest.fn(), downloadPackage: jest.fn(), completion: jest.fn(),
} }));

jest.mock('../../../api/signingPackagesApi', () => ({ __esModule: true, default: { authoringTemplates: jest.fn(), archiveTemplate: jest.fn() } }));
jest.mock('./NativeTemplateBuilder', () => {
    const React = require('react');
    return function MockNativeTemplateBuilder(props) { return React.createElement('div', { 'data-testid': 'native-builder' }, props.version?.id || 'new-native-template'); };
});

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

test.each(['he','ar','en'])('native library keeps private recovery and exact published send without duplicate imported entries in %s', async lng=>{
    const published={id:'v2',templateId:'native1',version:2,state:'published',canEdit:true,definition:{name:'Published template',documents:[{}],origin:{templateId:'legacy1',version:1}}};
    const draft={...published,id:'draft3',version:3,state:'draft',definition:{...published.definition,name:'Private work'}};
    api.list.mockResolvedValue({templates:[{id:'legacy1',version:1,name:'Legacy duplicate',document_count:1}]});api.batches.mockResolvedValue({batches:[]});
    packagesApi.authoringTemplates.mockResolvedValue({templates:[published,draft]});const send=jest.fn();
    const i18n=await showWorkspace({nativeAvailable:true,onSendTemplate:send},lng),t=key=>i18n.t(`signingV2.workspace.${key}`);
    const library=screen.getByRole('list',{name:i18n.t('signingV2.authoring.library')});
    expect(screen.queryByText('Legacy duplicate')).toBeNull();
    expect(within(library).getAllByRole('button',{name:t('sendFromTemplate')})).toHaveLength(1);
    fireEvent.click(within(library).getByRole('button',{name:t('sendFromTemplate')}));
    expect(send).toHaveBeenCalledWith({id:'native1',versionId:'v2',version:2});
    const draftRow=screen.getAllByRole('listitem').find(row => within(row).queryByText('Private work'));
    fireEvent.click(within(draftRow).getByRole('button',{name:t('edit')}));
    expect(screen.getByTestId('native-builder')).toHaveTextContent('draft3');
});
test('new templates use the native editor when enabled',async()=>{
    api.list.mockResolvedValue({templates:[]});api.batches.mockResolvedValue({batches:[]});packagesApi.authoringTemplates.mockResolvedValue({templates:[]});
    const i18n=await showWorkspace({nativeAvailable:true},'en');
    fireEvent.click(screen.getByRole('button',{name:i18n.t('signingV2.workspace.newTemplate')}));
    expect(screen.getByTestId('native-builder')).toHaveTextContent('new-native-template');
});
test('native read-only library hides creation, editing and send actions',async()=>{
    api.list.mockResolvedValue({templates:[]});api.batches.mockResolvedValue({batches:[]});
    packagesApi.authoringTemplates.mockResolvedValue({templates:[{id:'v1',templateId:'native1',version:1,state:'published',canEdit:false,definition:{name:'Visible only',documents:[{}]}}]});
    const i18n=await showWorkspace({nativeAvailable:true,canUpload:false,canManage:false},'en');
    expect(screen.getByText('Visible only')).toBeVisible();
    for(const key of ['newTemplate','sendFromTemplate','edit'])expect(screen.queryByRole('button',{name:i18n.t(`signingV2.workspace.${key}`)})).toBeNull();
});


test.each(['he', 'ar', 'en'])('archive and restore preserve the selected revision and avoid duplicate legacy choices in %s', async lng => {
    let archived = false;
    const version = { id: 'v1', templateId: 'native1', version: 1, lifecycleVersion: 7, state: 'published', canEdit: true, canArchive: true,
        sourceAvailable: true, definition: { name: 'Reviewed template', documents: [{}], origin: { templateId: 'legacy1', version: 1 } } };
    api.list.mockResolvedValue({ templates: [{ id: 'legacy1', version: 1, name: 'Legacy duplicate', document_count: 1 }] });
    api.batches.mockResolvedValue({ batches: [] });
    packagesApi.authoringTemplates.mockImplementation(options => Promise.resolve({
        templates: options.archived === archived ? [{ ...version, archived, canEdit: !archived }] : [], importedOrigins: [version.definition.origin],
    }));
    packagesApi.archiveTemplate.mockImplementation(async (id, body) => { archived = body.archived; version.lifecycleVersion += 1; return { archived }; });
    const i18n = await showWorkspace({ nativeAvailable: true }, lng), t = key => i18n.t(`signingV2.authoring.${key}`);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.workspace.archive') }));
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveAttribute('dir', lng === 'en' ? 'ltr' : 'rtl');
    expect(within(confirm).getByText(i18n.t('signingV2.authoring.archiveConfirm', { name: 'Reviewed template' }))).toBeVisible();
    expect(within(confirm).getByRole('button', { name: i18n.t('common.cancel') })).toHaveFocus();
    doubleClick(within(confirm).getByRole('button', { name: i18n.t('signingV2.workspace.archive') }));
    await waitFor(() => expect(screen.queryByText('Reviewed template')).toBeNull());
    expect(packagesApi.archiveTemplate).toHaveBeenCalledTimes(1);
    expect(packagesApi.archiveTemplate).toHaveBeenLastCalledWith('native1', { archived: true, expectedVersion: 7 });
    expect(screen.queryByText('Legacy duplicate')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: t('archivedTemplates') }));
    await screen.findByText('Reviewed template');
    expect(screen.getByText(t('archiveHelp'))).toBeVisible();
    expect(screen.queryByRole('button', { name: i18n.t('signingV2.workspace.sendFromTemplate') })).toBeNull();
    expect(screen.queryByRole('button', { name: i18n.t('signingV2.workspace.edit') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('restore') }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: t('restore') }));
    await screen.findByText(t('emptyArchive'));
    expect(packagesApi.archiveTemplate).toHaveBeenLastCalledWith('native1', { archived: false, expectedVersion: 8 });
    fireEvent.click(screen.getByRole('radio', { name: t('activeTemplates') }));
    await screen.findByText('Reviewed template');
    expect(screen.getByRole('button', { name: i18n.t('signingV2.workspace.sendFromTemplate') })).toBeEnabled();
});

test('archive cancellation sends nothing, stale confirmation retains the template and refresh obtains the current version', async () => {
    const version = { id: 'v1', templateId: 't1', lifecycleVersion: 1, version: 1, state: 'published', canArchive: true,
        definition: { name: 'Preserved work', documents: [] } };
    api.list.mockResolvedValue({ templates: [] }); api.batches.mockResolvedValue({ batches: [] });
    packagesApi.authoringTemplates.mockResolvedValue({ templates: [version] });
    packagesApi.archiveTemplate.mockRejectedValueOnce({ code: 'VERSION_CHANGED' });
    const i18n = await showWorkspace({ nativeAvailable: true }, 'en');
    const button = screen.getByRole('button', { name: i18n.t('signingV2.workspace.archive') });
    button.focus(); fireEvent.click(button);
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(button).toHaveFocus();
    expect(packagesApi.archiveTemplate).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: i18n.t('signingV2.workspace.archive') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('signingV2.errors.VERSION_CHANGED'));
    expect(screen.getByText('Preserved work')).toBeVisible();
    packagesApi.authoringTemplates.mockResolvedValue({ templates: [{ ...version, lifecycleVersion: 2 }] });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.refresh') }));
    await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('signingV2.workspace.archive') })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    packagesApi.archiveTemplate.mockResolvedValue({ archived: true });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.workspace.archive') }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: i18n.t('signingV2.workspace.archive') }));
    await waitFor(() => expect(packagesApi.archiveTemplate).toHaveBeenLastCalledWith('t1', { archived: true, expectedVersion: 2 }));
    await waitFor(() => expect(screen.queryByText(i18n.t('signingV2.workspace.loading'))).toBeNull());
});

test('an archived source cannot be restored indirectly and manage does not require upload', async () => {
    api.list.mockResolvedValue({ templates: [] }); api.batches.mockResolvedValue({ batches: [] });
    packagesApi.authoringTemplates.mockImplementation(({ archived }) => Promise.resolve({ templates: archived ? [
        { id: 'v1', templateId: 't1', state: 'published', archived: true, canArchive: true, sourceAvailable: false, definition: { name: 'Archived source', documents: [] } },
        { id: 'v2', templateId: 't2', state: 'published', archived: true, canArchive: true, sourceAvailable: true, definition: { name: 'Restorable', documents: [] } },
    ] : [] }));
    const i18n = await showWorkspace({ nativeAvailable: true, canUpload: false, canManage: true }, 'en');
    fireEvent.click(screen.getByRole('radio', { name: i18n.t('signingV2.authoring.archivedTemplates') }));
    await screen.findByText('Archived source');
    expect(screen.getByText(i18n.t('signingV2.authoring.sourceArchived'))).toBeVisible();
    const row = screen.getAllByRole('listitem').find(item => within(item).queryByText('Archived source'));
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: i18n.t('signingV2.authoring.restore') })).toHaveLength(1);
});

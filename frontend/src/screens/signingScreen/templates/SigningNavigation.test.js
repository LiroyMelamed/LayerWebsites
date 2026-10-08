import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';
import templatesApi from '../../../api/signingTemplatesApi';
import packagesApi from '../../../api/signingPackagesApi';
import TemplatesWorkspace from './TemplatesWorkspace';
import SigningPackagesHub from './SigningPackagesHub';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: {
    list: jest.fn(), batches: jest.fn(), batch: jest.fn(), archive: jest.fn(),
} }));
jest.mock('../../../api/signingPackagesApi', () => ({ __esModule: true, default: { authoringTemplates: jest.fn() } }));
jest.mock('./NativeTemplateBuilder', () => () => null);
jest.mock('./TemplateBuilder', () => () => null);
jest.mock('./BatchComposer', () => () => null);
jest.mock('./PackageComposer', () => () => null);
jest.mock('./SigningPackagesWorkspace', () => () => <div data-testid="current-send-management" />);

beforeEach(() => jest.resetAllMocks());
async function show(node, lng) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ resources: { he: { translation: he }, ar: { translation: ar }, en: { translation: en } }, lng, fallbackLng: false, interpolation: { escapeValue: false } });
    render(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={['/?panel=runs']}>{node}</MemoryRouter></I18nextProvider>);
    return i18n;
}
const version = { id: 'v2', templateId: 't1', version: 2, state: 'published', canEdit: true, definition: { name: 'Lease template', documents: [{}, {}] } };
const oldSend = { id: 'old-1', name: 'Existing send', status: 'ready', created_at: '2026-10-08T08:00:00Z' };

test.each(['he', 'ar', 'en'])('separate template navigation is independent of send-tracking failures in %s', async lng => {
    templatesApi.list.mockResolvedValue({ templates: [] });
    templatesApi.batches.mockRejectedValue(new Error('Tracking unavailable'));
    packagesApi.authoringTemplates.mockResolvedValue({ templates: [version] });
    const send = jest.fn();
    const i18n = await show(<TemplatesWorkspace nativeAvailable canUpload canManage onSendTemplate={send} />, lng);
    await screen.findByText('Lease template');
    expect(screen.getByRole('heading', { level: 1, name: i18n.t('signingManager.templatesAndBulk') })).toBeVisible();
    expect(i18n.t('signingManager.templatesAndBulk')).not.toBe(i18n.t('signingManager.signingRuns'));
    expect(screen.queryByRole('list', { name: i18n.t('signingV2.workspace.batches') })).toBeNull();
    expect(templatesApi.batches).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.workspace.sendFromTemplate') }));
    expect(send).toHaveBeenCalledWith({ id: 't1', versionId: 'v2', version: 2 });
});

test.each(['he', 'ar', 'en'])('send management preserves previous sends without loading template authoring in %s', async lng => {
    templatesApi.batches.mockResolvedValue({ batches: [oldSend] });
    templatesApi.batch.mockResolvedValue({ batch: { ...oldSend, template_version: 1, snapshot: { packages: [], definition: { documents: [], completionMode: 'package' } } }, files: [], recipients: [], canDeliver: false, completion: [] });
    const i18n = await show(<SigningPackagesHub canCreate={false} canManage={false} />, lng);
    expect(screen.getByTestId('current-send-management')).toBeInTheDocument();
    await screen.findByText('Existing send');
    expect(templatesApi.list).not.toHaveBeenCalled();
    expect(packagesApi.authoringTemplates).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: i18n.t('signingV2.workspace.newTemplate') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.workspace.batchDetails') }));
    await screen.findByRole('heading', { name: 'Existing send' });
    expect(templatesApi.batch).toHaveBeenCalledWith('old-1');
    expect(screen.queryByRole('button', { name: i18n.t('signingV2.workspace.checkCompletion') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.workspace.backToRuns') }));
    await screen.findByText('Existing send');
});

test('an empty previous-send history adds no duplicate heading or empty tracker', async () => {
    templatesApi.batches.mockResolvedValue({ batches: [] });
    const i18n = await show(<SigningPackagesHub canCreate={false} />, 'he');
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByText(i18n.t('signingV2.workspace.previousBatches'))).toBeNull();
    expect(screen.queryByText(i18n.t('signingV2.workspace.emptyBatches'))).toBeNull();
    expect(screen.getByTestId('current-send-management')).toBeInTheDocument();
});

test('previous-send lookup failures remain visible and can retry without touching templates', async () => {
    templatesApi.batches.mockRejectedValueOnce({ code: 'FORBIDDEN' }).mockResolvedValueOnce({ batches: [oldSend] });
    const i18n = await show(<SigningPackagesHub canCreate={false} />, 'en');
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('signingV2.errors.FORBIDDEN'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('signingV2.refresh') }));
    await screen.findByText('Existing send');
    expect(templatesApi.list).not.toHaveBeenCalled();
});

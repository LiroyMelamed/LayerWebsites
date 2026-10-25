import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CaseIntegrationUpdates from './CaseIntegrationUpdates';
import { officeIntegrationsApi as api } from '../../../api/officeIntegrationsApi';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';

let mockLanguage = 'he';
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: mockLanguage } }) }));
jest.mock('../../../api/officeIntegrationsApi', () => ({ officeIntegrationsApi: {
    caseUpdates: jest.fn(), importCourtFile: jest.fn(), courtDocument: jest.fn(),
} }));
jest.mock('../../../utils/downloadBlobAsFile', () => ({ downloadBlobAsFile: jest.fn() }));
const tr = key => `officeIntegrations.courtImport.${key}`;
const number = '67104-01-20';
const snapshot = extra => ({ updates: [], group: null, courtImport: {
    enabled: true, canImport: true, courtNumber: number, maxBytes: 5242880, mode: 'owner_file', automaticConnected: false,
}, ...extra });
const receipt = extra => ({ ok: true, imported: true, replayed: false, caseId: 15, courtNumber: number,
    sourceKind: 'owner_file', automaticConnected: false, documentId: '11111111-1111-4111-8111-111111111111', ...extra });
const file = (name = 'court-decision.pdf', type = 'application/pdf') => new File(['%PDF-QA'], name, { type });
const readBytes = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);
});

beforeEach(() => {
    jest.resetAllMocks(); mockLanguage = 'he';
    let sequence = 0;
    Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() =>
        '22222222-2222-4222-8222-' + String(++sequence).padStart(12, '0')) } });
    api.caseUpdates.mockResolvedValue(snapshot());
    api.importCourtFile.mockResolvedValue(receipt());
    downloadBlobAsFile.mockResolvedValue(undefined);
});
async function openImport() {
    fireEvent.click(await screen.findByRole('button', { name: tr('open') }));
    return screen.findByRole('dialog', { name: tr('title') });
}
async function fill(dialog, selected = file()) {
    fireEvent.change(within(dialog).getByLabelText(tr('chooseFile')), { target: { files: [selected] } });
    fireEvent.change(within(dialog).getByLabelText(tr('documentTitle')), { target: { value: 'Public decision' } });
    fireEvent.change(within(dialog).getByLabelText('calendar.dateSegmentDay'), { target: { value: '21' } });
    fireEvent.change(within(dialog).getByLabelText('calendar.dateSegmentMonth'), { target: { value: '10' } });
    fireEvent.change(within(dialog).getByLabelText('calendar.dateSegmentYear'), { target: { value: '2026' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: tr('confirmSource') }));
}

async function submit(dialog) {
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: tr('submit') })); });
}

test('real file provenance is distinct from demo records and has no automatic-connection claim', async () => {
    api.caseUpdates.mockResolvedValue(snapshot({ updates: [
        { id: 'demo', title: 'Synthetic event', is_demo: true, source_kind: 'demo', occurred_at: '2026-10-20T10:00:00Z' },
        { id: 'real', title: '<script>public title</script>', is_demo: false, source_kind: 'owner_file', issued_on: '2026-10-21', document_id: 'document' },
    ] }));
    render(<CaseIntegrationUpdates caseId={15} />);
    expect(await screen.findByText('Synthetic event')).toBeInTheDocument();
    expect(screen.getAllByText('officeIntegrations.demo')).toHaveLength(1);
    expect(screen.getByText(tr('manualSource'))).toBeInTheDocument();
    expect(screen.getByText('<script>public title</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date('2026-10-21')))).toBeInTheDocument();
    expect(screen.queryByText('connected')).not.toBeInTheDocument();
});

test('only explicit server capability with a canonical court mapping offers import', async () => {
    api.caseUpdates.mockResolvedValue(snapshot({ courtImport: { enabled: true, canImport: false, courtNumber: number } }));
    const view = render(<CaseIntegrationUpdates caseId={15} />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: tr('open') })).not.toBeInTheDocument();
    api.caseUpdates.mockResolvedValue(snapshot({ courtImport: { enabled: true, canImport: true, courtNumber: null } }));
    view.rerender(<CaseIntegrationUpdates caseId={16} />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: tr('open') })).not.toBeInTheDocument();
    expect(api.importCourtFile).not.toHaveBeenCalled();
});

test('source confirmation is unchecked and multipart upload binds exact case, mapping and document details', async () => {
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(), selected = file();
    expect(within(dialog).getByRole('checkbox', { name: tr('confirmSource') })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: tr('submit') })).toBeDisabled();
    await fill(dialog, selected);
    await submit(dialog);
    await screen.findByText(tr('imported'));
    const body = api.importCourtFile.mock.calls[0][0];
    expect(body.get('file').name).toBe(selected.name);
    expect(await readBytes(body.get('file'))).toBe(await readBytes(selected));
    expect(Object.fromEntries([...body].filter(([key]) => key !== 'file'))).toEqual({
        caseId: '15', courtNumber: number, title: 'Public decision', issuedOn: '2026-10-21',
        actionId: '22222222-2222-4222-8222-000000000001', sourceConfirmed: 'true',
    });
    expect(api.caseUpdates).toHaveBeenCalledTimes(2);
});

test('an ambiguous failure keeps file and fields and retries the identical source action', async () => {
    api.importCourtFile.mockRejectedValueOnce(Error('timeout'));
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog);
    await submit(dialog);
    await within(dialog).findByText(tr('failed'));
    expect(within(dialog).getByText('court-decision.pdf')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(tr('documentTitle'))).toHaveValue('Public decision');
    await submit(dialog);
    await screen.findByText(tr('imported'));
    const [first, second] = api.importCourtFile.mock.calls.map(([body]) => body);
    for (const key of ['actionId', 'caseId', 'courtNumber', 'issuedOn', 'title']) expect(second.get(key)).toBe(first.get(key));
    expect(second.get('file').name).toBe(first.get('file').name);
    expect(await readBytes(second.get('file'))).toBe(await readBytes(first.get('file')));
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
});

test('editing metadata after a failed attempt creates a fresh explicit action', async () => {
    api.importCourtFile.mockRejectedValueOnce(Error('timeout'));
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog);
    await submit(dialog);
    await within(dialog).findByText(tr('failed'));
    fireEvent.change(within(dialog).getByLabelText(tr('documentTitle')), { target: { value: 'Corrected title' } });
    await submit(dialog);
    await screen.findByText(tr('imported'));
    expect(api.importCourtFile.mock.calls[1][0].get('actionId')).not.toBe(api.importCourtFile.mock.calls[0][0].get('actionId'));
    expect(api.importCourtFile.mock.calls[1][0].get('title')).toBe('Corrected title');
});

test('double submission is blocked while one import is pending', async () => {
    let finish;
    api.importCourtFile.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog);
    const button = within(dialog).getByRole('button', { name: tr('submit') });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.importCourtFile).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'common.cancel' })).toBeDisabled();
    await act(async () => { finish(receipt()); });
    await screen.findByText(tr('imported'));
});

test('non-PDF and oversized files are rejected before a network request', async () => {
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(), input = within(dialog).getByLabelText(tr('chooseFile'));
    fireEvent.change(input, { target: { files: [file('payload.html', 'text/html')] } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(tr('invalidPdf'));
    const oversized = file(); Object.defineProperty(oversized, 'size', { value: 5242881 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(tr('fileTooLarge'));
    expect(api.importCourtFile).not.toHaveBeenCalled();
});

test('mapping conflict is localized without losing the chosen file or leaking server details', async () => {
    api.importCourtFile.mockRejectedValue(Object.assign(Error('private database detail'), { code: 'COURT_REFERENCE_CHANGED', status: 409 }));
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog);
    await submit(dialog);
    await within(dialog).findByText(tr('referenceChanged'));
    expect(screen.queryByText('private database detail')).not.toBeInTheDocument();
    expect(within(dialog).getByText('court-decision.pdf')).toBeInTheDocument();
});

test('malformed acceptance is not presented as an imported document', async () => {
    api.importCourtFile.mockResolvedValue({ ok: true });
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog);
    await submit(dialog);
    await within(dialog).findByText(tr('failed'));
    expect(screen.queryByText(tr('imported'))).not.toBeInTheDocument();
    expect(api.caseUpdates).toHaveBeenCalledTimes(1);
});

test('case changes hide stale rows and ignore late responses from the previous case', async () => {
    let old;
    api.caseUpdates.mockImplementation(id => id === 15 ? new Promise(resolve => { old = resolve; }) : Promise.resolve(snapshot({ updates: [{ id: 16, title: 'Current case only', is_demo: true }] })));
    const view = render(<CaseIntegrationUpdates caseId={15} />);
    view.rerender(<CaseIntegrationUpdates caseId={16} />);
    await screen.findByText('Current case only');
    await act(async () => { old(snapshot({ updates: [{ id: 15, title: 'Foreign stale title', is_demo: true }] })); });
    expect(screen.queryByText('Foreign stale title')).not.toBeInTheDocument();
    expect(screen.getByText('Current case only')).toBeInTheDocument();
});

test('protected original download uses the authenticated API and existing native file bridge', async () => {
    const original = new Blob(['original court bytes'], { type: 'application/pdf' });
    api.caseUpdates.mockResolvedValue(snapshot({ updates: [{ id: 'real', title: 'Public decision', source_kind: 'owner_file', is_demo: false,
        document_id: 'doc-id', source_filename: 'original.pdf', documentUrl: 'javascript:untrusted' }] }));
    api.courtDocument.mockResolvedValue(original);
    render(<CaseIntegrationUpdates caseId={15} />);
    fireEvent.click(await screen.findByRole('button', { name: `${tr('downloadNamed')} Public decision` }));
    await waitFor(() => expect(downloadBlobAsFile).toHaveBeenCalledWith(original, 'original.pdf'));
    expect(api.courtDocument).toHaveBeenCalledWith(15, 'doc-id');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('a refresh failure after successful import does not suggest another upload', async () => {
    api.caseUpdates.mockResolvedValueOnce(snapshot()).mockRejectedValue(Error('offline'));
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog);
    await submit(dialog);
    await screen.findByText(tr('imported'));
    await screen.findByText('officeIntegrations.caseLoadFailed');
    expect(api.importCourtFile).toHaveBeenCalledTimes(1);
    api.caseUpdates.mockResolvedValue(snapshot());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.retry' })); });
    await waitFor(() => expect(screen.queryByText('officeIntegrations.caseLoadFailed')).not.toBeInTheDocument());
    expect(api.importCourtFile).toHaveBeenCalledTimes(1);
});

test('a permission failure on refresh clears cached case records and import capability', async () => {
    api.caseUpdates.mockResolvedValueOnce(snapshot({ updates: [{ id: 'old', title: 'Previously authorized document', is_demo: false }] }))
        .mockRejectedValue(Object.assign(Error('access changed'), { status: 403 }));
    render(<CaseIntegrationUpdates caseId={15} />);
    const dialog = await openImport(); await fill(dialog); await submit(dialog);
    await screen.findByText('officeIntegrations.caseLoadFailed');
    expect(screen.queryByText('Previously authorized document')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: tr('open') })).not.toBeInTheDocument();
});

test('a non-PDF response is not downloaded as a court document', async () => {
    api.caseUpdates.mockResolvedValue(snapshot({ updates: [{ id: 'real', title: 'Public decision', source_kind: 'owner_file',
        is_demo: false, document_id: 'doc-id', source_filename: 'original.pdf' }] }));
    api.courtDocument.mockResolvedValue(new Blob(['proxy error'], { type: 'text/html' }));
    render(<CaseIntegrationUpdates caseId={15} />);
    fireEvent.click(await screen.findByRole('button', { name: `${tr('downloadNamed')} Public decision` }));
    await screen.findByText(tr('downloadFailed'));
    expect(downloadBlobAsFile).not.toHaveBeenCalled();
});

test.each(['ar', 'en'])('%s uses the platform direction for the case list and import dialog', async language => {
    mockLanguage = language;
    render(<CaseIntegrationUpdates caseId={15} />);
    const button = await screen.findByRole('button', { name: tr('open') });
    expect(button.closest('section')).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    const dialog = await openImport();
    expect(dialog).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    expect(within(dialog).getByText(number)).toHaveAttribute('dir', 'ltr');
});

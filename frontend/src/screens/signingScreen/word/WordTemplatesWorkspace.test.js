import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordTemplatesWorkspace from './WordTemplatesWorkspace';
import api from '../../../api/wordTemplatesApi';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';
let mockPdfReadyCallbacks = [];

jest.mock('../../../api/wordTemplatesApi', () => ({ __esModule: true, default: { list: jest.fn(), create: jest.fn(), load: jest.fn(), save: jest.fn(), preview: jest.fn(), pdf: jest.fn() } }));
jest.mock('../../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn() }));
jest.mock('../templates/useSigningLocale', () => () => ({ direction: 'rtl', number: String, t: (key, values = {}) => key.replace(/^signingWord\./, '') + (values.role ? ` ${values.role}` : '') + (values.field ? ` ${values.field}` : '') }));
jest.mock('../templates/SigningBackButton', () => ({ onPress, children }) => <button onClick={onPress}>{children}</button>);
jest.mock('../templates/SigningSelect', () => ({ children, onChange, value, disabled }) => <select value={value} disabled={disabled} onChange={onChange}>{children}</select>);
jest.mock('./WordRecordPicker', () => ({ label, value, onChange, disabled }) => <label>{label}<input value={value?.id || ''} disabled={disabled} onChange={event => onChange(event.target.value ? { id: event.target.value, label: `Selected ${event.target.value}` } : null)} /></label>);
jest.mock('../../../components/simpleComponents/SimpleInput', () => ({ title, value, onChange, disabled, type = 'text', ...props }) => <label>{title}<input aria-label={props['aria-label'] || title} type={type} value={value} disabled={disabled} onChange={onChange} /></label>);
jest.mock('../../../components/styledComponents/fileUpload/FileUploadBox', () => ({ label, onFileSelected, disabled }) => <label>{label}<input type="file" disabled={disabled} onChange={event => onFileSelected(event.target.files[0])} /></label>);
jest.mock('../../../components/styledComponents/buttons/PrimaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../../components/styledComponents/buttons/SecondaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../../components/styledComponents/buttons/TertiaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../../components/specializedComponents/text/AllTextKindFile', () => ({ Text14: ({ children }) => <span>{children}</span>, TextBold18: ({ children }) => <span>{children}</span>, TextBold24: ({ children }) => <span>{children}</span> }));
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => ({ onDocumentReady, pdfSource, spots, signers }) => {
    mockPdfReadyCallbacks.push(onDocumentReady);
    return <div data-testid="final-pdf" data-url={pdfSource} data-spots={spots.length} data-signers={signers.length}><button onClick={() => onDocumentReady(true)}>pdf-loaded</button></div>;
});
jest.mock('../../../components/ui/StatusNotice', () => ({ children }) => <div role="alert">{children}</div>);
jest.mock('../../../components/simpleComponents/SimplePopUp', () => ({ children }) => <div role="dialog">{children}</div>);
jest.mock('../../../components/styledComponents/popups/ConfirmationDialog', () => ({ title, onConfirm, onCancel, confirmText, cancelText }) => <div>{title}<button onClick={onConfirm}>{confirmText}</button><button onClick={onCancel}>{cancelText}</button></div>);

const source = () => ({ id: 'source-a', name: 'Rental original', version: 3, sourceHash: 'source-sha', bindingsHash: 'bindings-sha', roles: [], bindings: [],
    model: { parts: [{ name: 'word/document.xml', paragraphs: [{ id: 'p0', text: 'Tenant ______ <script>alert(1)</script>', editable: true, blanks: [{ start: 7, end: 13 }], selectionRanges: [{ start: 0, end: 39 }] }, { id: 'p1', text: 'Unsupported text', editable: false, blanks: [] }] }] } });
const binding = (field, id = field) => ({ id, part: 'word/document.xml', paragraphId: 'p0', start: 7, end: 13, field, required: true });
const mapped = () => ({ ...source(), bindings: [binding('client.identityNumber')] });
async function open(saved = source(), props = {}, manage = false) {
    api.list.mockResolvedValue({ sources: [saved], converterAvailable: true }); api.load.mockResolvedValue({ source: saved });
    const result = render(<WordTemplatesWorkspace onBack={jest.fn()} onContinue={jest.fn()} {...props} />);
    await waitFor(() => expect(screen.getByRole('option', { name: saved.name })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('library'), { target: { value: saved.id } });
    await waitFor(() => expect(screen.getByLabelText('clientId')).toBeInTheDocument());
    if (manage) fireEvent.click(screen.getByText('manageTemplates'));
    return result;
}
const context = (client = 22, caseId = 31) => ({ clientRecord: { id: client, label: `Client ${client}` }, caseRecord: { id: caseId, label: `Case ${caseId}` } });
beforeEach(() => {
    jest.clearAllMocks(); api.list.mockResolvedValue({ sources: [], converterAvailable: true });
    mockPdfReadyCallbacks = [];
    URL.createObjectURL = jest.fn(() => 'blob:final-only'); URL.revokeObjectURL = jest.fn();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => 'b37c6948-af82-4af0-9e66-46c88180d511') } });
    api.preview.mockResolvedValue({ preview: { id: 'preview-a', name: 'Filled', requiresFreshSigningGeometry: true } });
    api.pdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
});
afterEach(() => jest.restoreAllMocks());

test('defaults to using saved templates and selection performs no writes; only bound roles are requested', async () => {
    const saved = { ...mapped(), roles: [{ key: 'landlord', label: 'Landlord' }, { key: 'unused', label: 'Unused' }], bindings: [binding('role.landlord.fullName')] };
    await open(saved);
    expect(screen.getByText('useIntro')).toBeInTheDocument();
    expect(screen.queryByLabelText('upload')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('name')).not.toBeInTheDocument();
    expect(screen.queryByText('mapping')).not.toBeInTheDocument();
    expect(screen.getByLabelText('roleClientId Landlord')).toBeInTheDocument();
    expect(screen.queryByLabelText('roleClientId Unused')).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled(); expect(api.preview).not.toHaveBeenCalled(); expect(uploadFileToR2).not.toHaveBeenCalled();
});

test('explicit manage mode imports DOCX, safely maps a blank and saves version without client data', async () => {
    render(<WordTemplatesWorkspace onBack={jest.fn()} />); fireEvent.click(screen.getByText('manageTemplates'));
    fireEvent.change(screen.getByLabelText('upload'), { target: { files: [new File(['x'], 'bad.pdf')] } });
    expect(screen.getByText('fileInvalid')).toBeInTheDocument(); expect(uploadFileToR2).not.toHaveBeenCalled();
    uploadFileToR2.mockResolvedValue({ success: true, data: { key: 'private/original.docx' } }); api.create.mockResolvedValue({ source: source() });
    fireEvent.change(screen.getByLabelText('upload'), { target: { files: [new File(['docx'], 'Rental.docx')] } }); fireEvent.click(screen.getByText('import'));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ fileKey: 'private/original.docx', name: 'Rental', roles: [] }));
    await waitFor(() => expect(screen.getByText('Tenant ______ <script>alert(1)</script>')).toBeInTheDocument()); expect(document.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByText('chooseBlank')); fireEvent.click(screen.getByText('bind'));
    api.save.mockImplementation((id, payload) => Promise.resolve({ source: { ...source(), ...payload, id, version: 4 } })); fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(api.save).toHaveBeenCalled()); const [id, payload] = api.save.mock.calls[0];
    expect(id).toBe('source-a'); expect(payload.expectedVersion).toBe(3); expect(payload.sourceHash).toBe('source-sha');
    expect(payload.bindings).toEqual([expect.objectContaining({ start: 7, end: 13, field: 'client.fullName', required: true })]);
    expect(payload).not.toHaveProperty('inputs'); expect(payload).not.toHaveProperty('pdf');
    expect(screen.getByText('advancedMapping')).toBeInTheDocument();
});

test('preview sends explicit string overrides and references; final PDF load and review are both required', async () => {
    const onContinue = jest.fn(); await open(mapped(), { onContinue });
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '23' } });
    fireEvent.click(screen.getByText('overrideValues')); fireEvent.click(screen.getByLabelText(/manualField/));
    fireEvent.change(screen.getByLabelText('fieldLabel fields.identityNumber'), { target: { value: '001234567' } });
    fireEvent.click(screen.getByText('preview')); fireEvent.click(screen.getByText('preview'));
    await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument());
    expect(api.preview).toHaveBeenCalledTimes(1); expect(api.preview).toHaveBeenCalledWith('source-a', { expectedVersion: 3, bindingsHash: 'bindings-sha', inputs: { clientId: 23, roleClientIds: {}, manualValues: { 'client.identityNumber': '001234567' } } }, expect.any(String));
    expect(screen.getByTestId('final-pdf')).toHaveAttribute('data-spots', '0'); expect(screen.getByTestId('final-pdf')).toHaveAttribute('data-signers', '0');
    expect(screen.getByText('continue')).toBeDisabled(); fireEvent.click(screen.getByText('pdf-loaded')); expect(screen.getByText('continue')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('previewAcknowledgement')); fireEvent.click(screen.getByText('continue'));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ id: 'preview-a', fileBlob: expect.any(Blob), requiresFreshSigningGeometry: true }));
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '24' } });
    expect(screen.queryByTestId('final-pdf')).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:final-only');
});

test('conflict preserves edits and switching out of manage confirms or discards unsaved template changes', async () => {
    const onDraftChange = jest.fn(); await open(source(), { onDraftChange }, true);
    fireEvent.click(screen.getByText('chooseBlank')); fireEvent.click(screen.getByText('bind'));
    api.save.mockRejectedValue({ status: 409 }); fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(screen.getByText('conflict')).toBeInTheDocument()); expect(screen.getByText('removeBinding')).toBeInTheDocument();
    fireEvent.click(screen.getByText('useTemplates')); expect(screen.getByRole('dialog')).toBeInTheDocument(); fireEvent.click(screen.getByText('keepEditing'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByText('removeBinding')).toBeInTheDocument();
    fireEvent.click(screen.getByText('useTemplates')); fireEvent.click(screen.getByText('discard'));
    await waitFor(() => expect(screen.getByText('useIntro')).toBeInTheDocument());
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: false, bindings: [], mode: 'use' }));
    expect(api.save).toHaveBeenCalledTimes(1);
});

test('late preview response after unmount cannot create a URL or continue', async () => {
    const result = await open(mapped(), { initialContext: context() }); let complete; api.preview.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    fireEvent.click(screen.getByText('preview')); result.unmount(); await act(async () => { complete({ preview: { id: 'late' } }); });
    expect(api.pdf).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('overlapping mappings remain rejected and invalid record references cannot produce a preview', async () => {
    await open(mapped(), {}, true); fireEvent.click(screen.getByText('chooseBlank')); fireEvent.click(screen.getByText('bind'));
    expect(screen.getByText('selectionOverlap')).toBeInTheDocument(); fireEvent.click(screen.getByText('useTemplates'));
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '1.5' } }); expect(screen.getByText('preview')).toBeDisabled(); expect(api.preview).not.toHaveBeenCalled();
});

test('context seeds once, user choices survive equal context rerenders, explicit context changes invalidate preview', async () => {
    const props = { onBack: jest.fn(), onContinue: jest.fn(), onDraftChange: jest.fn(), initialContext: context() };
    const result = await open(mapped(), props); expect(screen.getByLabelText('clientId')).toHaveValue('22'); expect(screen.getByLabelText('caseId')).toHaveValue('31');
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '23' } });
    result.rerender(<WordTemplatesWorkspace {...props} initialContext={context()} />); expect(screen.getByLabelText('clientId')).toHaveValue('23');
    fireEvent.click(screen.getByText('preview')); await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument());
    result.rerender(<WordTemplatesWorkspace {...props} initialContext={context(24, 32)} />);
    await waitFor(() => expect(screen.getByLabelText('clientId')).toHaveValue('24')); expect(screen.getByLabelText('caseId')).toHaveValue('32'); expect(screen.queryByTestId('final-pdf')).not.toBeInTheDocument();
    const draft = props.onDraftChange.mock.calls.at(-1)[0]; expect(draft.inputs.clientRecord).toEqual({ id: 24, label: 'Client 24' }); expect(draft).not.toHaveProperty('preview'); expect(draft).not.toHaveProperty('fileBlob'); expect(draft).not.toHaveProperty('url');
});

test('ephemeral resume preserves chosen context and manual values without restoring a previous preview', async () => {
    const saved = mapped(); const onDraftChange = jest.fn();
    const resumeDraft = { source: saved, name: saved.name, roles: [], bindings: saved.bindings, inputs: { clientId: '23', clientRecord: { id: 23, label: 'Chosen client' }, caseId: '', caseRecord: null, roleClientIds: {}, roleRecords: {}, manualValues: { 'client.identityNumber': '000031' } }, dirty: false, mode: 'use' };
    render(<WordTemplatesWorkspace initialContext={context()} resumeDraft={resumeDraft} onDraftChange={onDraftChange} onContinue={jest.fn()} />);
    expect(screen.getByLabelText('clientId')).toHaveValue('23'); expect(screen.getByLabelText('caseId')).toHaveValue(''); expect(screen.queryByTestId('final-pdf')).not.toBeInTheDocument();
    expect(api.load).not.toHaveBeenCalled(); expect(api.preview).not.toHaveBeenCalled();
    // A resumed draft still waits for the server's current converter availability.
    await waitFor(() => expect(screen.getByRole('button', { name: 'preview' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument()); expect(api.preview.mock.calls[0][1].inputs.manualValues).toEqual({ 'client.identityNumber': '000031' });
    expect(onDraftChange.mock.calls.at(-1)[0]).not.toHaveProperty('preview');
});

test('known unresolved required fields use document-only inputs; selected records never invent stored values', async () => {
    const saved = { ...source(), roles: [{ key: 'lawyer', label: 'Lawyer' }, { key: 'unused', label: 'Unused' }], bindings: ['office.name', 'case.amount', 'role.lawyer.capacity', 'client.fullName', 'case.title'].map(value => binding(value)) };
    await open(saved, { initialContext: context() });
    expect(screen.getByLabelText('fieldLabel fields.name')).toHaveValue(''); expect(screen.getByLabelText('fieldLabel fields.amount')).toHaveValue(''); expect(screen.getByLabelText('roleField Lawyer fields.capacity')).toHaveValue('');
    expect(screen.queryByLabelText('fieldLabel fields.fullName')).not.toBeInTheDocument(); expect(screen.getByText('preview')).toBeDisabled();
    for (const label of ['fieldLabel fields.name', 'fieldLabel fields.amount', 'roleField Lawyer fields.capacity']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'Document only' } });
    expect(screen.getByText('preview')).toBeEnabled(); fireEvent.click(screen.getByText('preview')); await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(api.preview.mock.calls[0][1].inputs).toEqual({ clientId: 22, caseId: 31, roleClientIds: {}, manualValues: { 'office.name': 'Document only', 'case.amount': 'Document only', 'role.lawyer.capacity': 'Document only' } });
    expect(api.create).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
});

test('readable view opens the loaded PDF in a protected native tab with separate cleanup and no review bypass', async () => {
    const onContinue = jest.fn(); const opened = jest.spyOn(window, 'open').mockReturnValue(null);
    URL.createObjectURL.mockReturnValueOnce('blob:inline-review').mockReturnValueOnce('blob:readable-review');
    await open(mapped(), { initialContext: context(), onContinue });
    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument());
    const readableButton = screen.getByRole('button', { name: 'openReadablePreview' });
    expect(readableButton).toBeDisabled(); fireEvent.click(readableButton); expect(opened).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('pdf-loaded')); expect(readableButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'continue' })).toBeDisabled();
    let cleanup; const nativeTimeout = window.setTimeout.bind(window);
    jest.spyOn(window, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay === 60_000) { cleanup = callback; return 0; }
        return nativeTimeout(callback, delay, ...args);
    });
    fireEvent.click(readableButton);
    expect(opened).toHaveBeenCalledWith('blob:readable-review', '_blank', 'noopener,noreferrer');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL.mock.calls[1][0]).toBe(URL.createObjectURL.mock.calls[0][0]);
    expect(api.preview).toHaveBeenCalledTimes(1); expect(api.pdf).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('final-pdf')).toHaveAttribute('data-url', 'blob:inline-review');
    expect(screen.getByLabelText('clientId')).toHaveValue('22'); expect(screen.getByLabelText('caseId')).toHaveValue('31');
    expect(screen.getByLabelText('previewAcknowledgement')).not.toBeChecked(); expect(screen.getByRole('button', { name: 'continue' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('previewAcknowledgement'));
    expect(typeof cleanup).toBe('function'); cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:readable-review'); expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:inline-review');
    expect(screen.getByLabelText('previewAcknowledgement')).toBeChecked(); expect(screen.getByRole('button', { name: 'continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'continue' }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ id: 'preview-a', url: 'blob:inline-review', fileBlob: URL.createObjectURL.mock.calls[0][0] }));
    expect(api.create).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
});

test('readable action disappears on input/context changes and stale PDF-ready callbacks cannot unlock a new review', async () => {
    const opened = jest.spyOn(window, 'open').mockReturnValue(null); const props = { initialContext: context(), onContinue: jest.fn() };
    const view = await open(mapped(), props); fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument()); const oldReady = mockPdfReadyCallbacks.at(-1);
    fireEvent.click(screen.getByText('pdf-loaded')); fireEvent.click(screen.getByLabelText('previewAcknowledgement'));
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '24' } });
    expect(screen.queryByRole('button', { name: 'openReadablePreview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'preview' })); await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument());
    await act(async () => oldReady(true));
    expect(screen.getByRole('button', { name: 'openReadablePreview' })).toBeDisabled();
    expect(screen.getByLabelText('previewAcknowledgement')).not.toBeChecked(); expect(screen.getByRole('button', { name: 'continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'openReadablePreview' })); expect(opened).not.toHaveBeenCalled();
    view.rerender(<WordTemplatesWorkspace {...props} initialContext={context(25, 32)} />);
    expect(screen.queryByRole('button', { name: 'openReadablePreview' })).not.toBeInTheDocument();
    expect(props.onContinue).not.toHaveBeenCalled();
});

test('native reading-view failure releases only its URL and preserves the inline review', async () => {
    jest.spyOn(window, 'open').mockImplementation(() => { throw new Error('Native view unavailable'); });
    URL.createObjectURL.mockReturnValueOnce('blob:inline-review').mockReturnValueOnce('blob:failed-reading-view');
    await open(mapped(), { initialContext: context() }); fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument()); fireEvent.click(screen.getByText('pdf-loaded'));
    fireEvent.click(screen.getByRole('button', { name: 'openReadablePreview' }));
    expect(screen.getByText('readablePreviewFailed')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:failed-reading-view'); expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:inline-review');
    expect(screen.getByTestId('final-pdf')).toHaveAttribute('data-url', 'blob:inline-review');
    expect(screen.getByLabelText('previewAcknowledgement')).not.toBeChecked(); expect(screen.getByRole('button', { name: 'continue' })).toBeDisabled();
    expect(api.preview).toHaveBeenCalledTimes(1); expect(api.pdf).toHaveBeenCalledTimes(1);
});

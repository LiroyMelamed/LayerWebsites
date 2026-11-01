import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordTemplatesWorkspace from './WordTemplatesWorkspace';
import TemplatesWorkspace from '../templates/TemplatesWorkspace';
import api from '../../../api/wordTemplatesApi';
import templateApi from '../../../api/signingTemplatesApi';
import packagesApi from '../../../api/signingPackagesApi';
import { uploadFileToR2 } from '../../../utils/fileUploadUtils';

jest.mock('../../../api/wordTemplatesApi', () => ({ __esModule: true, default: { list: jest.fn(), create: jest.fn(), load: jest.fn(), save: jest.fn(), preview: jest.fn(), pdf: jest.fn() } }));
jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: { list: jest.fn(), batches: jest.fn() } }));
jest.mock('../../../api/signingPackagesApi', () => ({ __esModule: true, default: { authoringTemplates: jest.fn() } }));
jest.mock('../../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn() }));
jest.mock('../templates/useSigningLocale', () => () => ({ direction: 'rtl', number: String, date: String, errorMessage: () => 'error', t: (key, values = {}) => key.replace(/^signingWord\./, '') + (values.field ? ` ${values.field}` : '') }));
jest.mock('../templates/SigningBackButton', () => ({ onPress, children }) => <button onClick={onPress}>{children}</button>);
jest.mock('../templates/SigningSelect', () => ({ children, onChange, value, disabled }) => <select value={value} disabled={disabled} onChange={onChange}>{children}</select>);
jest.mock('./WordRecordPicker', () => ({ label, value, onChange, disabled }) => <label>{label}<input value={value?.id || ''} disabled={disabled} onChange={event => onChange(event.target.value ? { id: event.target.value, label: 'Selected person' } : null)} /></label>);
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => ({ onDocumentReady, pdfSource }) => <div data-testid="final-pdf" data-url={pdfSource}><button onClick={() => onDocumentReady(true)}>pdf-loaded</button></div>);
jest.mock('../../../components/ui/StatusNotice', () => ({ children }) => <div role="alert">{children}</div>);
jest.mock('../../../components/simpleComponents/SimplePopUp', () => ({ children }) => <div role="dialog">{children}</div>);
jest.mock('../../../components/styledComponents/popups/ConfirmationDialog', () => ({ title, onConfirm, onCancel, confirmText, cancelText }) => <div>{title}<button onClick={onConfirm}>{confirmText}</button><button onClick={onCancel}>{cancelText}</button></div>);
jest.mock('../templates/TemplateBuilder', () => () => null);
jest.mock('../templates/NativeTemplateBuilder', () => () => null);
jest.mock('../templates/BatchComposer', () => () => null);
jest.mock('../templates/TemplateArchiveConfirmation', () => () => null);
jest.mock('../../../components/styledComponents/SegmentedSwitch', () => () => null);

const source = () => ({ id: 'source-a', name: 'Rental original', version: 3, sourceHash: 'source-sha', bindingsHash: 'bindings-sha', roles: [], bindings: [],
    model: { parts: [{ name: 'word/document.xml', paragraphs: [{ id: 'p0', text: 'Tenant ______ <script>alert(1)</script>', editable: true, blanks: [{ start: 7, end: 13 }], selectionRanges: [{ start: 0, end: 39 }] }, { id: 'p1', text: 'Unsupported text', editable: false, blanks: [] }] }] } });
const mapped = () => ({ ...source(), bindings: [{ id: 'b1', part: 'word/document.xml', paragraphId: 'p0', start: 7, end: 13, field: 'client.identityNumber', required: true }] });
async function open(saved = source()) {
    api.list.mockResolvedValue({ sources: [saved], converterAvailable: true }); api.load.mockResolvedValue({ source: saved });
    const result = render(<WordTemplatesWorkspace onBack={jest.fn()} onContinue={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: saved.name })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('library'), { target: { value: saved.id } });
    await waitFor(() => expect(screen.getByLabelText('name')).toHaveValue(saved.name));
    return result;
}
beforeEach(() => {
    jest.clearAllMocks(); api.list.mockResolvedValue({ sources: [], converterAvailable: true });
    URL.createObjectURL = jest.fn(() => 'blob:final-only'); URL.revokeObjectURL = jest.fn();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => 'b37c6948-af82-4af0-9e66-46c88180d511') } });
    templateApi.list.mockResolvedValue({ templates: [] }); templateApi.batches.mockResolvedValue({ batches: [] }); packagesApi.authoringTemplates.mockResolvedValue({ templates: [] });
});

test('imports only a DOCX source, renders text safely, maps a blank and saves source/version without client data', async () => {
    render(<WordTemplatesWorkspace onBack={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('upload'), { target: { files: [new File(['x'], 'bad.pdf')] } });
    expect(screen.getByText('fileInvalid')).toBeInTheDocument(); expect(uploadFileToR2).not.toHaveBeenCalled();
    uploadFileToR2.mockResolvedValue({ success: true, data: { key: 'private/original.docx' } }); api.create.mockResolvedValue({ source: source() });
    fireEvent.change(screen.getByLabelText('upload'), { target: { files: [new File(['docx'], 'Rental.docx')] } });
    fireEvent.click(screen.getByText('import'));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ fileKey: 'private/original.docx', name: 'Rental', roles: [] }));
    await waitFor(() => expect(screen.getByText('Tenant ______ <script>alert(1)</script>')).toBeInTheDocument());
    expect(document.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByText('chooseBlank')); fireEvent.click(screen.getByText('bind'));
    api.save.mockImplementation((id, payload) => Promise.resolve({ source: { ...source(), ...payload, id, version: 4 } }));
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const [id, payload] = api.save.mock.calls[0];
    expect(id).toBe('source-a'); expect(payload.expectedVersion).toBe(3); expect(payload.sourceHash).toBe('source-sha');
    expect(payload.bindings).toEqual([expect.objectContaining({ start: 7, end: 13, field: 'client.fullName', required: true })]);
    expect(payload).not.toHaveProperty('inputs'); expect(payload).not.toHaveProperty('pdf');
});

test('preview passes explicit string overrides and references, then requires loaded final PDF and acknowledgement', async () => {
    const saved = mapped(); api.list.mockResolvedValue({ sources: [saved], converterAvailable: true }); api.load.mockResolvedValue({ source: saved });
    const onContinue = jest.fn(); render(<WordTemplatesWorkspace onBack={jest.fn()} onContinue={onContinue} />);
    await waitFor(() => expect(screen.getByRole('option', { name: saved.name })).toBeInTheDocument()); fireEvent.change(screen.getByLabelText('library'), { target: { value: saved.id } });
    await waitFor(() => expect(screen.getByLabelText('clientId')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '23' } });
    fireEvent.click(screen.getByLabelText(/manualField/));
    fireEvent.change(screen.getByLabelText('fieldLabel fields.identityNumber'), { target: { value: '001234567' } });
    api.preview.mockResolvedValue({ preview: { id: 'preview-a', name: 'Filled', requiresFreshSigningGeometry: true } }); const blob = new Blob(['pdf'], { type: 'application/pdf' }); api.pdf.mockResolvedValue(blob);
    fireEvent.click(screen.getByText('preview')); fireEvent.click(screen.getByText('preview'));
    await waitFor(() => expect(screen.getByTestId('final-pdf')).toBeInTheDocument());
    expect(api.preview).toHaveBeenCalledTimes(1); expect(api.preview).toHaveBeenCalledWith('source-a', { expectedVersion: 3, bindingsHash: 'bindings-sha', inputs: { clientId: 23, roleClientIds: {}, manualValues: { 'client.identityNumber': '001234567' } } }, expect.any(String));
    expect(screen.getByText('continue')).toBeDisabled(); fireEvent.click(screen.getByText('pdf-loaded')); expect(screen.getByText('continue')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('previewAcknowledgement')); fireEvent.click(screen.getByText('continue'));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ id: 'preview-a', fileBlob: blob, requiresFreshSigningGeometry: true }));
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '24' } });
    expect(screen.queryByTestId('final-pdf')).not.toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:final-only');
});

test('conflict preserves local mappings and dirty exit uses platform confirmation', async () => {
    await open(); fireEvent.click(screen.getByText('chooseBlank')); fireEvent.click(screen.getByText('bind'));
    api.save.mockRejectedValue({ status: 409 }); fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(screen.getByText('conflict')).toBeInTheDocument()); expect(screen.getByText('removeBinding')).toBeInTheDocument();
    fireEvent.click(screen.getByText('back')); expect(screen.getByRole('dialog')).toBeInTheDocument(); fireEvent.click(screen.getByText('keepEditing'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByText('preview')).toBeDisabled();
});

test('late preview response after unmount cannot create a URL or continue', async () => {
    const result = await open(mapped()); let complete; api.preview.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    fireEvent.click(screen.getByText('preview')); result.unmount();
    await act(async () => { complete({ preview: { id: 'late' } }); });
    expect(api.pdf).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('overlapping mappings and invalid references cannot produce a new preview', async () => {
    await open(mapped()); fireEvent.click(screen.getByText('chooseBlank')); fireEvent.click(screen.getByText('bind'));
    expect(screen.getByText('selectionOverlap')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: '1.5' } }); expect(screen.getByText('preview')).toBeDisabled(); expect(api.preview).not.toHaveBeenCalled();
});

test('entry is shown only with native authoring and upload permission', async () => {
    const result = render(<TemplatesWorkspace nativeAvailable canUpload={false} />);
    await waitFor(() => expect(templateApi.list).toHaveBeenCalled()); expect(screen.queryByText('open')).not.toBeInTheDocument();
    result.rerender(<TemplatesWorkspace nativeAvailable canUpload />); expect(screen.getByText('open')).toBeInTheDocument();
    fireEvent.click(screen.getByText('open')); await waitFor(() => expect(screen.getByText('title')).toBeInTheDocument());
    result.unmount(); render(<TemplatesWorkspace nativeAvailable={false} canUpload />); expect(screen.queryByText('open')).not.toBeInTheDocument();
});

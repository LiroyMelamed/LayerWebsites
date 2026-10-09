import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PublicPackageSigning from './PublicPackageSigning';
import SignatureCanvas from '../../../components/specializedComponents/signFiles/SignatureCanvas';
import { createV2DocumentAdapter } from './v2SigningCanvasAdapter';
import signingPublicApi from '../../../api/signingPublicApi';

jest.mock('../../../i18n/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('../../../api/apiUtils', () => ({ __esModule: true, default: { defaults: { baseURL: '/api' } } }));
jest.mock('../../../api/signingFilesApi', () => ({ __esModule: true, default: {} }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { resolvedLanguage: 'he', language: 'he', dir: () => 'rtl' } }) }));
jest.mock('../../../components/ui/showAppToast', () => ({ showAppToast: jest.fn() }));
jest.mock('../../../components/styledComponents/buttons/GenericButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../../api/signingPublicApi', () => ({ __esModule: true, readGrantToken: () => 'synthetic', default: {
    session: jest.fn(), challenge: jest.fn(), verify: jest.fn(), accept: jest.fn(), describe: jest.fn(), document: jest.fn(),
} }));
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => ({ pdfFile, spots, onSelectSpot, onDocumentReady }) => {
    // Only PDF rendering is mocked: the real consent, OTP, field controls and
    // next-field navigation remain under test.
    require('react').useEffect(() => { onDocumentReady(true); }, [pdfFile]); // eslint-disable-line react-hooks/exhaustive-deps
    return <div data-testid="pdf" data-page-number="1">{spots.map((spot, index) =>
        <button key={spot.SignatureSpotId} onClick={() => onSelectSpot(index)}>{spot.FieldLabel}</button>)}</div>;
});
if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const entries = ['a', 'b'].map(id => ({ document: { documentId: id, name: `PDF ${id}` }, task: { taskId: id, state: 'ready', fields: [
    { id: 'name', type: 'text', label: `Name ${id}`, pageNum: 1, x: 40, y: 80, width: 100, height: 30, required: true },
] } }));
beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollTo = jest.fn();
    signingPublicApi.session.mockResolvedValue({ sessionId: 's', channels: [{ channel: 'sms' }] });
    signingPublicApi.challenge.mockResolvedValue({ channel: 'sms', delivery: 'sent' });
    signingPublicApi.verify.mockResolvedValue({ verified: true });
    signingPublicApi.accept.mockResolvedValue({ accepted: true });
});

test('the incumbent screen navigates original PDFs, keeps one OTP, and cannot finish before every required field', async () => {
    const api = createV2DocumentAdapter({ token: 'synthetic', entries, consentVersion: 'v', locale: 'ar' });
    const loadPdf = jest.fn(async id => new Blob([`PDF ${id}`]));
    render(<SignatureCanvas variant="screen" publicToken="synthetic" filesApi={api} onClose={() => {}} deferOtpUntilConsent
        documentGroup={{ documents: entries.map(item => ({ id: item.document.documentId, name: item.document.name })), loadPdf,
            consentText: 'Consent to both PDFs', signAllLabel: 'Sign all documents', completionText: '2 documents signed; 1 remains.' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Name a' }));
    expect(signingPublicApi.challenge).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Consent to both PDFs' }));
    await waitFor(() => expect(signingPublicApi.challenge).toHaveBeenCalledTimes(1));
    signingPublicApi.verify.mockRejectedValueOnce(new Error('Incorrect code'));
    fireEvent.change(screen.getByRole('textbox', { name: 'signing.canvas.otpPlaceholder' }), { target: { value: '١١١١١١' } });
    await waitFor(() => expect(signingPublicApi.verify).toHaveBeenCalledWith('synthetic', 's', '111111'));
    fireEvent.change(screen.getByRole('textbox', { name: 'signing.canvas.otpPlaceholder' }), { target: { value: '١٢٣٤٥٦' } });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'signing.canvas.otpPlaceholder' })).toBeNull());
    fireEvent.change(screen.getByPlaceholderText('signing.canvas.fieldValuePlaceholder'), { target: { value: 'Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'signing.canvas.saveField' }));
    await waitFor(() => expect(loadPdf).toHaveBeenLastCalledWith('b'));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('b'));
    expect(screen.queryByRole('button', { name: 'Name a' })).toBeNull();
    expect(signingPublicApi.accept).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByPlaceholderText('signing.canvas.fieldValuePlaceholder'), { target: { value: 'Beta' } });
    fireEvent.click(screen.getByRole('button', { name: 'signing.canvas.saveField' }));
    await waitFor(() => expect(signingPublicApi.accept).toHaveBeenCalledTimes(1));
    expect(signingPublicApi.accept.mock.calls[0][2].values).toEqual({ a: { name: 'Alpha' }, b: { name: 'Beta' } });
    expect(signingPublicApi.session).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('signing.canvas.signingCompleteTitle')).toBeTruthy();
    expect(screen.getByText('2 documents signed; 1 remains.')).toBeInTheDocument();
});


function CurrentPath() { return <output data-testid="destination">{useLocation().pathname}</output>; }

test.each([
    ['Admin', '/AdminStack/MainScreen'],
    ['Lawyer', '/AdminStack/MainScreen'],
    ['Staff', '/AdminStack/MainScreen'],
    ['User', '/ClientStack/ClientMainScreen'],
    ['Client', '/ClientStack/ClientMainScreen'],
    [null, '/LoginStack/LoginScreen'],
])('the real Finish button returns %s to the correct home after completion', async (role, expected) => {
    if (role) { localStorage.setItem('role', role); localStorage.setItem('token', 'synthetic-session'); }
    signingPublicApi.describe.mockResolvedValue({ consentVersion: 'v', person: { name: 'Synthetic signer' }, packages: [{
        packageId: 'p', documents: [{ documentId: 'd', name: 'Completed PDF', tasks: [{
            taskId: 't', state: 'accepted', fields: [{ id: 's', type: 'signature', pageNum: 1, x: 10, y: 20, width: 100, height: 40 }],
        }] }],
    }] });
    signingPublicApi.document.mockResolvedValue(new Blob(['synthetic pdf']));
    render(<MemoryRouter initialEntries={['/ViewSignedDocument/Sign']}><PublicPackageSigning /><CurrentPath /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'signing.canvas.signingCompleteClose' }));
    expect(await screen.findByTestId('destination')).toHaveTextContent(expected);
    expect(signingPublicApi.session).not.toHaveBeenCalled();
});

test('incumbent controls delegate refusal/clarification to the viewed PDF without a native prompt or OTP', async () => {
    const api = createV2DocumentAdapter({ token: 'synthetic', entries, consentVersion: 'v', locale: 'ar' });
    const issue = jest.fn(), nativePrompt = jest.spyOn(window, 'prompt').mockImplementation(() => { throw Error('Unexpected prompt'); });
    render(<SignatureCanvas variant="screen" publicToken="synthetic" filesApi={api} onClose={() => {}} deferOtpUntilConsent
        documentIssueActions={{ request: issue, direction: 'ltr', resolutions: { b: 'Unchanged document response' } }} documentGroup={{ documents: entries.map(item => ({ id: item.document.documentId, name: item.document.name })), loadPdf: async () => new Blob(['PDF']) }} />);
    const selector = await screen.findByRole('combobox');
    fireEvent.change(selector, { target: { value: 'b' } });
    await screen.findByRole('button', { name: 'Name b' });
    expect(screen.getAllByRole('button', { name: 'signingV2.issue.clarifyButton' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'signingV2.issue.clarifyButton' }));
    expect(issue).toHaveBeenLastCalledWith('clarify', 'b');
    expect(screen.getByRole('status')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('status')).toHaveTextContent('Unchanged document response');
    fireEvent.click(screen.getByRole('button', { name: 'signing.canvas.rejectDocument' }));
    expect(issue).toHaveBeenLastCalledWith('decline', 'b');
    expect(nativePrompt).not.toHaveBeenCalled(); expect(signingPublicApi.challenge).not.toHaveBeenCalled();
    nativePrompt.mockRestore();
});


test('interactive package lawyer stamp uses upload/draw and consent/OTP, and required text still blocks completion', async () => {
    const stampEntry = { document: { documentId: 'stamp-pdf', name: 'Original stamp PDF' }, task: { taskId: 'stamp-task', state: 'ready', fields: [
        { id: 'personal-stamp', type: 'lawyerStamp', label: 'Personal office stamp', pageNum: 1, x: 40, y: 80, width: 100, height: 30, required: true },
        { id: 'name', type: 'text', label: 'Required name', pageNum: 1, x: 40, y: 180, width: 100, height: 30, required: true },
    ] } };
    const api = createV2DocumentAdapter({ token: 'synthetic', entries: [stampEntry], consentVersion: 'v', locale: 'he' });
    const ctx = { clearRect: jest.fn(), fillText: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(), getImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn() };
    const contextMock = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const dataMock = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,personal-composite');
    const OriginalImage = window.Image;
    window.Image = class { naturalWidth = 2; naturalHeight = 2; set src(value) { queueMicrotask(() => this.onload?.()); } };
    URL.createObjectURL = jest.fn(() => 'blob:personal-stamp'); URL.revokeObjectURL = jest.fn();
    try {
        const { container } = render(<SignatureCanvas variant="screen" publicToken="synthetic" filesApi={api} onClose={() => {}} deferOtpUntilConsent
            documentGroup={{ documents: [{ id: 'stamp-pdf', name: 'Original stamp PDF' }], loadPdf: async () => new Blob(['PDF']), consentText: 'Consent to this PDF' }} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Personal office stamp' }));
        expect((await screen.findAllByText('signing.fields.lawyerStamp')).length).toBeGreaterThan(0);
        expect(screen.queryByPlaceholderText('signing.canvas.fieldValuePlaceholder')).toBeNull();
        expect(signingPublicApi.challenge).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Consent to this PDF' }));
        await waitFor(() => expect(signingPublicApi.challenge).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByRole('textbox', { name: 'signing.canvas.otpPlaceholder' }), { target: { value: '123456' } });
        await waitFor(() => expect(screen.queryByRole('textbox', { name: 'signing.canvas.otpPlaceholder' })).toBeNull());
        const input = screen.getByLabelText('signing.canvas.chooseFile');
        expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,application/pdf');
        fireEvent.change(input, { target: { files: [new File(['synthetic stamp'], 'stamp.png', { type: 'image/png' })] } });
        fireEvent.click(screen.getByRole('button', { name: 'signing.canvas.nextStep' }));
        await screen.findByText('signing.canvas.signOnStampHint');
        // The drawing canvas has no input role; exercise its native pointer handlers.
        // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
        const canvas = container.querySelector('canvas');
        fireEvent.pointerDown(canvas, { clientX: 4, clientY: 4, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
        fireEvent.pointerUp(canvas, { pointerId: 1 });
        fireEvent.click(screen.getByRole('button', { name: 'signing.canvas.saveField' }));
        await screen.findByPlaceholderText('signing.canvas.fieldValuePlaceholder');
        expect(signingPublicApi.accept).not.toHaveBeenCalled();
        expect((await api.getPublicSigningFileDetails()).data.signatureSpots[0].IsSigned).toBe(true);
        fireEvent.change(screen.getByPlaceholderText('signing.canvas.fieldValuePlaceholder'), { target: { value: 'Explicit legal name' } });
        fireEvent.click(screen.getByRole('button', { name: 'signing.canvas.saveField' }));
        await waitFor(() => expect(signingPublicApi.accept).toHaveBeenCalledTimes(1));
        expect(signingPublicApi.accept.mock.calls[0][2].drawings).toEqual([{ image: 'data:image/png;base64,personal-composite', fields: [{ taskId: 'stamp-task', fieldId: 'personal-stamp' }] }]);
        expect(signingPublicApi.accept.mock.calls[0][2].values).toEqual({ 'stamp-task': { name: 'Explicit legal name' } });
        expect(signingPublicApi.verify).toHaveBeenCalledWith('synthetic', 's', '123456');
        expect(await screen.findByText('signing.canvas.signingCompleteTitle')).toBeInTheDocument();
    } finally { window.Image = OriginalImage; contextMock.mockRestore(); dataMock.mockRestore(); }
});

test('legacy sender-applied lawyer stamp stays hidden and does not become a personal upload task', async () => {
    const api = createV2DocumentAdapter({ token: 'synthetic', entries: [entries[0]], consentVersion: 'v', locale: 'he' });
    const legacyApi = { ...api, getPublicSigningFileDetails: async () => {
        const result = await api.getPublicSigningFileDetails();
        result.data.signatureSpots.push({ SignatureSpotId: 99, FieldType: 'lawyerStamp', FieldLabel: 'Fixed sender stamp', PageNumber: 1, IsSigned: true, CanSign: false });
        return result;
    } };
    render(<SignatureCanvas variant="screen" publicToken="synthetic" filesApi={legacyApi} loadPublicPdf={async () => new Blob(['PDF'])} onClose={() => {}} deferOtpUntilConsent />);
    await screen.findByRole('button', { name: 'Name a' });
    expect(screen.queryByRole('button', { name: 'Fixed sender stamp' })).toBeNull();
    expect(screen.queryByLabelText('signing.canvas.chooseFile')).toBeNull();
    expect(signingPublicApi.challenge).not.toHaveBeenCalled();
});

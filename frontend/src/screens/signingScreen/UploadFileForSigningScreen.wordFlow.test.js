import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UploadFileForSigningScreen from './UploadFileForSigningScreen';
import billingApi from '../../api/billingApi';
import signingFilesApi from '../../api/signingFilesApi';
import { uploadFileToR2 } from '../../utils/fileUploadUtils';
import { showAppToast } from '../../components/ui/showAppToast';
import wordTemplatesApi from '../../api/wordTemplatesApi';
import casesApi from '../../api/casesApi';

// Exercise the real screen Word handoff and affected submission flow. All external
// transports, routing, provider surfaces and PDF rendering are local fakes.
const mockNavigate = jest.fn();
const mockLoad = jest.fn();
let mockPlan;
let mockSetPopup;
let mockLocation;
const mockOpenPopup = jest.fn((node) => mockSetPopup(node));
const mockClosePopup = jest.fn(() => mockSetPopup(null));

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useLocation: () => mockLocation }));
jest.mock('../../api/wordTemplatesApi', () => ({ __esModule: true, default: { previewInfo: jest.fn(), pdf: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../i18n/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: false }) }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: mockOpenPopup, closePopup: mockClosePopup }) }));
jest.mock('../../api/billingApi', () => ({ __esModule: true, default: { getPlan: jest.fn() } }));
jest.mock('../../api/signingFilesApi', () => ({ __esModule: true, default: { uploadFileForSigning: jest.fn(), detectSignatureSpots: jest.fn() } }));
jest.mock('../../api/apiUtils', () => ({ __esModule: true, default: { get: jest.fn(async () => ({ data: {} })) } }));
jest.mock('../../api/casesApi', () => ({ __esModule: true, default: { getCaseByName: jest.fn(), getCaseById: jest.fn() } }));
jest.mock('../../api/customersApi', () => ({ customersApi: { getCustomersByName: jest.fn(), getCurrentCustomer: jest.fn(async () => ({ data: {} })) } }));
jest.mock('../../utils/fileUploadUtils', () => ({ uploadFileToR2: jest.fn() }));
jest.mock('../../components/ui/showAppToast', () => ({ showAppToast: jest.fn() }));
jest.mock('../../hooks/useHttpRequest', () => ({ __esModule: true, default: (api) => ({
    result: api === require('../../api/billingApi').default.getPlan ? mockPlan : [],
    performRequest: mockLoad,
    isPerforming: false,
}) }));
jest.mock('../../assets/images/images', () => ({ images: { Backgrounds: { AppBackground: '' } } }));
jest.mock('../../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('./SigningManagerScreen', () => ({ SigningManagerScreenName: '/SigningManagerScreen' }));
jest.mock('../mainScreen/MainScreen', () => ({ MainScreenName: '/MainScreen' }));
jest.mock('../../components/navBars/data/NavBarData', () => ({ getNavBarData: () => [] }));
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => null);
jest.mock('../mainScreen/components/ClientPopUp', () => () => null);
jest.mock('../../components/specializedComponents/signFiles/LawyerStampPopup', () => () => null);
jest.mock('../../components/simpleComponents/SimpleScreen', () => ({ children }) => <main>{children}</main>);
jest.mock('../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/simpleComponents/SimpleContainer', () => ({ children, className }) => <div className={className}>{children}</div>);
jest.mock('../../components/simpleComponents/Skeleton', () => () => null);
jest.mock('../../components/simpleComponents/SimpleInput', () => ({ title, value, onChange, type = 'text' }) => <input aria-label={title} value={value} onChange={onChange} type={type} />);
jest.mock('../../components/specializedComponents/text/AllTextKindFile', () => ({ Text14: ({ children }) => <span>{children}</span>, TextBold24: ({ children }) => <h2>{children}</h2> }));
jest.mock('../../components/styledComponents/buttons/PrimaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../components/styledComponents/buttons/SecondaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../components/specializedComponents/containers/SearchInput', () => ({ title, placeholder, value = '', onSearch, buttonPressFunction }) => <div>
    <input aria-label={title || placeholder} value={value} onChange={event => onSearch(event.target.value)} />
    {title === 'signing.upload.searchSignerTitle' && <button onClick={() => buttonPressFunction('Synthetic signer', { UserId: 11, Name: 'Synthetic signer', Email: 'signer@example.invalid' })}>Choose synthetic signer</button>}
    {title === 'cases.searchCaseTitle' && <button onClick={() => buttonPressFunction('Other case', { CaseId: 99, CaseName: 'Other case', UserId: 22 })}>Choose other case</button>}
</div>);
jest.mock('../../components/styledComponents/fileUpload/FileUploadBox', () => ({ onFileSelected, disabled }) => <input aria-label="Choose PDF" type="file" disabled={disabled} onChange={event => onFileSelected(event.target.files[0])} />);
jest.mock('../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => ({ onAddSpotForPage, spots }) => <div className="lw-signing-pdfViewer">
    <button onClick={() => onAddSpotForPage(1, 0, 'signature', {})}>Place signature field</button>
    <output aria-label="Manual field count">{spots.length}</output>
</div>);
jest.mock('../../components/specializedComponents/signFiles/fieldToolbar/FloatingAddField', () => () => null);
jest.mock('../../components/specializedComponents/signFiles/fieldToolbar/AddFieldPanel', () => () => null);
jest.mock('./templates/SigningSelect', () => props => <select {...props} />);

const retentionKey = 'lw_retention_notice_ack_v1';
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
function Harness() {
    const [popup, setPopup] = useState(null);
    mockSetPopup = setPopup;
    return <><UploadFileForSigningScreen />{popup && <section aria-label="Application popup">{popup}</section>}</>;
}
async function readyScreen({ acknowledged = true } = {}) {
    if (acknowledged) localStorage.setItem(retentionKey, '1');
    const view = render(<Harness />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose synthetic signer' }));
    fireEvent.change(screen.getByLabelText('Choose PDF'), { target: { files: [new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Place signature field' }));
    expect(screen.getByLabelText('Manual field count')).toHaveTextContent('1');
    return view;
}
const send = () => screen.getAllByRole('button', { name: 'signing.upload.sendToClient' })[0];

beforeEach(() => {
    jest.clearAllMocks();
    // CRA resets jest.fn implementations before each test; restore this owned popup fixture.
    mockOpenPopup.mockImplementation(node => mockSetPopup(node));
    mockClosePopup.mockImplementation(() => mockSetPopup(null));
    localStorage.clear();
    mockLocation = { state: null };
    mockPlan = { retention: { documentsCoreDays: 365, documentsPiiDays: 30 } };
    billingApi.getPlan.mockResolvedValue({ data: mockPlan });
    uploadFileToR2.mockResolvedValue({ key: 'owned/synthetic.pdf' });
    signingFilesApi.uploadFileForSigning.mockResolvedValue({ data: { sentCount: 1, targetCount: 1 } });
    signingFilesApi.detectSignatureSpots.mockResolvedValue({ data: { spots: [{ pageNum: 1, x: 100, y: 300, width: 160, height: 56, assignmentStatus: 'unassigned' }] } });
    casesApi.getCaseById.mockResolvedValue({ data: { CaseId: 12, CaseName: 'Synthetic rental case', UserId: 77 } });
});

async function openWordPreview() {
    const id = 'a8ed476a-6e05-4a04-8ad3-898d25456027';
    mockLocation = { state: { wordPreviewId: id, clientId: 999, caseId: 999, signatureSpots: [{ x: 99 }] } };
    wordTemplatesApi.previewInfo.mockResolvedValue({ preview: { id, name: 'Rental', caseId: 12, clientId: 22,
        pdfHash: 'a'.repeat(64), requiresFreshSigningGeometry: true } });
    wordTemplatesApi.pdf.mockResolvedValue(new Blob(['%PDF-synthetic'], { type: 'application/pdf' }));
    localStorage.setItem(retentionKey, '1');
    const view = render(<Harness />);
    await screen.findByText('signingWord.freshFields');
    expect(screen.getByLabelText('Manual field count')).toHaveTextContent('0');
    expect(uploadFileToR2).not.toHaveBeenCalled(); expect(signingFilesApi.uploadFileForSigning).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose synthetic signer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place signature field' }));
    return view;
}

test('Word continuation refetches protected context, starts with fresh fields and keeps the selected client association', async () => {
    await openWordPreview();
    fireEvent.click(send());
    await waitFor(() => expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledTimes(1));
    expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledWith(expect.objectContaining({ clientId: 22, caseId: 12, fileName: 'Rental.pdf' }));
    expect(uploadFileToR2.mock.calls[0][0].name).toBe('Rental.pdf');
});

test('Word context stays visibly fixed while the scoped case name cannot overwrite the chosen client', async () => {
    await openWordPreview();
    expect(await screen.findByText('Synthetic rental case')).toBeInTheDocument();
    expect(casesApi.getCaseById).toHaveBeenCalledWith(12);
    expect(screen.queryByRole('button', { name: 'Choose other case' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('cases.searchCaseTitle')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'signing.upload.removeCaseAria' })).not.toBeInTheDocument();
    expect(screen.getByText('signingWord.contextFrozen')).toBeInTheDocument();
    fireEvent.click(send());
    await waitFor(() => expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledTimes(1));
    expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledWith(expect.objectContaining({ clientId: 22, caseId: 12 }));
});

test('Word provenance survives removal of optional route state without changing the client to the signer', async () => {
    const view = await openWordPreview();
    mockLocation = { state: null };
    view.rerender(<Harness />);
    await act(async () => {});
    expect(screen.getByText('signingWord.freshFields')).toBeInTheDocument();
    expect(screen.queryByLabelText('cases.searchCaseTitle')).not.toBeInTheDocument();
    fireEvent.click(send());
    await waitFor(() => expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledTimes(1));
    expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledWith(expect.objectContaining({ clientId: 22, caseId: 12 }));
});

test('Word route changes during upload cancel dispatch from the earlier draft', async () => {
    const pending = deferred(); uploadFileToR2.mockReturnValue(pending.promise);
    const view = await openWordPreview();
    fireEvent.click(send());
    await waitFor(() => expect(uploadFileToR2).toHaveBeenCalledTimes(1));
    mockLocation = { state: null }; view.rerender(<Harness />);
    await act(async () => { pending.resolve({ key: 'owned/earlier.pdf' }); });
    expect(signingFilesApi.uploadFileForSigning).not.toHaveBeenCalled();
});

test('a late Word case label cannot relabel a different manually selected PDF', async () => {
    const pending = deferred(); casesApi.getCaseById.mockReturnValue(pending.promise);
    await openWordPreview();
    fireEvent.change(screen.getByLabelText('Choose PDF'), { target: { files: [new File(['synthetic'], 'manual.pdf', { type: 'application/pdf' })] } });
    await act(async () => { pending.resolve({ data: { CaseId: 12, CaseName: 'Late obsolete label', UserId: 77 } }); });
    expect(screen.queryByText('Late obsolete label')).not.toBeInTheDocument();
    expect(screen.queryByText('signingWord.freshFields')).not.toBeInTheDocument();
    expect(screen.getByLabelText('cases.searchCaseTitle')).toBeInTheDocument();
});

test('retention notice offers cancel and acknowledge; cancel releases the submit lock for a later send', async () => {
    await readyScreen({ acknowledged: false });
    fireEvent.click(send());
    await screen.findByRole('button', { name: 'signing.upload.retentionNotice.ackButton' });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(send()).not.toBeDisabled());
    expect(uploadFileToR2).not.toHaveBeenCalled();
    expect(signingFilesApi.uploadFileForSigning).not.toHaveBeenCalled();
    expect(localStorage.getItem(retentionKey)).toBeNull();

    fireEvent.click(send());
    fireEvent.click(await screen.findByRole('button', { name: 'signing.upload.retentionNotice.ackButton' }));
    await waitFor(() => expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledTimes(1));
    expect(mockOpenPopup).toHaveBeenCalledTimes(2);
    expect(mockOpenPopup.mock.calls[0][1]).toEqual({ preventClose: true });
    expect(localStorage.getItem(retentionKey)).toBe('1');
});

test('same-tick double submit and clicks during upload cannot duplicate the upload or invitation dispatch', async () => {
    const pendingUpload = deferred();
    uploadFileToR2.mockReturnValue(pendingUpload.promise);
    await readyScreen();
    const button = send();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(uploadFileToR2).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button', { name: 'signing.upload.sending' })[0]);
    await act(async () => { pendingUpload.resolve({ key: 'owned/once.pdf' }); });
    await waitFor(() => expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledTimes(1));
    expect(uploadFileToR2).toHaveBeenCalledTimes(1);
    expect(signingFilesApi.uploadFileForSigning.mock.calls[0][0]).toMatchObject({ fileKey: 'owned/once.pdf', signers: [{ userId: 11, name: 'Synthetic signer', deliveryMethod: 'email' }], signatureLocations: [{ signerUserId: 11, signerIndex: 0 }] });
});

test('leaving while retention details load cannot open a late notice, upload or dispatch', async () => {
    mockPlan = null;
    const pendingPlan = deferred();
    billingApi.getPlan.mockReturnValue(pendingPlan.promise);
    const view = await readyScreen({ acknowledged: false });
    fireEvent.click(send());
    await waitFor(() => expect(billingApi.getPlan).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { pendingPlan.resolve({ data: { retention: { documentsCoreDays: 365, documentsPiiDays: 30 } } }); });
    expect(mockOpenPopup).not.toHaveBeenCalled();
    expect(uploadFileToR2).not.toHaveBeenCalled();
    expect(signingFilesApi.uploadFileForSigning).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
});

test('leaving during file upload prevents invitation dispatch and late application feedback', async () => {
    const pendingUpload = deferred();
    uploadFileToR2.mockReturnValue(pendingUpload.promise);
    const view = await readyScreen();
    fireEvent.click(send());
    await waitFor(() => expect(uploadFileToR2).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { pendingUpload.resolve({ key: 'owned/late.pdf' }); });
    expect(signingFilesApi.uploadFileForSigning).not.toHaveBeenCalled();
    expect(mockOpenPopup).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(showAppToast).not.toHaveBeenCalled();
});

test('leaving after dispatch started does not navigate or announce success when that request completes', async () => {
    const pendingSend = deferred();
    signingFilesApi.uploadFileForSigning.mockReturnValue(pendingSend.promise);
    const view = await readyScreen();
    fireEvent.click(send());
    await waitFor(() => expect(signingFilesApi.uploadFileForSigning).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { pendingSend.resolve({ data: { sentCount: 1, targetCount: 1 } }); });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(showAppToast).not.toHaveBeenCalled();
    expect(mockOpenPopup).not.toHaveBeenCalled();
});


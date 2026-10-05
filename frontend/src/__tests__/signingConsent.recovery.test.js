import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignatureCanvas from '../components/specializedComponents/signFiles/SignatureCanvas';
import signingFilesApi from '../api/signingFilesApi';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../api/apiUtils', () => ({ __esModule: true, default: {
  defaults: { baseURL: '/api' }, get: jest.fn(async () => ({ data: { SHOW_PUBLIC_SIGNING_CONSENT: false } })),
} }));
jest.mock('../api/signingFilesApi', () => ({ __esModule: true, default: {
  getPublicSigningFileDetails: jest.fn(), listPublicSavedItems: jest.fn(), publicSignFile: jest.fn(),
  getPublicSavedStampDataUrl: jest.fn(),
} }));
jest.mock('../components/ui/showAppToast', () => ({ showAppToast: jest.fn() }));
jest.mock('../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => ({ onSelectSpot }) => (
  <div data-page-number="1"><button onClick={() => onSelectSpot(0)}>Select field</button></div>
));
jest.mock('../components/styledComponents/buttons/GenericButton', () => ({ children, onPress, disabled }) => (
  <button onClick={onPress} disabled={disabled}>{children}</button>
));

const details = {
  file: { SigningFileId: 1, FileKey: 'synthetic.pdf', Status: 'pending', ClientId: 10, OtpEnabled: false, SigningPolicyVersion: 'qa-policy' },
  signerUserId: 10,
  signatureSpots: [{ SignatureSpotId: 1, PageNumber: 1, X: 1, Y: 1, Width: 100, Height: 20, FieldType: 'text', CanSign: true, SignerUserId: 10, IsSigned: false, IsRequired: true }],
};
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  global.fetch = jest.fn(async () => ({ ok: true, blob: async () => new Blob(['synthetic pdf']) }));
  Element.prototype.scrollTo = jest.fn();
  signingFilesApi.getPublicSigningFileDetails.mockResolvedValue({ status: 200, data: details });
  signingFilesApi.listPublicSavedItems.mockResolvedValue({ status: 200, data: { signatures: [], stamps: [] } });
  signingFilesApi.publicSignFile.mockResolvedValue({ status: 200, data: {} });
});
afterEach(() => { global.fetch = originalFetch; });

test('legacy hidden-consent setting and cached acceptance cannot authorize a new signing session', async () => {
  localStorage.setItem('lw_signing_consent_accepted:public:qa-token', 'true');
  render(<SignatureCanvas publicToken="qa-token" onClose={() => {}} />);
  const consent = await screen.findByRole('checkbox', { name: 'signing.canvas.consentText' });
  expect(consent).not.toBeChecked();
  fireEvent.click(await screen.findByText('Select field'));
  fireEvent.change(await screen.findByPlaceholderText('signing.canvas.fieldValuePlaceholder'), { target: { value: 'QA text' } });
  await act(async () => fireEvent.click(screen.getByText('signing.canvas.saveField')));
  expect(signingFilesApi.publicSignFile).not.toHaveBeenCalled();
  expect(screen.queryByText('signing.canvas.signingCompleteTitle')).not.toBeInTheDocument();
  fireEvent.click(consent);
  await act(async () => fireEvent.click(screen.getByText('signing.canvas.saveField')));
  await waitFor(() => expect(signingFilesApi.publicSignFile).toHaveBeenCalledWith('qa-token', expect.objectContaining({ consentAccepted: true, consentVersion: 'qa-policy', fieldValue: 'QA text' }), expect.any(Object)));
});

test('opening another signing link asks for a new explicit consent', async () => {
  const view = render(<SignatureCanvas publicToken="qa-first" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'signing.canvas.consentText' }));
  expect(screen.queryByRole('checkbox', { name: 'signing.canvas.consentText' })).not.toBeInTheDocument();
  view.rerender(<SignatureCanvas publicToken="qa-second" onClose={() => {}} />);
  expect(await screen.findByRole('checkbox', { name: 'signing.canvas.consentText' })).not.toBeChecked();
});

test('continuing with a saved client stamp does not treat the click event as a saved item', async () => {
  signingFilesApi.getPublicSigningFileDetails.mockResolvedValue({ status: 200, data: {
    ...details, signatureSpots: [{ ...details.signatureSpots[0], FieldType: 'clientstamp' }],
  } });
  signingFilesApi.listPublicSavedItems.mockResolvedValue({ status: 200, data: {
    signatures: [], stamps: [{ index: 0, url: '/synthetic-stamp.png', key: 'synthetic-stamp.png' }],
  } });
  signingFilesApi.getPublicSavedStampDataUrl.mockResolvedValue({ status: 200, data: { exists: true, dataUrl: 'synthetic-stamp-payload' } });
  render(<SignatureCanvas publicToken="qa-stamp" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'signing.canvas.consentText' }));
  fireEvent.click(await screen.findByText('Select field'));
  fireEvent.click(await screen.findByRole('button', { name: 'signing.canvas.tabSavedStamp' }));
  fireEvent.click(await screen.findByRole('button', { name: 'signing.canvas.nextStep' }));
  await waitFor(() => expect(signingFilesApi.publicSignFile).toHaveBeenCalledWith('qa-stamp', expect.objectContaining({
    signatureSpotId: 1, signatureImage: 'synthetic-stamp-payload', consentAccepted: true,
  }), expect.any(Object)));
});

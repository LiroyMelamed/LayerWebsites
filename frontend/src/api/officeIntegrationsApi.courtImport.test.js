import ApiUtils from './apiUtils';
import { officeIntegrationsApi as api } from './officeIntegrationsApi';
jest.mock('./apiUtils', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
beforeEach(() => jest.resetAllMocks());

test('court upload retains browser multipart encoding and an explicit bounded timeout', async () => {
    const body = new FormData(); body.append('actionId', 'stable-action');
    ApiUtils.post.mockResolvedValue({ success: true, data: { ok: true } });
    await expect(api.importCourtFile(body)).resolves.toEqual({ ok: true });
    expect(ApiUtils.post).toHaveBeenCalledWith('office-integrations/court/import-file', body, { timeout: 30000 });
});
test('court download encodes identifiers and requests a protected blob, never a browser-supplied URL', async () => {
    const blob = new Blob(['document']); ApiUtils.get.mockResolvedValue({ success: true, data: blob });
    await expect(api.courtDocument('case/15', 'doc?value')).resolves.toBe(blob);
    expect(ApiUtils.get).toHaveBeenCalledWith('office-integrations/cases/case%2F15/court-documents/doc%3Fvalue', { responseType: 'blob', timeout: 30000 });
});
test('authorization and mapping failures preserve safe error codes and do not return success data', async () => {
    ApiUtils.post.mockResolvedValue({ success: false, status: 409, data: { errorCode: 'COURT_REFERENCE_CHANGED', message: 'private details' } });
    await expect(api.importCourtFile(new FormData())).rejects.toMatchObject({ code: 'COURT_REFERENCE_CHANGED', status: 409, message: 'COURT_IMPORT_REQUEST_FAILED' });
    ApiUtils.get.mockResolvedValue({ success: false, status: 403, data: { errorCode: 'FORBIDDEN' } });
    await expect(api.courtDocument(15, 'id')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(api.caseUpdates(15)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});

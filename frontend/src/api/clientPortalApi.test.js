import clientPortalApi, { CLIENT_PORTAL_REQUEST_OPTIONS } from './clientPortalApi';
import apiUtils from './apiUtils';
import signingFilesApi from './signingFilesApi';

jest.mock('./apiUtils', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./signingFilesApi', () => ({ getClientSigningFiles: jest.fn() }));
const ok = data => ({ status: 200, data });
beforeEach(() => {
    jest.resetAllMocks();
    signingFilesApi.getClientSigningFiles.mockResolvedValue(ok({ files: [] }));
    apiUtils.get.mockImplementation(path => Promise.resolve(ok(path === 'files/client-files' ? [] : { enabled: true, documents: [] })));
});

test('combines authenticated sources with distinct identifiers and preserves personal readiness and signed dates', async () => {
    signingFilesApi.getClientSigningFiles.mockResolvedValue(ok({ files: [{ SigningFileId: 7, FileName: 'Legacy', PersonalStatus: 'signed', Status: 'pending', CanSignNow: false, PersonalSignedAt: '2026-10-13' }] }));
    apiUtils.get.mockImplementation(path => Promise.resolve(ok(path === 'files/client-files'
        ? [{ id: 7, caseid: 19, file_name: 'Evidence', created_at: '2026-10-12', CaseName: 'Case' }]
        : { enabled: true, documents: [{ DocumentId: 7, GrantId: 'grant', PersonalStatus: 'pending', CanSignNow: true }] })));
    const result = await clientPortalApi.getDocuments();
    expect(result.data.errors).toEqual([]);
    expect(result.data.files).toEqual([
        expect.objectContaining({ PortalId: 'signing:7', Source: 'signing', PersonalStatus: 'signed', CanSignNow: false, PersonalSignedAt: '2026-10-13' }),
        expect.objectContaining({ PortalId: 'package:7', Source: 'package', GrantId: 'grant', CanSignNow: true }),
        expect.objectContaining({ PortalId: 'case:7', Source: 'case', FileName: 'Evidence', CaseId: 19, PersonalStatus: 'view_only', CanDownload: true }),
    ]);
});

test('loads independent sources concurrently and retains successful files when another request rejects', async () => {
    let resolveLegacy;
    signingFilesApi.getClientSigningFiles.mockReturnValue(new Promise(resolve => { resolveLegacy = resolve; }));
    apiUtils.get.mockRejectedValue(new Error('offline'));
    const pending = clientPortalApi.getSigningDocuments();
    expect(apiUtils.get).toHaveBeenCalledWith('signing-v2/client/documents', { timeout: 15000 });
    resolveLegacy(ok({ files: [{ SigningFileId: 'own', CanSignNow: true }] }));
    const result = await pending;
    expect(result.data.errors).toEqual(['packages']);
    expect(result.data.files).toEqual([expect.objectContaining({ PortalId: 'signing:own' })]);
    expect(apiUtils.get).not.toHaveBeenCalledWith('files/client-files', expect.anything());
});

test.each([
    { status: 401, data: { documents: [] } },
    { status: 200, success: false, data: { documents: [] } },
    { status: 200, data: { documents: null } },
    { status: 200, data: [] },
])('treats a failed or malformed source as partial data, not an empty successful library: %j', async response => {
    apiUtils.get.mockResolvedValue(response);
    const result = await clientPortalApi.getSigningDocuments();
    expect(result.data.errors).toEqual(['packages']);
});

test('reports all three failures instead of pretending the client has no documents', async () => {
    signingFilesApi.getClientSigningFiles.mockRejectedValue(new Error('offline'));
    apiUtils.get.mockRejectedValue(new Error('offline'));
    const result = await clientPortalApi.getDocuments();
    expect(result.data.files).toEqual([]);
    expect(result.data.errors).toEqual(['signing', 'packages', 'caseFiles']);
});

test('disabled packages with a valid empty list are supported and package opening sends only the selected existing grant', async () => {
    apiUtils.get.mockResolvedValue(ok({ enabled: false, documents: [] }));
    expect((await clientPortalApi.getSigningDocuments()).data.errors).toEqual([]);
    apiUtils.post.mockResolvedValue(ok({ url: '/ViewSignedDocument/Sign#token' }));
    await clientPortalApi.openPackageDocument({ DocumentId: 'a/b?', GrantId: 'existing-grant', PrivateData: 'not sent' });
    expect(apiUtils.post).toHaveBeenCalledWith('signing-v2/client/documents/a%2Fb%3F/open', { grantId: 'existing-grant' }, { timeout: 15000 });
});


test('each portal list and package entry request carries an explicit 15 second Axios timeout', async () => {
    await clientPortalApi.getDocuments();
    expect(CLIENT_PORTAL_REQUEST_OPTIONS).toEqual({ timeout: 15000 });
    expect(signingFilesApi.getClientSigningFiles).toHaveBeenCalledWith({ timeout: 15000 });
    expect(apiUtils.get).toHaveBeenCalledWith('signing-v2/client/documents', { timeout: 15000 });
    expect(apiUtils.get).toHaveBeenCalledWith('files/client-files', { timeout: 15000 });
    await clientPortalApi.openPackageDocument({ DocumentId: 12, GrantId: 'existing' });
    expect(apiUtils.post).toHaveBeenCalledWith('signing-v2/client/documents/12/open', { grantId: 'existing' }, { timeout: 15000 });
});

test('a timed-out source becomes partial data after its configured deadline and a later request recovers', async () => {
    jest.useFakeTimers();
    try {
        signingFilesApi.getClientSigningFiles.mockResolvedValue(ok({ files: [{ SigningFileId: 'available' }] }));
        apiUtils.get.mockImplementation((path, options) => path === 'files/client-files'
            ? Promise.resolve(ok([{ id: 4, file_name: 'Available case file' }]))
            : new Promise((resolve, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })), options.timeout)));
        let settled = false;
        const pending = clientPortalApi.getDocuments().then(response => { settled = true; return response; });
        jest.advanceTimersByTime(14999);
        await Promise.resolve();
        expect(settled).toBe(false);
        jest.advanceTimersByTime(1);
        const partial = await pending;
        expect(partial.data.files.map(file => file.PortalId)).toEqual(['signing:available', 'case:4']);
        expect(partial.data.errors).toEqual(['packages']);
        apiUtils.get.mockImplementation(path => Promise.resolve(ok(path === 'files/client-files' ? [] : { documents: [{ DocumentId: 'recovered' }] })));
        const recovered = await clientPortalApi.getDocuments();
        expect(recovered.data.errors).toEqual([]);
        expect(recovered.data.files.map(file => file.PortalId)).toContain('package:recovered');
    } finally {
        jest.useRealTimers();
    }
});

test('portal-only options are forwarded by shared adapters and incumbent calls retain their existing defaults', async () => {
    const actualSigningApi = jest.requireActual('./signingFilesApi').default;
    const actualFilesApi = jest.requireActual('./filesApi').default;
    await actualSigningApi.getClientSigningFiles({ timeout: 15000 });
    expect(apiUtils.get).toHaveBeenLastCalledWith('SigningFiles/client-files', { timeout: 15000 });
    await actualSigningApi.getClientSigningFiles();
    expect(apiUtils.get).toHaveBeenLastCalledWith('SigningFiles/client-files');
    await actualSigningApi.getClientSigningFiles([]);
    expect(apiUtils.get).toHaveBeenLastCalledWith('SigningFiles/client-files');
    await actualSigningApi.downloadSignedFile(9, { timeout: 15000 });
    expect(apiUtils.get).toHaveBeenLastCalledWith('SigningFiles/9/download', { timeout: 15000 });
    await actualSigningApi.downloadSignedFile(9);
    expect(apiUtils.get).toHaveBeenLastCalledWith('SigningFiles/9/download');
    await actualFilesApi.readStageFile(4, { timeout: 15000 });
    expect(apiUtils.get).toHaveBeenLastCalledWith('files/stage-file-read/4', { timeout: 15000 });
    await actualFilesApi.readStageFile(4);
    expect(apiUtils.get).toHaveBeenLastCalledWith('files/stage-file-read/4');
});


test('customer browser entry has its own self-service endpoint and never sends an office recipient selector', async () => {
    const actualSigningApi = jest.requireActual('./signingFilesApi').default;
    await actualSigningApi.createClientPublicSigningLink('17');
    expect(apiUtils.post).toHaveBeenLastCalledWith('SigningFiles/17/client-public-link', {}, { timeout: 15000 });
    await actualSigningApi.createPublicSigningLink(17, 29);
    expect(apiUtils.post).toHaveBeenLastCalledWith('SigningFiles/17/public-link', { signerUserId: 29 });
});

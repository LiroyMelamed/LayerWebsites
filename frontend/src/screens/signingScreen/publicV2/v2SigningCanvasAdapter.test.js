import signingPublicApi from '../../../api/signingPublicApi';
import { createV2DocumentAdapter } from './v2SigningCanvasAdapter';

jest.mock('../../../api/signingPublicApi', () => ({ __esModule: true, default: {
    session: jest.fn(), challenge: jest.fn(), verify: jest.fn(), accept: jest.fn(),
} }));
if (!window.crypto) Object.defineProperty(window, 'crypto', { value: {} });
if (!window.crypto?.randomUUID) Object.defineProperty(window.crypto, 'randomUUID', { value: () => 'synthetic-key', configurable: true });
const entry = (id, types = ['signature'], documentId = id) => ({
    document: { documentId, name: `Document ${documentId}` },
    task: { taskId: id, state: 'ready', fields: types.map((type, index) => ({ id: `${type}-${index}`, type, pageNum: index + 1,
        x: 20, y: 80, width: 150, height: 60, required: true })) },
});
const adapterFor = entries => createV2DocumentAdapter({ token: 'token', entries, consentVersion: 'v', locale: 'ar' });
test('signature, initials and manually drawn stamp keep their own image and exact field bindings', async () => {
    const api = adapterFor([entry('a', ['signature','initials','lawyerStamp'])]);
    await api.publicRequestSigningOtp();
    await api.publicSignFile('token', { signatureSpotId: 1, signatureImage: 'personal-image' });
    await api.publicSignFile('token', { signatureSpotId: 2, signatureImage: 'initials-image' });
    await api.publicSignFile('token', { signatureSpotId: 3, signatureImage: 'manual-stamp-image' });
    expect(signingPublicApi.accept.mock.calls[0][2].drawings).toEqual([
        {image:'personal-image',fields:[{taskId:'a',fieldId:'signature-0'}]},
        {image:'initials-image',fields:[{taskId:'a',fieldId:'initials-1'}]},
        {image:'manual-stamp-image',fields:[{taskId:'a',fieldId:'lawyerStamp-2'}]},
    ]);
    expect((await api.getPublicSigningFileDetails()).data.signatureSpots.map(spot=>spot.SignatureUrl)).toEqual(['personal-image','initials-image','manual-stamp-image']);
});
beforeEach(() => {
    signingPublicApi.session.mockResolvedValue({ sessionId: 'session-1', channels: [{ channel: 'email' }] });
    signingPublicApi.challenge.mockResolvedValue({ channel: 'email', delivery: 'sent' });
    signingPublicApi.verify.mockResolvedValue({ verified: true });
    signingPublicApi.accept.mockResolvedValue({ accepted: true });
});

test('three original PDFs use one manifest/code; geometry and per-document page numbers stay unchanged', async () => {
    const entries = [entry('a'), entry('b'), entry('c')];
    const api = adapterFor(entries);
    const before = (await api.getPublicSigningFileDetails()).data.signatureSpots;
    expect(before.map(s => [s.DocumentId, s.PageNumber, s.X, s.Y, s.Width, s.Height])).toEqual([
        ['a', 1, 20, 80, 150, 60], ['b', 1, 20, 80, 150, 60], ['c', 1, 20, 80, 150, 60],
    ]);
    await api.publicRequestSigningOtp();
    await api.publicVerifySigningOtp('token', '123456');
    await api.publicSignFileBatch('token', { signatureSpotIds: [1, 2, 3], signatureImage: 'png' });
    expect(signingPublicApi.session).toHaveBeenCalledWith('token', { taskIds: ['a', 'b', 'c'], consentVersion: 'v', locale: 'ar' });
    expect(signingPublicApi.accept).toHaveBeenCalledTimes(1);
    expect(signingPublicApi.accept).toHaveBeenCalledWith('token', 'session-1', { consent: true, drawings: [{image:'png',fields:entries.map(item=>({taskId:item.task.taskId,fieldId:item.task.fields[0].id}))}], values: { a: {}, b: {}, c: {} } }, 'synthetic-key');
    expect((await api.getPublicSigningFileDetails()).data.signerCompleted).toBe(true);
});

test('resend reuses the frozen manifest session instead of bypassing its limits with a new session', async () => {
    const api = adapterFor([entry('a'), entry('b')]);
    await api.publicRequestSigningOtp(); await api.publicRequestSigningOtp();
    expect(signingPublicApi.session).toHaveBeenCalledTimes(1);
    expect(signingPublicApi.challenge).toHaveBeenCalledTimes(2);
});

test('all tasks and required fields must be complete, including two roles on the same PDF', async () => {
    const api = adapterFor([entry('a', ['signature', 'text'], 'same'), entry('b', ['checkbox'], 'same')]);
    await api.publicRequestSigningOtp();
    await api.publicSignFileBatch('token', { signatureSpotIds: [1], signatureImage: 'png' });
    await api.publicSignFile('token', { signatureSpotId: 2, fieldValue: 'Alice' });
    expect(signingPublicApi.accept).not.toHaveBeenCalled();
    await api.publicSignFile('token', { signatureSpotId: 3, fieldValue: 'true' });
    expect(signingPublicApi.accept.mock.calls[0][2].values).toEqual({ a: { 'text-1': 'Alice' }, b: { 'checkbox-0': true } });
});

test('lost response and concurrent retry cannot change the already submitted signature or values', async () => {
    const api = adapterFor([entry('a'), entry('b')]);
    await api.publicRequestSigningOtp();
    signingPublicApi.accept.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(api.publicSignFileBatch('token', { signatureSpotIds: [1, 2], signatureImage: 'first-png' })).rejects.toThrow('Connection lost');
    expect((await api.getPublicSigningFileDetails()).data.signerCompleted).toBe(false);
    await Promise.all([
        api.publicSignFileBatch('token', { signatureSpotIds: [1, 2], signatureImage: 'changed-png' }),
        api.publicSignFileBatch('token', { signatureSpotIds: [1, 2], signatureImage: 'changed-again' }),
    ]);
    expect(signingPublicApi.accept).toHaveBeenCalledTimes(2);
    expect(signingPublicApi.accept.mock.calls[1]).toEqual(signingPublicApi.accept.mock.calls[0]);
    expect((await api.getPublicSigningFileDetails()).data.signerCompleted).toBe(true);
});

test('foreign spot IDs cannot be submitted through the batch adapter', async () => {
    const api = adapterFor([entry('a')]);
    await api.publicRequestSigningOtp();
    await expect(api.publicSignFileBatch('token', { signatureSpotIds: [2], signatureImage: 'png' })).rejects.toThrow();
    expect(signingPublicApi.accept).not.toHaveBeenCalled();
});

test('uncertain delivery is not described as successfully sent', async () => {
    signingPublicApi.challenge.mockResolvedValue({ channel: 'email', delivery: 'uncertain' });
    expect((await adapterFor([entry('a')]).publicRequestSigningOtp()).data.delivered).toBe(false);
});


test('two simultaneous clicks with a failed response leave all affected fields unsigned', async () => {
    const api = adapterFor([entry('a'), entry('b')]);
    await api.publicRequestSigningOtp();
    signingPublicApi.accept.mockRejectedValue(new Error('Unavailable'));
    const body = { signatureSpotIds: [1, 2], signatureImage: 'png' };
    const results = await Promise.allSettled([api.publicSignFileBatch('token', body), api.publicSignFileBatch('token', body)]);
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(signingPublicApi.accept).toHaveBeenCalledTimes(1);
    const state = (await api.getPublicSigningFileDetails()).data;
    expect(state.signerCompleted).toBe(false);
    expect(state.signatureSpots.every(spot => !spot.IsSigned)).toBe(true);
});

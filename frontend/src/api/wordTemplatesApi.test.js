import api from './wordTemplatesApi';
import { signingRequest } from './signingTemplatesApi';
jest.mock('./signingTemplatesApi', () => ({ signingRequest: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

test('authoring render and selection stay on protected Word routes with explicit version/hash payloads', () => {
    const payload = { expectedVersion: 3, sourceHash: 'a'.repeat(64) };
    api.authoringRender('source/id', payload);
    expect(signingRequest).toHaveBeenLastCalledWith('post', 'signing-v2/word/source%2Fid/authoring-renders', payload);
    api.authoringPdf('render/id');
    expect(signingRequest).toHaveBeenLastCalledWith('get', 'signing-v2/word/authoring-renders/render%2Fid/pdf', null, { responseType: 'blob' });
    const selection = { ...payload, mapHash: 'b'.repeat(64), selector: { kind: 'insert', start: { itemId: 'p1-i0', offset: 4 }, affinity: 'after' } };
    api.resolveSelection('source/id', 'render/id', selection);
    expect(signingRequest).toHaveBeenLastCalledWith('post', 'signing-v2/word/source%2Fid/authoring-renders/render%2Fid/selections', selection);
});

test('native draft uses the reviewed final PDF hash, locale and idempotency key without file or inferred signer payloads', () => {
    const payload = { expectedPdfHash: 'f'.repeat(64), locale: 'he' };
    api.nativeDraft('preview/id', payload, 'one-operation');
    expect(signingRequest).toHaveBeenCalledTimes(1);
    expect(signingRequest).toHaveBeenCalledWith('post', 'signing-v2/word/previews/preview%2Fid/native-draft', payload,
        { headers: { 'Idempotency-Key': 'one-operation' } });
});

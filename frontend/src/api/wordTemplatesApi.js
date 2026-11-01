import { signingRequest } from './signingTemplatesApi';

const root = 'signing-v2/word';
const wordTemplatesApi = {
    list: () => signingRequest('get', root),
    create: payload => signingRequest('post', root, payload),
    load: id => signingRequest('get', `${root}/${encodeURIComponent(id)}`),
    save: (id, payload) => signingRequest('put', `${root}/${encodeURIComponent(id)}`, payload),
    preview: (id, payload, idempotencyKey) => signingRequest('post', `${root}/${encodeURIComponent(id)}/previews`, payload,
        { headers: { 'Idempotency-Key': idempotencyKey } }),
    pdf: id => signingRequest('get', `${root}/previews/${encodeURIComponent(id)}/pdf`, null, { responseType: 'blob' }),
    previewInfo: id => signingRequest('get', `${root}/previews/${encodeURIComponent(id)}`),
    authoringRender: (id, payload) => signingRequest('post', `${root}/${encodeURIComponent(id)}/authoring-renders`, payload),
    authoringInfo: id => signingRequest('get', `${root}/authoring-renders/${encodeURIComponent(id)}`),
    authoringPdf: id => signingRequest('get', `${root}/authoring-renders/${encodeURIComponent(id)}/pdf`, null, { responseType: 'blob' }),
    resolveSelection: (id, renderId, payload) => signingRequest('post', `${root}/${encodeURIComponent(id)}/authoring-renders/${encodeURIComponent(renderId)}/selections`, payload),
    nativeDraft: (id, payload, idempotencyKey) => signingRequest('post', `${root}/previews/${encodeURIComponent(id)}/native-draft`, payload,
        { headers: { 'Idempotency-Key': idempotencyKey } }),
};
export default wordTemplatesApi;

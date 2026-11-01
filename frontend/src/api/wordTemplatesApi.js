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
};
export default wordTemplatesApi;

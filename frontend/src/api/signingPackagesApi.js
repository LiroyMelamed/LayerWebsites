import { signingRequest } from './signingTemplatesApi';

const root = 'signing-v2';
function query(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
    });
    return search.toString();
}
const participant = (packageId, personId) => `${root}/packages/${packageId}/participants/${personId}`;

const signingPackagesApi = {
    list: (filters, config) => signingRequest('get', `${root}/submissions?${query(filters)}`, null, config),
    packages: (id, filters, config) => signingRequest('get', `${root}/submissions/${id}/packages?${query(filters)}`, null, config),
    details: (id, config) => signingRequest('get', `${root}/packages/${id}`, null, config),
    previewAction: (packageId, personId, body, config) => signingRequest('post', `${participant(packageId, personId)}/action-preview`, body, config),
    executeAction: (packageId, personId, body, idempotencyKey) => signingRequest('post', `${participant(packageId, personId)}/actions`, body,
        { headers: { 'Idempotency-Key': idempotencyKey } }),
    operation: (id, config) => signingRequest('get', `${root}/operations/${id}`, null, config),
};

export default signingPackagesApi;

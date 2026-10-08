import ApiUtils from './apiUtils';

export async function signingRequest(method, url, data, config) {
    const result = method === 'get' ? await ApiUtils.get(url, config) : await ApiUtils[method](url, data, config);
    if (!result.success) {
        const error = new Error(result.data?.message || result.data?.error?.message || result.message || 'הפעולה לא הושלמה. אפשר לנסות שוב');
        error.status = result.status;
        error.code = result.data?.code || result.data?.errorCode;
        error.messageKey = result.data?.messageKey;
        error.fieldErrors = result.data?.fieldErrors || [];
        throw error;
    }
    return result.data;
}
const templates = 'signing-templates';const batches = 'signing-batches';
const api = {
    list: () => signingRequest('get', templates),
    load: id => signingRequest('get', `${templates}/${id}`),
    save: (definition, id, version) => signingRequest(id ? 'put' : 'post', id ? `${templates}/${id}` : templates, { ...definition, expectedVersion: version }),
    archive: (id, version) => signingRequest('post', `${templates}/${id}/archive`, { expectedVersion: version }),
    pdf: (id, documentId) => signingRequest('get', `${templates}/${id}/documents/${documentId}/pdf`, null, { responseType: 'blob' }),
    contacts: (q, audience) => {
        const lawyer = audience === true || audience === 'lawyer';
        const clients = audience === 'client';
        return signingRequest('get', `${batches}/contacts?q=${encodeURIComponent(q)}&lawyer=${lawyer ? 1 : 0}&clients=${clients ? 1 : 0}`);
    },
    workbook: id => signingRequest('get', `${batches}/workbook/${id}`, null, { responseType: 'blob' }),
    importWorkbook: (id, base64) => signingRequest('post', `${batches}/workbook/${id}/preview`, { base64 }),
    create: payload => signingRequest('post', batches, payload),
    batches: () => signingRequest('get', batches),
    batch: id => signingRequest('get', `${batches}/${id}`),
    send: id => signingRequest('post', `${batches}/${id}/send`, {}),
    completion: id => signingRequest('post', `${batches}/${id}/completion`, {}),
    downloadPackage: (id, index) => signingRequest('get', `${batches}/${id}/packages/${index}/download`, null, { responseType: 'blob' }),
    link: (id, recipientId) => signingRequest('post', `${batches}/${id}/recipients/${recipientId}/link`, {}),
};
export default api;

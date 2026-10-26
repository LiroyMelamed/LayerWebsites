import ApiUtils from './apiUtils';
async function request(method, path = '', officeId, body) {
    const options = { params: officeId && officeId !== 'dedicated' ? { officeId } : {} };
    const response = method === 'get' || method === 'delete'
        ? await ApiUtils[method](`office-integrations${path}`, options)
        : await ApiUtils[method](`office-integrations${path}`, body || {}, options);
    if (!response.success) throw new Error(response.message || 'הפעולה לא הושלמה');
    return response.data;
}
export const officeIntegrationsApi = {
    offices: () => request('get', '/offices'),
    snapshot: id => request('get', '/settings', id),
    saveCourt: (id, body) => request('put', '/court', id, body),
    seedDemo: id => request('post', '/court/demo-cases', id),
    linkCourt: (id, body) => request('put', '/court/mapping', id, body),
    syncCourt: id => request('post', '/court/sync', id),
    saveWhatsapp: (id, body) => request('put', '/whatsapp', id, body),
    startSignup: id => request('post', '/whatsapp/signup', id),
    completeSignup: (id, body) => request('post', '/whatsapp/signup/complete', id, body),
    checkWhatsapp: id => request('post', '/whatsapp/check', id),
    disconnect: id => request('delete', '/whatsapp', id),
    previewGroup: (id, caseId) => request('post', `/whatsapp/demo/${caseId}`, id),
    caseUpdates: caseId => request('get', `/cases/${caseId}`),
};

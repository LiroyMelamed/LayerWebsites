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
    startLinkedDevice: (id, body) => request('post', '/whatsapp/linked-device/start', id, body),
    linkedDeviceQr: id => request('get', '/whatsapp/linked-device/qr', id),
    checkLinkedDevice: id => request('post', '/whatsapp/linked-device/check', id),
    disconnectLinkedDevice: id => request('delete', '/whatsapp/linked-device', id),
    setWhatsappContactPermission: (id, body) => request('post', '/whatsapp/contacts/permission', id, body),
    reviewWhatsappGroups: id => request('post', '/whatsapp/groups/recheck', id),
    pauseWhatsappSafety: id => request('post', '/whatsapp/safety/pause', id),
    resumeWhatsappSafety: (id, body) => request('post', '/whatsapp/safety/resume', id, body),
    disconnect: id => request('delete', '/whatsapp', id),
    previewGroup: (id, caseId) => request('post', `/whatsapp/demo/${caseId}`, id),
    caseUpdates: caseId => request('get', `/cases/${caseId}`),
};

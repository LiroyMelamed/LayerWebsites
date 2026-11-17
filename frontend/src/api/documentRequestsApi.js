import ApiUtils from './apiUtils';
const root = caseId => `Cases/${caseId}/document-requests`;
const api = {
    list: async caseId => (await ApiUtils.get(root(caseId))).data,
    save: async (caseId, body) => (await ApiUtils.put(root(caseId), body)).data,
    action: async (caseId, id, body) => (await ApiUtils.post(`${root(caseId)}/${id}/action`, body)).data,
    transition: async caseId => (await ApiUtils.get(`${root(caseId)}/transition`)).data,
};
export default api;

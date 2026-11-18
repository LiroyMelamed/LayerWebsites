import ApiUtils from './apiUtils';
const root = caseId => `Cases/${caseId}/document-requests`;
// Every visible stage reads the same case response. Share only the in-flight
// request, never completed customer data, and never across login sessions.
const pending = new Map();
function unwrap(response) {
    if (!response?.success) {
        const error = new Error(response?.message || 'Document request failed');
        error.response = response;
        throw error;
    }
    return response.data;
}
const api = {
    list: caseId => {
        const key = String(caseId);
        const token = localStorage.getItem('token');
        const current = pending.get(key);
        if (current?.token === token) return current.promise;
        const entry = { token };
        entry.promise = ApiUtils.get(root(caseId)).then(unwrap).finally(() => {
            if (pending.get(key) === entry) pending.delete(key);
        });
        pending.set(key, entry);
        return entry.promise;
    },
    save: async (caseId, body) => unwrap(await ApiUtils.put(root(caseId), body)),
    action: async (caseId, id, body) => unwrap(await ApiUtils.post(`${root(caseId)}/${id}/action`, body)),
    transition: async caseId => unwrap(await ApiUtils.get(`${root(caseId)}/transition`)),
};
export default api;

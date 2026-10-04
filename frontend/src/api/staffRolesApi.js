import ApiUtils from "./apiUtils";

const BASE = "staff";

function unwrap(res) {
    if (res && res.success === true && Object.prototype.hasOwnProperty.call(res, "data")) {
        return res.data;
    }
    return res;
}

export const staffRolesApi = {
    getPermissionCatalog: async () => unwrap(await ApiUtils.get(`${BASE}/permission-catalog`)),
    getSessionScope: async () => unwrap(await ApiUtils.get(`${BASE}/session-scope`)),
    listRoles: async () => unwrap(await ApiUtils.get(`${BASE}/roles`)),
    createRole: async (payload) => unwrap(await ApiUtils.post(`${BASE}/roles`, payload)),
    updateRole: async (roleId, payload) => unwrap(await ApiUtils.patch(`${BASE}/roles/${roleId}`, payload)),
    deactivateRole: async (roleId) => unwrap(await ApiUtils.delete(`${BASE}/roles/${roleId}`)),
    listEmployees: async () => unwrap(await ApiUtils.get(`${BASE}/employees`)),
    createEmployee: async (payload) => unwrap(await ApiUtils.post(`${BASE}/employees`, payload)),
    updateEmployee: async (userId, payload) => unwrap(await ApiUtils.patch(`${BASE}/employees/${userId}`, payload)),
};

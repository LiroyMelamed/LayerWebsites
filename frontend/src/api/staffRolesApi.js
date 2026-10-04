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
    getRolloutSummary: async () => unwrap(await ApiUtils.get(`${BASE}/rollout-summary`)),
    listOfficeUsers: async (name = "") => {
        const q = name ? `?name=${encodeURIComponent(name)}` : "";
        return unwrap(await ApiUtils.get(`${BASE}/users${q}`));
    },
    assignUserFirmStaffRole: async (userId, firmStaffRoleId) =>
        unwrap(
            await ApiUtils.patch(`${BASE}/users/${userId}/firm-staff-role`, {
                firmStaffRoleId: firmStaffRoleId ?? null,
            }),
        ),
};

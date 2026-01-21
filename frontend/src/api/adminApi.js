import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";
import { demoOk, getDemoState } from "../demo/demoStore";

const GET_ADMINS_ENDPOINT = "Admins/GetAdmins";
const ADD_ADMIN_ENDPOINT = "Admins/AddAdmin";
const GET_ADMIN_BY_NAME_ENDPOINT = "Admins/GetAdminByName?name=";
const UPDATE_ADMIN_BY_ID_ENDPOINT = "Admins/UpdateAdmin/";
const DELETE_ADMIN_BY_ID_ENDPOINT = "Admins/DeleteAdmin/";

export const adminApi = {
    getAllAdmins: async () => {
        if (isDemoModeEnabled()) {
            const s = getDemoState();
            const admins = s ? Array.from(s.adminsById.values()) : [];
            return demoOk(admins, GET_ADMINS_ENDPOINT);
        }
        return await ApiUtils.get(GET_ADMINS_ENDPOINT);
    },

    addAdmin: async (adminData) => {
        return await ApiUtils.post(ADD_ADMIN_ENDPOINT, adminData);
    },

    getAdminByName: async (name) => {
        if (isDemoModeEnabled()) {
            const s = getDemoState();
            const q = String(name || "").trim().toLowerCase();
            const all = s ? Array.from(s.adminsById.values()) : [];
            const res = all.filter((a) => String(a?.name || "").toLowerCase().includes(q));
            return demoOk(res, `${GET_ADMIN_BY_NAME_ENDPOINT}${encodeURIComponent(name || "")}`);
        }
        return await ApiUtils.get(`${GET_ADMIN_BY_NAME_ENDPOINT}${encodeURIComponent(name)}`);
    },

    updateAdmin: async (adminId, adminData) => {
        return await ApiUtils.put(`${UPDATE_ADMIN_BY_ID_ENDPOINT}${adminId}`, adminData);
    },

    deleteAdmin: async (adminId) => {
        return await ApiUtils.delete(`${DELETE_ADMIN_BY_ID_ENDPOINT}${adminId}`);
    }
}

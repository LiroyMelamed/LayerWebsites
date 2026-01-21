import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";
import {
    demoOk,
    demoNotFound,
    demoListCustomers,
    demoSearchCustomersByName,
    demoCreateCustomer,
    demoUpdateCustomer,
    demoDeleteCustomer,
} from "../demo/demoStore";

const UPDATE_CURRENT_CUSTOMER = "Customers/UpdateCurrentCustomer/";
const GET_CUSTOMERS_BY_NAME = "Customers/GetCustomerByName";
const GET_CURRENT_CUSTOMER = "Customers/GetCurrentCustomer";
const UPDATE_CUSTOMER = "Customers/UpdateCustomer/";
const DELETE_CUSTOMER = "Customers/DeleteCustomer/";
const GET_ALL_CUSTOMERS = "Customers/GetCustomers";
const ADD_CUSTOMER = "Customers/AddCustomer";

export const customersApi = {
    getAllCustomers: async () => {
        if (isDemoModeEnabled()) {
            return demoOk(demoListCustomers(), GET_ALL_CUSTOMERS);
        }
        return await ApiUtils.get(GET_ALL_CUSTOMERS);
    },

    getCurrentCustomer: async () => {
        if (isDemoModeEnabled()) {
            return demoOk(demoListCustomers()[0] || null, GET_CURRENT_CUSTOMER);
        }
        return await ApiUtils.get(GET_CURRENT_CUSTOMER);
    },

    getCustomersByName: async (userName) => {
        if (isDemoModeEnabled()) {
            const res = demoSearchCustomersByName(userName);
            return demoOk(res, `${GET_CUSTOMERS_BY_NAME}?userName=${encodeURIComponent(userName || "")}`);
        }
        return await ApiUtils.get(`${GET_CUSTOMERS_BY_NAME}?userName=${encodeURIComponent(userName)}`);
    },

    addCustomer: async (customerData) => {
        if (isDemoModeEnabled()) {
            const created = demoCreateCustomer(customerData || {});
            return demoOk(created, ADD_CUSTOMER);
        }
        return await ApiUtils.post(ADD_CUSTOMER, customerData);
    },

    updateCustomerById: async (userId, customerData) => {
        if (isDemoModeEnabled()) {
            const updated = demoUpdateCustomer(userId, customerData || {});
            if (!updated) return demoNotFound("customer not found", `${UPDATE_CUSTOMER}${userId}`);
            return demoOk(updated, `${UPDATE_CUSTOMER}${userId}`);
        }
        return await ApiUtils.put(`${UPDATE_CUSTOMER}${userId}`, customerData);
    },

    updateCurrentCustomer: async (customerData) => {
        if (isDemoModeEnabled()) {
            const currentId = demoListCustomers()[0]?.UserId ?? demoListCustomers()[0]?.userid;
            const updated = currentId ? demoUpdateCustomer(currentId, customerData || {}) : null;
            return demoOk(updated, `${UPDATE_CURRENT_CUSTOMER}`);
        }
        return await ApiUtils.put(`${UPDATE_CURRENT_CUSTOMER}`, customerData);
    },

    deleteCustomerById: async (userId) => {
        if (isDemoModeEnabled()) {
            const ok = demoDeleteCustomer(userId);
            return ok ? demoOk({ ok: true }, `${DELETE_CUSTOMER}${userId}`) : demoNotFound("customer not found", `${DELETE_CUSTOMER}${userId}`);
        }
        return await ApiUtils.delete(`${DELETE_CUSTOMER}${userId}`);
    }
};

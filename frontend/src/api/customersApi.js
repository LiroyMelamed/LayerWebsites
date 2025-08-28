import ApiUtils from "./apiUtils";

const UPDATE_CURRENT_CUSTOMER = "Customers/UpdateCurrentCustomer/";
const GET_CUSTOMERS_BY_NAME = "Customers/GetCustomerByName";
const GET_CURRENT_CUSTOMER = "Customers/GetCurrentCustomer";
const UPDATE_CUSTOMER = "Customers/UpdateCustomer/";
const DELETE_CUSTOMER = "Customers/DeleteCustomer/";
const GET_ALL_CUSTOMERS = "Customers/GetCustomers";
const ADD_CUSTOMER = "Customers/AddCustomer";

export const customersApi = {
    getAllCustomers: async () => {
        return await ApiUtils.get(GET_ALL_CUSTOMERS);
    },

    getCurrentCustomer: async () => {
        return await ApiUtils.get(GET_CURRENT_CUSTOMER);
    },

    getCustomersByName: async (userName) => {
        return await ApiUtils.get(`${GET_CUSTOMERS_BY_NAME}?userName=${encodeURIComponent(userName)}`);
    },

    addCustomer: async (customerData) => {
        return await ApiUtils.post(ADD_CUSTOMER, customerData);
    },

    updateCustomerById: async (userId, customerData) => {
        return await ApiUtils.put(`${UPDATE_CUSTOMER}${userId}`, customerData);
    },

    updateCurrentCustomer: async (customerData) => {
        return await ApiUtils.put(`${UPDATE_CURRENT_CUSTOMER}`, customerData);
    },

    deleteCustomerById: async (userId) => {
        return await ApiUtils.delete(`${DELETE_CUSTOMER}${userId}`);
    }
};

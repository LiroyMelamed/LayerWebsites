import ApiUtils from "./apiUtils";

const GET_CUSTOMERS_BY_NAME = "/GetCustomerByName";
const UPDATE_CUSTOMER = "/UpdateCustomer/";
const DELETE_CUSTOMER = "/DeleteCustomer/";
const GET_ALL_CUSTOMERS = "/GetCustomers";
const ADD_CUSTOMER = "/AddCustomer";

export const customersApi = {
    getAllCustomers: async () => {
        return await ApiUtils.get(GET_ALL_CUSTOMERS);
    },

    getCustomersByName: async (userName) => {
        return await ApiUtils.get(`${GET_CUSTOMERS_BY_NAME}?userName=${encodeURIComponent(userName)}`);
    },

    addCustomer: async (customerData) => {
        console.log('customerData', customerData);

        return await ApiUtils.post(ADD_CUSTOMER, customerData);
    },

    updateCustomerById: async (customerId, customerData) => {
        return await ApiUtils.put(`${UPDATE_CUSTOMER}${customerId}`, customerData);
    },

    deleteCustomerById: async (customerId) => {
        return await ApiUtils.delete(`${DELETE_CUSTOMER}${customerId}`);
    }
};

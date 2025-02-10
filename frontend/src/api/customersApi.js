import ApiUtils from "./apiUtils";

const GET_ALL_CUSTOMERS = "/GetCustomers";
const ADD_CUSTOMER = "/AddCustomer";
const UPDATE_CUSTOMER = "/GetCustomer/";

export const customersApi = {
    getAllCustomers: async () => {
        return await ApiUtils.get(GET_ALL_CUSTOMERS);
    },

    addCustomer: async (customerData) => {
        return await ApiUtils.post(ADD_CUSTOMER, customerData);
    },

    updateCustomerById: async (customerId, customerData) => {
        return await ApiUtils.put(`${UPDATE_CUSTOMER}${customerId}`, customerData);
    }
};

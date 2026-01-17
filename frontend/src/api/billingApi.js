import ApiUtils from "./apiUtils";

const base = "billing";

const billingApi = {
    getPlan: async () => {
        return await ApiUtils.get(`${base}/plan`);
    },

    getUsage: async () => {
        return await ApiUtils.get(`${base}/usage`);
    },
};

export default billingApi;

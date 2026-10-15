import ApiUtils from "./apiUtils";

const GET_COMPLIANCE_STATUS = "compliance/status";

const complianceApi = {
    getStatus: async () => {
        return await ApiUtils.get(GET_COMPLIANCE_STATUS);
    },
};

export default complianceApi;

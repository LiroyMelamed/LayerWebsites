import ApiUtils from "./apiUtils";

const GET_ALL_CASES = "/GetCases";
const GET_CASE_BY_ID = "/GetCase/";
const GET_CASE_BY_NAME = "/GetCaseByName?caseName=";
const ADD_CASE = "/AddCase";
const UPDATE_CASE = "/UpdateCase/";
const GET_TAGGED_CASES = "/TaggedCases";
const GET_MAIN_SCREEN_DATA = "/GetMainScreenData";

const GET_ALL_CASES_TYPE = "/GetCasesType";
const GET_CASE_TYPE_BY_ID = "/GetCaseType/";
const GET_CASE_TYPE_BY_NAME = "/GetCaseTypeByName?caseTypeName=";
const ADD_CASE_TYPE = "/AddCaseType";
const DELETE_CASE_TYPE = "/DeleteCaseType/";
const UPDATE_CASE_TYPE = "/UpdateCaseType/";

const casesApi = {
  getMainScreenData: async () => {
    return await ApiUtils.get(GET_MAIN_SCREEN_DATA);
  },

  getAllCases: async () => {
    return await ApiUtils.get(GET_ALL_CASES);
  },

  getAllTaggedCases: async () => {
    return await ApiUtils.get(GET_TAGGED_CASES);
  },

  getCaseById: async (caseId) => {
    return await ApiUtils.get(`${GET_CASE_BY_ID}${caseId}`);
  },

  getCaseByName: async (caseName) => {
    return await ApiUtils.get(`${GET_CASE_BY_NAME}${encodeURIComponent(caseName)}`);
  },

  addCase: async (caseData) => {
    return await ApiUtils.post(ADD_CASE, caseData);
  },

  updateCaseById: async (caseId, caseData) => {
    return await ApiUtils.put(`${UPDATE_CASE}${caseId}`, caseData);
  }
};

export const casesTypeApi = {
  getAllCasesType: async () => {
    return await ApiUtils.get(GET_ALL_CASES_TYPE);
  },

  getCaseTypeById: async (caseTypeId) => {
    return await ApiUtils.get(`${GET_CASE_TYPE_BY_ID}${caseTypeId}`);
  },

  getCaseTypeByName: async (caseTypeName) => {
    return await ApiUtils.get(`${GET_CASE_TYPE_BY_NAME}${encodeURIComponent(caseTypeName)}`);
  },

  deleteCaseType: async (caseTypeName) => {
    return await ApiUtils.delete(`${DELETE_CASE_TYPE}${encodeURIComponent(caseTypeName)}`);
  },

  addCaseType: async (caseTypeData) => {
    return await ApiUtils.post(ADD_CASE_TYPE, caseTypeData);
  },

  updateCaseTypeById: async (caseTypeId, caseTypeData) => {
    return await ApiUtils.put(`${UPDATE_CASE_TYPE}${caseTypeId}`, caseTypeData);
  }
};

export default casesApi;

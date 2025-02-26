import ApiUtils from "./apiUtils";

const GET_ALL_CASES = "/GetCases";
const GET_CASE_BY_ID = "/GetCase/";
const GET_CASE_BY_NAME = "/GetCaseByName?caseName=";
const ADD_CASE = "/AddCase";
const TAG_CASE = "/TagCase/";
const DELETE_CASE = "/DeleteCase/";
const UPDATE_CASE = "/UpdateCase/";
const UPDATE_STAGE = "/UpdateStage/";
const GET_TAGGED_CASES = "/TaggedCases";
const GET_TAGGED_CASES_BY_NAME = "/TaggedCasesByName?caseName=";

const GET_MAIN_SCREEN_DATA = "/GetMainScreenData";

const GET_CASE_TYPE_BY_NAME = "/GetCaseTypeByName?caseTypeName=";
const DELETE_CASE_TYPE = "/DeleteCaseType/";
const GET_CASE_TYPE_BY_ID = "/GetCaseType/";
const UPDATE_CASE_TYPE = "/UpdateCaseType/";
const GET_ALL_CASES_TYPE = "/GetCasesType";
const GET_ALL_CASES_TYPE_FOR_FILTER = "/GetCasesTypeForFilter";
const ADD_CASE_TYPE = "/AddCaseType";

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
    console.log('caseData', caseData);
    return await ApiUtils.post(ADD_CASE, caseData);
  },

  updateCaseById: async (CaseId, caseData) => {
    console.log('updateCaseById', CaseId, caseData);
    return await ApiUtils.put(`${UPDATE_CASE}${CaseId}`, caseData);
  },

  updateStageById: async (CaseId, caseData) => {
    console.log('updateStageById', CaseId, caseData);
    return await ApiUtils.put(`${UPDATE_STAGE}${CaseId}`, caseData);
  },

  deleteCaseById: async (CaseId) => {
    return await ApiUtils.delete(`${DELETE_CASE}${CaseId}`);
  },

  tagCaseById: async (CaseId, caseData) => {
    console.log('tagCaseById', CaseId, caseData);
    return await ApiUtils.put(`${TAG_CASE}${CaseId}`, caseData);
  },

  getTaggedCaseByName: async (caseName) => {
    console.log('getTaggedCaseByName', caseName);
    return await ApiUtils.get(`${GET_TAGGED_CASES_BY_NAME}${encodeURIComponent(caseName)}`);
  }
};

export const casesTypeApi = {
  getAllCasesType: async () => {
    return await ApiUtils.get(GET_ALL_CASES_TYPE);
  },

  getAllCasesTypeForFilter: async () => {
    return await ApiUtils.get(GET_ALL_CASES_TYPE_FOR_FILTER);
  },

  getCaseTypeById: async (caseTypeId) => {
    return await ApiUtils.get(`${GET_CASE_TYPE_BY_ID}${caseTypeId}`);
  },

  getCaseTypeByName: async (caseTypeName) => {
    return await ApiUtils.get(`${GET_CASE_TYPE_BY_NAME}${encodeURIComponent(caseTypeName)}`);
  },

  deleteCaseTypeById: async (CaseTypeId) => {
    console.log('deleteCaseTypeById', CaseTypeId);
    return await ApiUtils.delete(`${DELETE_CASE_TYPE}${encodeURIComponent(CaseTypeId)}`);
  },

  addCaseType: async (caseTypeData) => {
    console.log('addCaseType', caseTypeData);

    return await ApiUtils.post(ADD_CASE_TYPE, caseTypeData);
  },

  updateCaseTypeById: async (caseTypeId, caseTypeData) => {
    console.log('updateCaseTypeById', caseTypeData);

    return await ApiUtils.put(`${UPDATE_CASE_TYPE}${caseTypeId}`, caseTypeData);
  }
};

export default casesApi;

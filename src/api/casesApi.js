// src/services/casesApi.js
import { getData, setData, removeData } from '../services/apiUtils';

const ALL_CASES_DATA_ENDPOINT = 'cases';
const SPECIFIC_CASE_DATA_ENDPOINT = 'cases/';

export const casesApi = {
  getAllCases: async () => {
    const allCases = await getData(ALL_CASES_DATA_ENDPOINT);
    const casesArray = Object.values(allCases);
    return casesArray;
  },

  getAllTagedCases: async () => {
    const allCases = await getData(ALL_CASES_DATA_ENDPOINT);
    return Object.values(allCases).filter(caseItem => caseItem.IsTagged === true);
  },

  getCaseByName: async ({ caseName }) => {
    const allCases = await getData(ALL_CASES_DATA_ENDPOINT);
    const casesArray = Object.values(allCases);
    const filteredCases = casesArray.filter((caseItem) =>
      caseItem.CaseName && caseItem.CaseName.includes(caseName)
    );
    return filteredCases.length > 0 ? filteredCases : [];
  },

  updateCaseById: async (caseId, caseData) => {
    return setData(SPECIFIC_CASE_DATA_ENDPOINT + caseId, caseData);
  },

  createCase: async (caseData) => {
    const newCaseKey = caseData.CaseName.replace(/[^a-zA-Z0-9_-]/g, '_'); // Use `CaseName` from the state
    return setData(`cases/${newCaseKey}`, caseData);
  },

  // New function to remove a case by caseId
  removeCase: async (caseId) => {
    return removeData(SPECIFIC_CASE_DATA_ENDPOINT + caseId);
  },
};

const CASES_TYPE_DATA_ENDPOINT = 'casesType/';

export const casesTypeApi = {
  getAllCasesType: async () => {
    const allCases = await getData(CASES_TYPE_DATA_ENDPOINT);
    const casesArray = Object.values(allCases);
    return casesArray;
  },

  getCaseTypeByName: async ({ caseTypeName }) => {
    const allCases = await getData(CASES_TYPE_DATA_ENDPOINT);
    const casesArray = Object.values(allCases);

    const filteredCases = casesArray.filter((caseItem) =>
      caseItem.CaseTypeName && caseItem.CaseTypeName.includes(caseTypeName)
    );

    return filteredCases.length > 0 ? filteredCases : [];
  },

  createOrUpdateCaseType: async ({ caseTypeName, caseTypeData }) => {
    console.log("caseTypeName", caseTypeName, caseTypeData);

    return setData(CASES_TYPE_DATA_ENDPOINT + caseTypeName, caseTypeData);
  },
};

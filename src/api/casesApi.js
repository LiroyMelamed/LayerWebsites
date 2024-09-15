// src/services/casesApi.js
import { getData, setData, removeData } from '../services/apiUtils';

const ALL_CASES_DATA_ENDPOINT = 'cases';
const SPECIFIC_CASE_DATA_ENDPOINT = 'cases/';

export const casesApi = {
  getAllCases: async () => {
    return getData(ALL_CASES_DATA_ENDPOINT);
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

const CASES_TYPE_DATA_ENDPOINT = 'cases_type/';

export const casesTypeApi = {
  createOrUpdateCaseType: async (caseTypeId, caseTypeData) => {
    return setData(CASES_TYPE_DATA_ENDPOINT + caseTypeId, caseTypeData);
  },
};

// src/services/casesApi.js
import { getData, setData } from '../services/apiUtils';

const ALL_CASES_DATA_ENDPOINT = 'cases';
const SPECIFIC_CASE_DATA_ENDPOINT = 'cases/';

export const casesApi = {
  getAllCases: async () => {
    return getData(ALL_CASES_DATA_ENDPOINT);
  },

  getAllTagedCases: async () => {
    const allCases = await getData(ALL_CASES_DATA_ENDPOINT);
    return allCases ? Object.values(allCases).filter(caseItem => caseItem.tag === true) : [];
  },

  getCaseByName: async (caseName) => {
    return getData(SPECIFIC_CASE_DATA_ENDPOINT + caseName);
  },

  updateCaseById: async (caseId, caseData) => {
    return setData(SPECIFIC_CASE_DATA_ENDPOINT + caseId, caseData);
  },
};



const CASES_TYPE_DATA_ENDPOINT = 'cases_type/';

export const casesTypeApi = {
  // Create or update a case type
  createOrUpdateCaseType: async (caseTypeId, caseTypeData) => {
    return setData(CASES_TYPE_DATA_ENDPOINT + caseTypeId, caseTypeData);
  },
};

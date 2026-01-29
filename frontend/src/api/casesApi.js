import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";
import {
  demoOk,
  demoNotFound,
  demoListCases,
  demoSearchCasesByName,
  demoGetCaseById,
  demoCreateCase,
  demoUpdateCase,
  demoDeleteCase,
  demoListCustomers,
  demoListCaseTypes,
  demoSearchCaseTypesByName,
  demoAddCaseType,
  demoUpdateCaseType,
  demoDeleteCaseType,
} from "../demo/demoStore";

const GET_ALL_CASES = "Cases/GetCases";
const GET_MY_CASES = "Cases/my";
const GET_CASE_BY_ID = "Cases/GetCase/";
const GET_CASE_BY_NAME = "Cases/GetCaseByName?caseName=";
const ADD_CASE = "Cases/AddCase";
const TAG_CASE = "Cases/TagCase/";
const DELETE_CASE = "Cases/DeleteCase/";
const UPDATE_CASE = "Cases/UpdateCase/";
const UPDATE_STAGE = "Cases/UpdateStage/";
const GET_TAGGED_CASES = "Cases/TaggedCases";
const LINK_WHATSAPP_GROUP = "Cases/LinkWhatsappGroup/";
const GET_TAGGED_CASES_BY_NAME = "Cases/TaggedCasesByName?caseName=";

const GET_MAIN_SCREEN_DATA = "Data/GetMainScreenData";

const GET_CASE_TYPE_BY_NAME = "CaseTypes/GetCaseTypeByName?caseTypeName=";
const DELETE_CASE_TYPE = "CaseTypes/DeleteCaseType/";
const GET_CASE_TYPE_BY_ID = "CaseTypes/GetCaseType/";
const UPDATE_CASE_TYPE = "CaseTypes/UpdateCaseType/";
const GET_ALL_CASES_TYPE = "CaseTypes/GetCasesType";
const GET_ALL_CASES_TYPE_FOR_FILTER = "CaseTypes/GetCasesTypeForFilter";
const ADD_CASE_TYPE = "CaseTypes/AddCaseType";

const casesApi = {
  getMainScreenData: async () => {
    if (isDemoModeEnabled()) {
      const all = demoListCases();
      const numberOfClosed = all.filter((c) => c.IsClosed).length;
      const numberOfTagged = all.filter((c) => c.IsTagged).length;
      const allCustomers = demoListCustomers();
      const activeCustomerIds = new Set(all.filter((c) => !c.IsClosed && c?.UserId != null).map((c) => c.UserId));
      const activeCustomers = allCustomers.filter((c) => activeCustomerIds.has(c.UserId));
      return demoOk(
        {
          AllCasesData: all,
          NumberOfClosedCases: numberOfClosed,
          NumberOfTaggedCases: numberOfTagged,
          ActiveCustomers: activeCustomers,
          AllCustomersData: allCustomers,
        },
        GET_MAIN_SCREEN_DATA
      );
    }
    return await ApiUtils.get(GET_MAIN_SCREEN_DATA);
  },

  getAllCases: async () => {
    if (isDemoModeEnabled()) {
      return demoOk(demoListCases(), GET_ALL_CASES);
    }
    return await ApiUtils.get(GET_ALL_CASES);
  },

  getMyCases: async () => {
    if (isDemoModeEnabled()) {
      return demoOk(demoListCases(), GET_MY_CASES);
    }
    return await ApiUtils.get(GET_MY_CASES);
  },

  getAllTaggedCases: async () => {
    if (isDemoModeEnabled()) {
      const tagged = demoListCases().filter((c) => c.IsTagged);
      return demoOk(tagged, GET_TAGGED_CASES);
    }
    return await ApiUtils.get(GET_TAGGED_CASES);
  },

  getCaseById: async (caseId) => {
    if (isDemoModeEnabled()) {
      const found = demoGetCaseById(caseId);
      if (!found) return demoNotFound("case not found", `${GET_CASE_BY_ID}${caseId}`);
      return demoOk(found, `${GET_CASE_BY_ID}${caseId}`);
    }
    return await ApiUtils.get(`${GET_CASE_BY_ID}${caseId}`);
  },

  getCaseByName: async (caseName) => {
    if (isDemoModeEnabled()) {
      const res = demoSearchCasesByName(caseName);
      return demoOk(res, `${GET_CASE_BY_NAME}${encodeURIComponent(caseName)}`);
    }
    return await ApiUtils.get(`${GET_CASE_BY_NAME}${encodeURIComponent(caseName)}`);
  },

  addCase: async (caseData) => {
    if (isDemoModeEnabled()) {
      const created = demoCreateCase(caseData || {});
      return demoOk(created, ADD_CASE);
    }
    return await ApiUtils.post(ADD_CASE, caseData);
  },

  updateCaseById: async (CaseId, caseData) => {
    if (isDemoModeEnabled()) {
      const updated = demoUpdateCase(CaseId, caseData || {});
      if (!updated) return demoNotFound("case not found", `${UPDATE_CASE}${CaseId}`);
      return demoOk(updated, `${UPDATE_CASE}${CaseId}`);
    }
    return await ApiUtils.put(`${UPDATE_CASE}${CaseId}`, caseData);
  },

  updateStageById: async (CaseId, caseData) => {
    if (isDemoModeEnabled()) {
      const updated = demoUpdateCase(CaseId, caseData || {});
      if (!updated) return demoNotFound("case not found", `${UPDATE_STAGE}${CaseId}`);
      return demoOk(updated, `${UPDATE_STAGE}${CaseId}`);
    }
    return await ApiUtils.put(`${UPDATE_STAGE}${CaseId}`, caseData);
  },

  deleteCaseById: async (CaseId) => {
    if (isDemoModeEnabled()) {
      const ok = demoDeleteCase(CaseId);
      return ok ? demoOk({ ok: true }, `${DELETE_CASE}${CaseId}`) : demoNotFound("case not found", `${DELETE_CASE}${CaseId}`);
    }
    return await ApiUtils.delete(`${DELETE_CASE}${CaseId}`);
  },

  tagCaseById: async (CaseId, caseData) => {
    if (isDemoModeEnabled()) {
      const updated = demoUpdateCase(CaseId, caseData || {});
      if (!updated) return demoNotFound("case not found", `${TAG_CASE}${CaseId}`);
      return demoOk(updated, `${TAG_CASE}${CaseId}`);
    }
    return await ApiUtils.put(`${TAG_CASE}${CaseId}`, caseData);
  },

  getTaggedCaseByName: async (caseName) => {
    if (isDemoModeEnabled()) {
      const q = String(caseName || "").toLowerCase();
      const res = demoListCases().filter(
        (c) => c?.IsTagged && String(c?.CaseName || "").toLowerCase().includes(q)
      );
      return demoOk(res, `${GET_TAGGED_CASES_BY_NAME}${encodeURIComponent(caseName)}`);
    }
    return await ApiUtils.get(`${GET_TAGGED_CASES_BY_NAME}${encodeURIComponent(caseName)}`);
  },

  linkWhatsappGroup: async (CaseId, whatsappLink) => {
    if (isDemoModeEnabled()) {
      const updated = demoUpdateCase(CaseId, { WhatsappGroupLink: whatsappLink });
      if (!updated) return demoNotFound("case not found", `${LINK_WHATSAPP_GROUP}${CaseId}`);
      return demoOk(updated, `${LINK_WHATSAPP_GROUP}${CaseId}`);
    }
    return await ApiUtils.put(`${LINK_WHATSAPP_GROUP}${CaseId}`, whatsappLink);
  },
};

export const casesTypeApi = {
  getAllCasesType: async () => {
    if (isDemoModeEnabled()) {
      const items = demoListCaseTypes();
      return demoOk(items, GET_ALL_CASES_TYPE);
    }
    return await ApiUtils.get(GET_ALL_CASES_TYPE);
  },

  getAllCasesTypeForFilter: async () => {
    if (isDemoModeEnabled()) {
      const items = demoListCaseTypes().map((ct) => ct.CaseTypeName);
      return demoOk(items, GET_ALL_CASES_TYPE_FOR_FILTER);
    }
    return await ApiUtils.get(GET_ALL_CASES_TYPE_FOR_FILTER);
  },

  getCaseTypeById: async (caseTypeId) => {
    if (isDemoModeEnabled()) {
      const found = demoListCaseTypes().find((ct) => String(ct.CaseTypeId) === String(caseTypeId));
      if (!found) return demoNotFound("case type not found", `${GET_CASE_TYPE_BY_ID}${caseTypeId}`);
      return demoOk(found, `${GET_CASE_TYPE_BY_ID}${caseTypeId}`);
    }
    return await ApiUtils.get(`${GET_CASE_TYPE_BY_ID}${caseTypeId}`);
  },

  getCaseTypeByName: async (caseTypeName) => {
    if (isDemoModeEnabled()) {
      const res = demoSearchCaseTypesByName(caseTypeName);
      return demoOk(res, `${GET_CASE_TYPE_BY_NAME}${encodeURIComponent(caseTypeName || "")}`);
    }
    return await ApiUtils.get(`${GET_CASE_TYPE_BY_NAME}${encodeURIComponent(caseTypeName)}`);
  },

  deleteCaseTypeById: async (CaseTypeId) => {
    if (isDemoModeEnabled()) {
      const ok = demoDeleteCaseType(CaseTypeId);
      return ok
        ? demoOk({ ok: true }, `${DELETE_CASE_TYPE}${encodeURIComponent(CaseTypeId)}`)
        : demoNotFound("case type not found", `${DELETE_CASE_TYPE}${encodeURIComponent(CaseTypeId)}`);
    }
    return await ApiUtils.delete(`${DELETE_CASE_TYPE}${encodeURIComponent(CaseTypeId)}`);
  },

  addCaseType: async (caseTypeData) => {
    if (isDemoModeEnabled()) {
      const created = demoAddCaseType(caseTypeData || {});
      return demoOk(created, ADD_CASE_TYPE);
    }
    return await ApiUtils.post(ADD_CASE_TYPE, caseTypeData);
  },

  updateCaseTypeById: async (caseTypeId, caseTypeData) => {
    if (isDemoModeEnabled()) {
      const updated = demoUpdateCaseType(caseTypeId, caseTypeData || {});
      return updated
        ? demoOk(updated, `${UPDATE_CASE_TYPE}${caseTypeId}`)
        : demoNotFound("case type not found", `${UPDATE_CASE_TYPE}${caseTypeId}`);
    }
    return await ApiUtils.put(`${UPDATE_CASE_TYPE}${caseTypeId}`, caseTypeData);
  }
};

export default casesApi;

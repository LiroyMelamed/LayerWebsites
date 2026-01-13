// src/api/evidenceDocumentsApi.js
import ApiUtils from "./apiUtils";

const base = "evidence-documents";

function toQuery(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v == null || v === "") continue;
        sp.set(k, String(v));
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
}

const evidenceDocumentsApi = {
    list: async ({ q, customerId, caseId, signingFileId, from, to, limit, cursor } = {}) => {
        return await ApiUtils.get(
            `${base}${toQuery({ q, customerId, caseId, signingFileId, from, to, limit, cursor })}`
        );
    },
};

export default evidenceDocumentsApi;

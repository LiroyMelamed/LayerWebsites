// src/api/evidenceDocumentsApi.js
import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";
import { demoOk, demoListEvidenceDocuments } from "../demo/demoStore";

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
        if (isDemoModeEnabled()) {
            const query = String(q || "").trim().toLowerCase();
            const wantCaseId = caseId != null && String(caseId).trim() !== "" ? String(caseId).trim() : null;
            const wantSigningFileId = signingFileId != null && String(signingFileId).trim() !== "" ? String(signingFileId).trim() : null;

            let items = demoListEvidenceDocuments().map((p) => ({
                signingFileId: p.signingFileId,
                caseId: p.caseId,
                clientDisplayName: p.clientDisplayName,
                caseDisplayName: p.caseDisplayName,
                documentDisplayName: p.documentDisplayName,
                signedAtUtc: p.signedAtUtc,
                otpPolicy: p.otpPolicy,
                evidenceZipAvailable: Boolean(p.evidenceZipBlob),
            }));

            if (wantSigningFileId) {
                items = items.filter((it) => String(it.signingFileId) === wantSigningFileId);
            }
            if (wantCaseId) {
                items = items.filter((it) => String(it.caseId) === wantCaseId);
            }
            if (query) {
                items = items.filter((it) => {
                    const text = [it.clientDisplayName, it.caseDisplayName, it.documentDisplayName, it.caseId, it.signingFileId]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                    return text.includes(query);
                });
            }

            // Demo: ignore cursor-based pagination, but honor limit.
            const take = Number(limit || 50);
            const sliced = Number.isFinite(take) && take > 0 ? items.slice(0, take) : items;
            return demoOk({ items: sliced, nextCursor: null }, `${base}${toQuery({ q, customerId, caseId, signingFileId, from, to, limit, cursor })}`);
        }
        return await ApiUtils.get(
            `${base}${toQuery({ q, customerId, caseId, signingFileId, from, to, limit, cursor })}`
        );
    },
};

export default evidenceDocumentsApi;

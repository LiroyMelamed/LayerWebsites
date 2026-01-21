// src/api/signingFilesApi.js
import ApiUtils from "./apiUtils";
import { isDemoModeEnabled } from "../utils/demoMode";
import {
    demoOk,
    demoNotFound,
    demoCreateSigningFile,
    demoUpdateSigningStatus,
    demoGetSigningFile,
    demoListSigningFiles,
    demoGetOrCreateUploadObjectUrl,
    demoStoreUpload,
    demoCreateNotification,
} from "../demo/demoStore";

function demoSigningFileDetails(signingFileId) {
    const file = demoGetSigningFile(signingFileId) || demoListSigningFiles()[0];
    if (!file) return null;

    return {
        file: {
            SigningFileId: file.SigningFileId,
            FileName: file.FileName,
            CaseId: file.CaseId,
            CaseName: file.CaseName,
            ClientName: file.ClientName,
            OtpEnabled: true,
            RequireOtp: Boolean(file.RequireOtp),
            SigningPolicyVersion: "2026-01-11",
        },
        signatureSpots: file.signatureSpots || [],
    };
}

const base = "SigningFiles";

const signingFilesApi = {
    uploadFileForSigning: async (data) => {
        if (isDemoModeEnabled()) {
            const created = demoCreateSigningFile({
                caseId: data?.caseId ?? null,
                clientId: data?.clientId ?? null,
                fileName: data?.fileName,
                fileKey: data?.fileKey,
                requireOtp: data?.requireOtp,
            });
            if (created) {
                created.signatureSpots = Array.isArray(data?.signatureLocations) ? data.signatureLocations : [];

                const displayName = created.FileName || "מסמך";
                demoCreateNotification({
                    title: "נשלח אליך מסמך לחתימה",
                    message: `מסמך חדש: ${displayName}`,
                });
            }
            return demoOk({ ok: true, file: created }, `${base}/upload`);
        }
        return await ApiUtils.post(`${base}/upload`, data);
    },

    updateSigningPolicy: async (signingFileId, { requireOtp, otpWaiverAcknowledged }) => {
        if (isDemoModeEnabled()) {
            return demoOk({ ok: true, requireOtp, otpWaiverAcknowledged }, `${base}/${signingFileId}/policy`);
        }
        return await ApiUtils.patch(`${base}/${signingFileId}/policy`, {
            requireOtp,
            otpWaiverAcknowledged,
        });
    },

    getClientSigningFiles: async () => {
        if (isDemoModeEnabled()) {
            return demoOk({ files: demoListSigningFiles() }, `${base}/client-files`);
        }
        return await ApiUtils.get(`${base}/client-files`);
    },

    getLawyerSigningFiles: async () => {
        if (isDemoModeEnabled()) {
            return demoOk({ files: demoListSigningFiles() }, `${base}/lawyer-files`);
        }
        return await ApiUtils.get(`${base}/lawyer-files`);
    },

    getSigningFileDetails: async (signingFileId) => {
        if (isDemoModeEnabled()) {
            const details = demoSigningFileDetails(signingFileId);
            if (!details) return demoNotFound("signing file not found", `${base}/${signingFileId}`);
            return demoOk(details, `${base}/${signingFileId}`);
        }
        return await ApiUtils.get(`${base}/${signingFileId}`);
    },

    createPublicSigningLink: async (signingFileId, signerUserId = null) => {
        if (isDemoModeEnabled()) {
            return demoOk({ token: "demo-public-token" }, `${base}/${signingFileId}/public-link`);
        }
        return await ApiUtils.post(`${base}/${signingFileId}/public-link`, signerUserId ? { signerUserId } : {});
    },

    getPublicSigningFileDetails: async (token) => {
        if (isDemoModeEnabled()) {
            const details = demoSigningFileDetails("sf_demo_1");
            return demoOk(details, `${base}/public/${encodeURIComponent(token)}`);
        }
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}`);
    },

    publicRequestSigningOtp: async (token, signingSessionId) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true }, `${base}/public/${encodeURIComponent(token)}/otp/request`);
        return await ApiUtils.post(
            `${base}/public/${encodeURIComponent(token)}/otp/request`,
            {},
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    publicVerifySigningOtp: async (token, otp, signingSessionId) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true, verified: true }, `${base}/public/${encodeURIComponent(token)}/otp/verify`);
        return await ApiUtils.post(
            `${base}/public/${encodeURIComponent(token)}/otp/verify`,
            { otp },
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    publicSignFile: async (token, body, config = undefined) => {
        if (isDemoModeEnabled()) {
            demoUpdateSigningStatus("sf_demo_1", "signed");
            return demoOk({ ok: true, status: "signed" }, `${base}/public/${encodeURIComponent(token)}/sign`);
        }
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/sign`, body, config);
    },

    publicRejectSigning: async (token, body) => {
        if (isDemoModeEnabled()) {
            demoUpdateSigningStatus("sf_demo_1", "rejected");
            return demoOk({ ok: true, status: "rejected" }, `${base}/public/${encodeURIComponent(token)}/reject`);
        }
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/reject`, body);
    },

    getSavedSignature: async () => {
        if (isDemoModeEnabled()) return demoOk({ exists: false, url: null }, `${base}/saved-signature`);
        return await ApiUtils.get(`${base}/saved-signature`);
    },

    getSavedSignatureDataUrl: async () => {
        if (isDemoModeEnabled()) return demoOk({ exists: false, dataUrl: null }, `${base}/saved-signature/data-url`);
        return await ApiUtils.get(`${base}/saved-signature/data-url`);
    },

    saveSavedSignature: async (signatureImage) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true }, `${base}/saved-signature`);
        return await ApiUtils.post(`${base}/saved-signature`, { signatureImage });
    },

    getPublicSavedSignature: async (token) => {
        if (isDemoModeEnabled()) return demoOk({ exists: false, url: null }, `${base}/public/${encodeURIComponent(token)}/saved-signature`);
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}/saved-signature`);
    },

    getPublicSavedSignatureDataUrl: async (token) => {
        if (isDemoModeEnabled()) return demoOk({ exists: false, dataUrl: null }, `${base}/public/${encodeURIComponent(token)}/saved-signature/data-url`);
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}/saved-signature/data-url`);
    },

    savePublicSavedSignature: async (token, signatureImage) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true }, `${base}/public/${encodeURIComponent(token)}/saved-signature`);
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/saved-signature`, { signatureImage });
    },

    signFile: async (signingFileId, body, config = undefined) => {
        if (isDemoModeEnabled()) {
            demoUpdateSigningStatus(signingFileId, "signed");
            return demoOk({ ok: true, status: "signed" }, `${base}/${signingFileId}/sign`);
        }
        return await ApiUtils.post(`${base}/${signingFileId}/sign`, body, config);
    },

    requestSigningOtp: async (signingFileId, signingSessionId) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true }, `${base}/${signingFileId}/otp/request`);
        return await ApiUtils.post(
            `${base}/${signingFileId}/otp/request`,
            {},
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    verifySigningOtp: async (signingFileId, otp, signingSessionId) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true, verified: true }, `${base}/${signingFileId}/otp/verify`);
        return await ApiUtils.post(
            `${base}/${signingFileId}/otp/verify`,
            { otp },
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    getEvidencePackage: async (signingFileId) => {
        if (isDemoModeEnabled()) return demoOk({ ok: true }, `${base}/${signingFileId}/evidence`);
        return await ApiUtils.get(`${base}/${signingFileId}/evidence`);
    },

    rejectSigning: async (signingFileId, body) => {
        if (isDemoModeEnabled()) {
            demoUpdateSigningStatus(signingFileId, "rejected");
            return demoOk({ ok: true, status: "rejected" }, `${base}/${signingFileId}/reject`);
        }
        return await ApiUtils.post(`${base}/${signingFileId}/reject`, body);
    },

    reuploadFile: async (signingFileId, body) => {
        return await ApiUtils.post(`${base}/${signingFileId}/reupload`, body);
    },

    downloadSignedFile: async (signingFileId) => {
        if (isDemoModeEnabled()) {
            const file = demoGetSigningFile(signingFileId);
            if (!file) return demoNotFound("signing file not found", `${base}/${signingFileId}/download`);

            let fileKey = file.FileKey;
            if (!fileKey) {
                const blob = new Blob(["Demo signed PDF"], { type: "application/pdf" });
                const uploaded = demoStoreUpload({
                    key: null,
                    fileName: file.FileName || "signed-demo.pdf",
                    ext: "pdf",
                    mime: "application/pdf",
                    size: blob.size,
                    blob,
                });
                fileKey = uploaded?.key;
            }

            const url = fileKey ? demoGetOrCreateUploadObjectUrl(fileKey) : null;
            return demoOk({ downloadUrl: url }, `${base}/${signingFileId}/download`);
        }
        return await ApiUtils.get(`${base}/${signingFileId}/download`);
    },

    detectSignatureSpots: async (fileKey, signers = null) => {
        const payload = { fileKey };
        if (signers) {
            payload.signers = signers;
        }
        if (isDemoModeEnabled()) {
            const signer0 = Array.isArray(signers) && signers.length ? signers[0] : null;
            const signer1 = Array.isArray(signers) && signers.length > 1 ? signers[1] : null;
            return demoOk(
                {
                    spots: [
                        {
                            pageNum: 1,
                            x: 120,
                            y: 520,
                            width: 180,
                            height: 60,
                            signerIndex: 0,
                            signerUserId: signer0?.userId,
                            signerName: signer0?.name,
                            isRequired: true,
                            type: "signature",
                        },
                        {
                            pageNum: 1,
                            x: 120,
                            y: 620,
                            width: 220,
                            height: 60,
                            signerIndex: signer1 ? 1 : 0,
                            signerUserId: signer1?.userId ?? signer0?.userId,
                            signerName: signer1?.name ?? signer0?.name,
                            isRequired: true,
                            type: "signature",
                        },
                    ],
                },
                `${base}/detect-spots`
            );
        }

        return await ApiUtils.post(`${base}/detect-spots`, payload);
    },
};

export default signingFilesApi;

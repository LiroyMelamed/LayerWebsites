// src/api/signingFilesApi.js
import ApiUtils from "./apiUtils";

const base = "SigningFiles";

const signingFilesApi = {
    uploadFileForSigning: async (data) => {
        return await ApiUtils.post(`${base}/upload`, data);
    },

    updateSigningPolicy: async (signingFileId, { requireOtp, otpWaiverAcknowledged }) => {
        return await ApiUtils.patch(`${base}/${signingFileId}/policy`, {
            requireOtp,
            otpWaiverAcknowledged,
        });
    },

    getClientSigningFiles: async () => {
        return await ApiUtils.get(`${base}/client-files`);
    },

    getLawyerSigningFiles: async () => {
        return await ApiUtils.get(`${base}/lawyer-files`);
    },

    getSigningFileDetails: async (signingFileId) => {
        return await ApiUtils.get(`${base}/${signingFileId}`);
    },

    createPublicSigningLink: async (signingFileId, signerUserId = null) => {
        return await ApiUtils.post(`${base}/${signingFileId}/public-link`, signerUserId ? { signerUserId } : {});
    },

    getPublicSigningFileDetails: async (token) => {
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}`);
    },

    publicRequestSigningOtp: async (token, signingSessionId) => {
        return await ApiUtils.post(
            `${base}/public/${encodeURIComponent(token)}/otp/request`,
            {},
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    publicVerifySigningOtp: async (token, otp, signingSessionId) => {
        return await ApiUtils.post(
            `${base}/public/${encodeURIComponent(token)}/otp/verify`,
            { otp },
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    publicSignFile: async (token, body, config = undefined) => {
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/sign`, body, config);
    },

    publicRejectSigning: async (token, body) => {
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/reject`, body);
    },

    getSavedSignature: async () => {
        return await ApiUtils.get(`${base}/saved-signature`);
    },

    getSavedSignatureDataUrl: async () => {
        return await ApiUtils.get(`${base}/saved-signature/data-url`);
    },

    saveSavedSignature: async (signatureImage) => {
        return await ApiUtils.post(`${base}/saved-signature`, { signatureImage });
    },

    getPublicSavedSignature: async (token) => {
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}/saved-signature`);
    },

    getPublicSavedSignatureDataUrl: async (token) => {
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}/saved-signature/data-url`);
    },

    savePublicSavedSignature: async (token, signatureImage) => {
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/saved-signature`, { signatureImage });
    },

    signFile: async (signingFileId, body, config = undefined) => {
        return await ApiUtils.post(`${base}/${signingFileId}/sign`, body, config);
    },

    requestSigningOtp: async (signingFileId, signingSessionId) => {
        return await ApiUtils.post(
            `${base}/${signingFileId}/otp/request`,
            {},
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    verifySigningOtp: async (signingFileId, otp, signingSessionId) => {
        return await ApiUtils.post(
            `${base}/${signingFileId}/otp/verify`,
            { otp },
            signingSessionId ? { headers: { "x-signing-session-id": signingSessionId } } : undefined
        );
    },

    getEvidencePackage: async (signingFileId) => {
        return await ApiUtils.get(`${base}/${signingFileId}/evidence`);
    },

    rejectSigning: async (signingFileId, body) => {
        return await ApiUtils.post(`${base}/${signingFileId}/reject`, body);
    },

    reuploadFile: async (signingFileId, body) => {
        return await ApiUtils.post(`${base}/${signingFileId}/reupload`, body);
    },

    deleteSigningFile: async (signingFileId) => {
        return await ApiUtils.delete(`${base}/${signingFileId}`);
    },

    downloadSignedFile: async (signingFileId) => {
        return await ApiUtils.get(`${base}/${signingFileId}/download`);
    },

    detectSignatureSpots: async (fileKey, signers = null) => {
        const payload = { fileKey };
        if (signers) {
            payload.signers = signers;
        }
        return await ApiUtils.post(`${base}/detect-spots`, payload);
    },
};

export default signingFilesApi;

// src/api/signingFilesApi.js
import ApiUtils from "./apiUtils";

const base = "SigningFiles";

const signingFilesApi = {
    uploadFileForSigning: async (data) => {
        return await ApiUtils.post(`${base}/upload`, data);
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

    publicSignFile: async (token, body) => {
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/sign`, body);
    },

    publicRejectSigning: async (token, body) => {
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/reject`, body);
    },

    getSavedSignature: async () => {
        return await ApiUtils.get(`${base}/saved-signature`);
    },

    saveSavedSignature: async (signatureImage) => {
        return await ApiUtils.post(`${base}/saved-signature`, { signatureImage });
    },

    getPublicSavedSignature: async (token) => {
        return await ApiUtils.get(`${base}/public/${encodeURIComponent(token)}/saved-signature`);
    },

    savePublicSavedSignature: async (token, signatureImage) => {
        return await ApiUtils.post(`${base}/public/${encodeURIComponent(token)}/saved-signature`, { signatureImage });
    },

    signFile: async (signingFileId, body) => {
        return await ApiUtils.post(`${base}/${signingFileId}/sign`, body);
    },

    rejectSigning: async (signingFileId, body) => {
        return await ApiUtils.post(`${base}/${signingFileId}/reject`, body);
    },

    reuploadFile: async (signingFileId, body) => {
        return await ApiUtils.post(`${base}/${signingFileId}/reupload`, body);
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

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

import apiUtils from "./apiUtils";

export const filesApi = {
    presignUpload: async ({ ext, mime }) => {
        return await apiUtils.get(
            `files/presign-upload?ext=${encodeURIComponent(ext)}&mime=${encodeURIComponent(mime)}`
        );
    },
    presignRead: async (key) => {
        return await apiUtils.get(
            `files/presign-read?key=${encodeURIComponent(key)}`
        );
    },

    // Stage file endpoints
    getStageFiles: async (caseId) => {
        return await apiUtils.get(`files/stage-files/${caseId}`);
    },
    addStageFile: async (caseId, stage, fileData) => {
        return await apiUtils.post(`files/stage-files/${caseId}/${stage}`, fileData);
    },
    deleteStageFile: async (fileId) => {
        return await apiUtils.delete(`files/stage-files/${fileId}`);
    },
    readStageFile: async (fileId, requestConfig) => {
        if (requestConfig && typeof requestConfig === "object" && !Array.isArray(requestConfig)) {
            return await apiUtils.get(`files/stage-file-read/${fileId}`, requestConfig);
        }
        return await apiUtils.get(`files/stage-file-read/${fileId}`);
    },
};

export default filesApi;

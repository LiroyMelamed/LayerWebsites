import apiUtils from "./apiUtils";

export const filesApi = {
    uploadFile: async (file) => {
        const form = new FormData();
        form.append("file", file);
        return await apiUtils.post("files/upload", form, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },

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
    readStageFile: async (fileId) => {
        return await apiUtils.get(`files/stage-file-read/${fileId}`);
    },
};

export default filesApi;

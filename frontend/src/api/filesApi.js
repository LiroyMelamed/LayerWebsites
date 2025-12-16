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
};

export default filesApi;

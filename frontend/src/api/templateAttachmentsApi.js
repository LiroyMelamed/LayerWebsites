import ApiUtils from "./apiUtils";

const base = "template-attachments";

export const templateAttachmentsApi = {
    /** List attachments for a template */
    list: async (templateType, templateKey) => {
        return await ApiUtils.get(base, { params: { templateType, templateKey } });
    },

    /** Upload attachment file */
    upload: async (templateType, templateKey, file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("templateType", templateType);
        formData.append("templateKey", templateKey);
        return await ApiUtils.post(`${base}/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },

    /** Delete attachment by ID */
    delete: async (id) => {
        return await ApiUtils.delete(`${base}/${id}`);
    },
};

export default templateAttachmentsApi;

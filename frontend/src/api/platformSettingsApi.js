import ApiUtils from "./apiUtils";

const base = "platform-settings";

export const platformSettingsApi = {
    /** Get all settings + notification channels */
    getAll: async () => {
        return await ApiUtils.get(base);
    },

    /** Bulk update settings */
    updateSettings: async (settings) => {
        return await ApiUtils.put(base, { settings });
    },

    /** Update a single setting */
    updateSingle: async (category, key, value) => {
        return await ApiUtils.put(`${base}/single`, { category, key, value });
    },

    /** Get notification channels */
    getChannels: async () => {
        return await ApiUtils.get(`${base}/channels`);
    },

    /** Update a notification channel */
    updateChannel: async (type, data) => {
        return await ApiUtils.put(`${base}/channels/${type}`, data);
    },

    /** List platform admins */
    getAdmins: async () => {
        return await ApiUtils.get(`${base}/admins`);
    },

    /** Add platform admin */
    addAdmin: async (data) => {
        return await ApiUtils.post(`${base}/admins`, data);
    },

    /** Remove platform admin */
    removeAdmin: async (userId) => {
        return await ApiUtils.delete(`${base}/admins/${userId}`);
    },

    /** Get email templates (read-only) */
    getEmailTemplates: async () => {
        return await ApiUtils.get(`${base}/email-templates`);
    },

    /** Update an email template */
    updateEmailTemplate: async (templateKey, data) => {
        return await ApiUtils.put(`${base}/email-templates/${templateKey}`, data);
    },

    /** List knowledge documents */
    getKnowledgeDocs: async () => {
        return await ApiUtils.get(`${base}/knowledge-docs`);
    },

    /** Upload a knowledge document (FormData with 'file' + optional 'title') */
    uploadKnowledgeDoc: async (file, title) => {
        const formData = new FormData();
        formData.append("file", file);
        if (title) formData.append("title", title);
        return await ApiUtils.post(`${base}/knowledge-docs`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },

    /** Delete a knowledge document */
    deleteKnowledgeDoc: async (docId) => {
        return await ApiUtils.delete(`${base}/knowledge-docs/${docId}`);
    },
};

export default platformSettingsApi;

import ApiUtils from "./apiUtils";

const base = "reminders";

const remindersApi = {
    /** Fetch available email templates */
    getTemplates: async () => {
        return await ApiUtils.get(`${base}/templates`);
    },

    /** Import reminders from an Excel/CSV file */
    importReminders: async (file, templateKey, sendHour, sendMinute) => {
        const formData = new FormData();
        formData.append("file", file);
        if (templateKey) formData.append("templateKey", templateKey);
        if (sendHour != null) formData.append("sendHour", String(sendHour));
        if (sendMinute != null) formData.append("sendMinute", String(sendMinute));
        return await ApiUtils.post(`${base}/import`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },

    /** List reminders with optional filters */
    listReminders: async ({ status, page = 1, limit = 50 } = {}) => {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        params.append("page", String(page));
        params.append("limit", String(limit));
        return await ApiUtils.get(`${base}?${params.toString()}`);
    },

    /** Cancel a PENDING reminder */
    cancelReminder: async (id) => {
        return await ApiUtils.put(`${base}/${id}/cancel`);
    },

    /** Update a PENDING reminder */
    updateReminder: async (id, fields) => {
        return await ApiUtils.put(`${base}/${id}`, fields);
    },

    /** Permanently delete a reminder */
    deleteReminder: async (id) => {
        return await ApiUtils.delete(`${base}/${id}`);
    },

    /** List custom reminder templates */
    listCustomTemplates: async () => {
        return await ApiUtils.get(`${base}/custom-templates`);
    },

    /** Create a custom reminder template */
    createCustomTemplate: async (data) => {
        return await ApiUtils.post(`${base}/custom-templates`, data);
    },

    /** Update a custom reminder template */
    updateCustomTemplate: async (id, data) => {
        return await ApiUtils.put(`${base}/custom-templates/${id}`, data);
    },

    /** Delete a custom reminder template */
    deleteCustomTemplate: async (id) => {
        return await ApiUtils.delete(`${base}/custom-templates/${id}`);
    },

    /** Download example Excel for a template key */
    downloadTemplateExcel: async (key) => {
        const res = await ApiUtils.get(`${base}/templates/${key}/example-excel`, { responseType: 'blob' });
        const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reminder-example-${key}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
};

export default remindersApi;

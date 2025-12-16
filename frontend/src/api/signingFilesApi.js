// src/api/signingFilesApi.js
import ApiUtils from "./apiUtils";

const BASE = "SigningFiles";

const signingFilesApi = {
    // עו"ד מעלה קובץ לחתימה
    uploadFileForSigning: async (data) => {
        return await ApiUtils.post(`${BASE}/upload`, data);
    },

    // כל המסמכים של הלקוח (pending + signed + rejected)
    getClientSigningFiles: async () => {
        return await ApiUtils.get(`${BASE}/client-files`);
    },

    // כל המסמכים שעו"ד שלח
    getLawyerSigningFiles: async () => {
        return await ApiUtils.get(`${BASE}/lawyer-files`);
    },

    // פרטי מסמך + מקומות חתימה
    getSigningFileDetails: async (signingFileId) => {
        return await ApiUtils.get(`${BASE}/${signingFileId}`);
    },

    // לקוח חותם על מקום אחד
    signFile: async (signingFileId, body) => {
        return await ApiUtils.post(`${BASE}/${signingFileId}/sign`, body);
    },

    // לקוח דוחה מסמך
    rejectSigning: async (signingFileId, body) => {
        return await ApiUtils.post(`${BASE}/${signingFileId}/reject`, body);
    },

    // עו"ד מעלה מחדש מסמך שנדחה
    reuploadFile: async (signingFileId, body) => {
        return await ApiUtils.post(`${BASE}/${signingFileId}/reupload`, body);
    },

    // הורדת קובץ חתום – מחזיר downloadUrl (לא blob)
    downloadSignedFile: async (signingFileId) => {
        return await ApiUtils.get(`${BASE}/${signingFileId}/download`);
    },
};

export default signingFilesApi;

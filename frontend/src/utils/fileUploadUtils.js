// frontend/src/utils/fileUploadUtils.js
import filesApi from "../api/filesApi";
import { isDemoModeEnabled } from "./demoMode";
import { demoGetUpload, demoStoreUpload } from "../demo/demoStore";

// uploads a file to r2 using the existing backend presign endpoints
// note: we intentionally don't use axios in screens; for the presigned url PUT we use fetch

export const uploadFileToR2 = async (file) => {
    try {
        if (!file) {
            return { success: false, data: null, message: "missing file" };
        }

        if (isDemoModeEnabled()) {
            const fileName = file.name || "file";
            const parts = fileName.split(".");
            const ext = (parts.length > 1 ? parts[parts.length - 1] : "pdf").toLowerCase();
            const mime = file.type || "application/octet-stream";
            const key = `demo://${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

            demoStoreUpload({
                key,
                fileName,
                ext,
                mime,
                size: file.size,
                blob: file,
            });

            return {
                success: true,
                key,
                data: {
                    key,
                    fileName,
                    ext,
                    mime,
                    size: file.size,
                },
            };
        }

        const fileName = file.name || "file";
        const parts = fileName.split(".");
        const ext = (parts.length > 1 ? parts[parts.length - 1] : "pdf").toLowerCase();
        const mime = file.type || "application/octet-stream";

        const presignResponse = await filesApi.presignUpload({ ext, mime });
        const uploadUrl = presignResponse?.data?.uploadUrl;
        const key = presignResponse?.data?.key;

        if (!presignResponse?.success || !uploadUrl || !key) {
            return {
                success: false,
                data: null,
                message: presignResponse?.message || "failed to get upload url",
            };
        }

        const putResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                "Content-Type": mime,
            },
            body: file,
        });

        if (!putResponse.ok) {
            const errText = await putResponse.text().catch(() => "");
            return {
                success: false,
                data: null,
                message: `upload failed (${putResponse.status}) ${errText}`,
            };
        }

        return {
            success: true,
            data: {
                key,
                fileName,
                ext,
                mime,
                size: file.size,
            },
        };
    } catch (err) {
        console.error("uploadFileToR2 error:", err);
        return {
            success: false,
            data: null,
            message: err?.message || "upload failed",
        };
    }
};

export const getFileReadUrl = async (key) => {
    try {
        if (!key) {
            return { success: false, data: null, message: "missing key" };
        }

        if (isDemoModeEnabled()) {
            const item = demoGetUpload(key);
            if (!item?.blob) {
                return { success: false, data: null, message: "file not found" };
            }

            const readUrl = URL.createObjectURL(item.blob);
            return { success: true, data: { readUrl, expiresIn: 60 * 60 } };
        }

        const response = await filesApi.presignRead(key);
        const readUrl = response?.data?.readUrl;

        if (!response?.success || !readUrl) {
            return {
                success: false,
                data: null,
                message: response?.message || "failed to get read url",
            };
        }

        return { success: true, data: { readUrl, expiresIn: response?.data?.expiresIn } };
    } catch (err) {
        console.error("getFileReadUrl error:", err);
        return {
            success: false,
            data: null,
            message: err?.message || "failed to get read url",
        };
    }
};

export default {
    uploadFileToR2,
    getFileReadUrl,
};
